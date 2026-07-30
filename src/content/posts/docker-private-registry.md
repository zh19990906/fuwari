---
title: Docker 私有镜像仓库与证书信任
published: 2022-09-08
updated: 2026-07-30
description: 从本地 Registry 到 Harbor，整理证书信任、登录、推送和常见错误排查。
tags: [Docker, Registry, Harbor, TLS, 镜像]
category: Docker
contentType: docs
docGroup: docker
docSection: 镜像仓库
docOrder: 60
draft: false
---

私有镜像仓库用于保存组织内部镜像、控制访问权限并减少对外部网络的依赖。简单实验可以使用官方 Registry，团队环境通常更适合带权限、审计和扫描能力的 Harbor。

## 启动一个本地 Registry

```bash
docker volume create registry-data

docker run -d \
  --restart=always \
  --name registry \
  -p 5000:5000 \
  -v registry-data:/var/lib/registry \
  registry:2
```

检查服务：

```bash
docker ps --filter name=registry
curl http://127.0.0.1:5000/v2/
```

返回 `{}` 通常表示 Registry API 可访问。这个示例只适合隔离的本机实验，不包含 TLS 和认证。

## 标记并推送镜像

假设仓库域名为 `registry.example.com`：

```bash
docker tag app:1.0 registry.example.com/team/app:1.0
docker login registry.example.com
docker push registry.example.com/team/app:1.0
```

在其他主机拉取：

```bash
docker pull registry.example.com/team/app:1.0
```

镜像名称应包含完整仓库地址、命名空间和明确版本。生产环境不要只发布 `latest`，建议同时保留语义化版本或不可变提交 SHA 标签。

## 配置受信任证书

使用内部 CA 或自签 CA 时，需要把 CA 证书放到 Docker 约定目录：

```bash
sudo mkdir -p /etc/docker/certs.d/registry.example.com
sudo install -m 644 ca.crt \
  /etc/docker/certs.d/registry.example.com/ca.crt
sudo systemctl restart docker
```

如果仓库使用非标准端口，目录名必须包含端口：

```text
/etc/docker/certs.d/registry.example.com:5000/ca.crt
```

验证证书链：

```bash
openssl s_client \
  -connect registry.example.com:443 \
  -servername registry.example.com \
  -CAfile ca.crt </dev/null
```

证书的 SAN 必须包含客户端实际访问的域名。只把证书复制到服务器而不配置客户端信任，仍会出现 `x509: certificate signed by unknown authority`。

## 认证与凭据

```bash
docker login registry.example.com
```

Docker 会把认证信息写入客户端配置。个人电脑建议配置系统 Credential Helper；CI 环境应从密钥管理服务注入短期凭据，并在作业结束后清理。

不要把下面内容提交到 Git：

```text
~/.docker/config.json
私有 CA 的私钥
Registry 或 Harbor 管理员密码
CI 的机器人账号令牌
```

## Harbor 适合团队环境的原因

Harbor 在 Registry 基础上增加了：

- 项目与角色权限；
- 机器人账号；
- 镜像复制；
- 漏洞扫描；
- 保留策略与垃圾回收；
- 审计日志；
- Web 管理界面。

部署 Harbor 时，应提前规划域名、证书、持久化、备份和外部数据库/对象存储需求。不要只备份容器本身，真正需要保护的是配置和持久化数据。

## `insecure-registries` 的边界

Docker 可以通过 `/etc/docker/daemon.json` 信任明文 HTTP 仓库：

```json
{
  "insecure-registries": ["registry.example.com:5000"]
}
```

然后：

```bash
sudo systemctl restart docker
```

:::danger
`insecure-registries` 会降低传输安全，只应作为隔离实验网络中的临时措施。正常团队仓库应部署可信 TLS，而不是长期关闭证书校验。
:::

## 常见错误

### `server gave HTTP response to HTTPS client`

客户端默认按 HTTPS 访问，而服务端只提供 HTTP。正确方案是为仓库配置 TLS；临时实验才考虑 `insecure-registries`。

### `x509: certificate signed by unknown authority`

- CA 文件路径或目录名错误；
- 证书链不完整；
- 证书 SAN 不包含访问域名；
- 修改后 Docker 守护进程未重启。

### `unauthorized: authentication required`

```bash
docker logout registry.example.com
docker login registry.example.com
```

同时检查账号对目标项目是否有 push 权限。

### 推送后磁盘持续增长

删除标签不会立即回收所有层。需要结合保留策略和垃圾回收，并在执行前确认当前 Registry/Harbor 版本的停机或只读要求。

## 运维检查清单

```text
1. 仓库使用受信任 TLS
2. 普通用户不共享管理员账号
3. CI 使用独立机器人账号和最小权限
4. 镜像标签可追踪到源码提交
5. 配置、数据库和存储都有备份
6. 定期执行保留策略、扫描和容量告警
7. 客户端证书信任方式已文档化
```

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
