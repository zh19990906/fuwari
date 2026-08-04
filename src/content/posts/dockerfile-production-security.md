---
title: 生产 Dockerfile：多阶段构建、缓存、非 root 用户与供应链安全
published: 2026-08-04
updated: 2026-08-04
description: 构建体积更小、权限更低且可验证的生产镜像，覆盖 multi-stage、缓存、基础镜像固定、BuildKit Secret、SBOM 和扫描。
tags: [Docker, Dockerfile, BuildKit, 容器安全, SBOM]
category: Docker
contentType: docs
docGroup: docker
docSection: 镜像构建
docOrder: 80
draft: false
---

生产镜像不仅要“能启动”，还要可重复构建、最小化运行权限、减少不必要软件和提供供应链证据。把编译器、包管理缓存、测试工具和源码全部留在最终镜像中，会增加体积和攻击面。

本文以 Python Web 服务为例，原则同样适用于 Node.js、Go 和其他应用。

## 使用 multi-stage 构建

```dockerfile
# syntax=docker/dockerfile:1

FROM python:3.13-slim@sha256:REPLACE_WITH_VERIFIED_DIGEST AS builder

WORKDIR /build
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --require-hashes -r requirements.txt

FROM python:3.13-slim@sha256:REPLACE_WITH_VERIFIED_DIGEST AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app app

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app app ./app

USER app
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

builder 阶段包含安装工具，runtime 阶段只保留运行所需文件。构建阶段仍然不应注入会被写进镜像层的真实密钥。

## 选择并固定基础镜像

优先使用：

- 官方或组织维护的可信镜像；
- 与应用需求匹配的最小变体；
- 明确的语言和系统版本；
- 定期更新并重新构建；
- 生产发布使用经过验证的 digest。

标签可能被重新指向，digest 是不可变内容标识。固定 digest 会让更新变成显式动作，因此需要 Dependabot 或其他自动化及时提出更新 PR。

不要因为追求最小体积就盲目切换基础发行版。原生依赖、证书、时区、调试能力和漏洞修复渠道同样重要。

## .dockerignore 控制构建上下文

```text
.git
.github
.venv
__pycache__
.pytest_cache
.mypy_cache
.env
secrets/
tests/
docs/
dist/
*.log
```

`.dockerignore` 可以减少发送给 BuildKit 的内容，并避免意外把密钥、Git 历史和本地缓存复制进构建上下文。即使文件没有 `COPY`，也不应把敏感目录发送给不受控的远程 Builder。

## 按变化频率排列 COPY

错误顺序：

```dockerfile
COPY . .
RUN pip install -r requirements.txt
```

任何源码变化都会让依赖安装缓存失效。

更好的顺序：

```dockerfile
COPY requirements.txt .
RUN pip install --require-hashes -r requirements.txt
COPY app ./app
```

先复制变化较少的依赖清单，再复制源码。依赖文件变化时才重新安装。

## 依赖锁定和哈希

生产构建应使用锁文件或哈希校验，避免同一个版本范围在不同日期解析为不同依赖集合。

```text
fastapi==X.Y.Z \
    --hash=sha256:REPLACE_WITH_PACKAGE_HASH
```

示例中的版本和哈希必须由项目实际锁定工具生成，不能复制虚构值。更新依赖后运行测试并重新扫描镜像。

## 不安装无关软件

Debian/Ubuntu 基础镜像安装系统包时：

```dockerfile
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
```

将 `apt-get update` 和安装放在同一个 `RUN` 中，避免缓存旧索引。不要在运行镜像中保留编译器、SSH 服务、编辑器和网络诊断全集；必要排障工具可以通过临时调试容器提供。

## 使用非 root USER

```dockerfile
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app app
USER app
```

容器内 root 不等于宿主机 root，但运行时逃逸或错误挂载会放大高权限影响。应用不需要特权时必须切换到非 root 用户。

固定 UID/GID 有助于卷权限可预测。不要使用 `chmod -R 777` 解决权限问题，应明确目录所有者和最小读写权限。

## 只读文件系统和临时目录

Dockerfile 声明运行用户后，在 Compose 中进一步限制：

```yaml
services:
  web:
    read_only: true
    tmpfs:
      - /tmp:size=64m,mode=1777
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
```

应用需要写入的持久数据放到明确卷或外部存储。只读根文件系统可以发现应用把状态错误地写入容器层的问题。

## BuildKit Secret

构建需要访问私有依赖时，不要使用 `ARG` 或 `ENV` 传入凭据，因为它们可能出现在镜像历史或构建元数据中。

```dockerfile
RUN --mount=type=secret,id=pip_config,target=/etc/pip.conf \
    pip install -r requirements.txt
```

构建命令：

```bash
docker build \
  --secret id=pip_config,src="$HOME/.config/pip/pip.conf" \
  -t blog-api:build .
```

Secret 只在该构建步骤临时挂载。仍需确认安装工具不会把认证信息复制到缓存和最终产物。

## 不把运行时 Secret 烘焙进镜像

错误做法包括：

- `COPY .env /app/.env`；
- 在 Dockerfile 中设置数据库密码；
- 把云凭据写进配置文件后构建；
- 将私钥保留在 builder 产物目录。

运行时通过平台 Secret、受限文件或外部密钥管理系统注入，并限制进程和日志访问。

## ENTRYPOINT 与信号

使用 exec JSON 形式：

```dockerfile
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Shell 形式可能让应用不是 PID 1 的直接子进程，影响 SIGTERM 传播。应用要处理优雅关闭：停止接收请求、完成有界任务、关闭连接池并在超时前退出。

## HEALTHCHECK 放在哪里

健康检查可以放在 Dockerfile 或 Compose。通用镜像可提供基础检查，部署环境可以覆盖具体参数。

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["python", "-m", "app.healthcheck"]
```

镜像检查命令必须真的存在于 runtime 阶段。不要为了 `curl` healthcheck 在最小镜像中额外安装大量工具。

## 构建检查和测试

```bash
docker build --check .
docker build --pull --tag blog-api:test .
docker run --rm blog-api:test python -m pytest -q
```

更常见的是在 builder 测试阶段运行测试，再只复制运行产物。无论哪种方式，CI 必须验证最终镜像能够以非 root 用户启动并通过健康检查。

## SBOM、来源证明与漏洞扫描

SBOM 记录镜像包含的软件组件，便于漏洞响应和许可证审查。

```bash
docker sbom blog-api:test
```

扫描示例：

```bash
docker scout cves blog-api:test
```

扫描结果需要风险分级：

- 漏洞是否存在于最终 runtime 阶段；
- 受影响代码路径是否可达；
- 是否有已修复基础镜像；
- 是否需要立即阻止发布；
- 接受风险是否有负责人和到期时间。

不要只扫描依赖清单而忽略基础系统包。CI 还可以生成构建来源证明并签名镜像，部署端验证来源。

## Rootless Docker 的边界

Docker Rootless 模式让守护进程和容器以非 root 用户运行，降低守护进程和运行时漏洞的宿主机影响。它与 Dockerfile 中的 `USER` 是两层不同控制：

- Rootless 控制 Docker 守护进程和宿主机映射；
- `USER` 控制容器内应用进程身份。

Rootless 需要 subordinate UID/GID，并可能在端口、cgroup 和网络行为上有差异。部署前在目标系统验证资源限制和运维工具兼容性。

## 生产检查清单

- [ ] Dockerfile 使用 multi-stage，只复制运行所需产物；
- [ ] 基础镜像来自可信来源，并固定版本或 digest；
- [ ] `.dockerignore` 排除 Git、缓存、测试产物和 Secret；
- [ ] 依赖锁定并经过哈希或锁文件验证；
- [ ] 最终镜像不包含编译器和无关工具；
- [ ] 使用固定非 root `USER`，不依赖 `777` 权限；
- [ ] 运行时采用只读根文件系统、最小 capability 和 no-new-privileges；
- [ ] 构建 Secret 使用 BuildKit 挂载，不使用 `ARG` 保存凭据；
- [ ] CI 验证最终镜像启动、健康检查和优雅退出；
- [ ] 发布生成 SBOM，并执行系统包与应用依赖扫描；
- [ ] 高风险漏洞处理有明确阻断或例外流程。

## 参考资料

- [Docker Build best practices](https://docs.docker.com/build/building/best-practices/)
- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/)
- [Docker Rootless mode](https://docs.docker.com/engine/security/rootless/)

> 本文补充 Docker 镜像从“能构建”到“可验证、低权限、可持续更新”的生产要求。
