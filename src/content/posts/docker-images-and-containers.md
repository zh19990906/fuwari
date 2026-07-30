---
title: Dockerfile、镜像构建与容器运行
published: 2024-07-14
updated: 2026-07-30
description: 编写可缓存、体积合理且安全的 Dockerfile，并掌握容器运行参数。
tags: [Docker, Dockerfile, 镜像]
category: Docker
contentType: docs
docGroup: docker
docSection: 镜像与容器
docOrder: 20
draft: false
---

Dockerfile 是镜像的构建说明。好的镜像应当可复现、包含最少依赖、默认以非 root 用户运行，并将配置与数据留在镜像之外。

## 一个 Python 示例

```dockerfile
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

CMD ["python", "main.py"]
```

构建：

```bash
docker build -t example-app:1.0 .
```

运行：

```bash
docker run --rm --name example-app example-app:1.0
```

## 构建缓存

Docker 通常按层复用缓存。先复制依赖清单并安装，再复制经常变化的源码，可以减少重复安装：

```dockerfile
COPY requirements.txt .
RUN python -m pip install -r requirements.txt
COPY . .
```

使用 `.dockerignore` 排除无关内容：

```gitignore
.git
.venv
__pycache__
*.pyc
.env
node_modules
```

不要把密钥写进 Dockerfile、构建参数或镜像层。即使之后删除文件，它仍可能存在于历史层中。

## 标签与摘要

```bash
docker image ls
docker image inspect example-app:1.0
docker image history example-app:1.0
docker tag example-app:1.0 registry.example.com/team/example-app:1.0
```

生产部署优先使用不可变版本标签或镜像摘要，不要只依赖会变化的 `latest`。

## 运行参数

```bash
docker run -d \
  --name example-app \
  --restart unless-stopped \
  -p 8080:8000 \
  --env-file .env \
  --memory 512m \
  --cpus 1.0 \
  example-app:1.0
```

检查：

```bash
docker logs -f example-app
docker stats example-app
docker inspect example-app
docker exec -it example-app sh
```

## 多阶段构建

编译型应用可以把构建工具留在构建阶段，只复制运行产物：

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
```

## 健康检查

健康检查用于判断服务是否真正可用，而不只是进程仍然存在：

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8000/health || exit 1
```

健康检查命令必须存在于镜像内，并且不应执行昂贵操作。

## 镜像优化原则

- 使用明确版本的基础镜像。
- 合并相关安装步骤并清理包管理器缓存。
- 不安装调试工具到最小生产镜像。
- 使用非 root 用户。
- 为依赖和系统包进行漏洞扫描。
- 构建和运行阶段分离。

## 参考资料

- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/)
- [Build best practices](https://docs.docker.com/build/building/best-practices/)
