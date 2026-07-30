---
title: Docker Compose 多容器实操
published: 2025-02-09
updated: 2026-07-30
description: 使用 Compose 管理应用、PostgreSQL、网络、健康检查和环境变量。
tags: [Docker, Compose, PostgreSQL]
category: Docker
contentType: docs
docGroup: docker
docSection: Compose
docOrder: 30
draft: false
---

Docker Compose 使用一个 YAML 文件描述服务、网络、卷和依赖关系，适合本地开发、小型部署以及可复现的集成测试环境。

## 示例结构

```text
example/
├── compose.yaml
├── .env
├── app/
│   └── Dockerfile
└── data/
```

`compose.yaml`：

```yaml
services:
  app:
    build: ./app
    ports:
      - "8080:8000"
    environment:
      DATABASE_URL: postgresql://app:${POSTGRES_PASSWORD}@db:5432/app
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:18
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  postgres-data:
```

`.env`：

```dotenv
POSTGRES_PASSWORD=replace-with-a-strong-password
```

`.env` 不应提交到公共仓库。提交一份不含敏感值的 `.env.example`。

## 启动与停止

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f
docker compose down
```

`docker compose config` 会展开变量并校验最终配置，适合在启动前检查缩进、引用和合并结果。

## 服务名就是默认网络中的主机名

应用应连接 `db:5432`，而不是 `localhost:5432`。容器内的 `localhost` 指当前容器自身。

```bash
docker compose exec app getent hosts db
docker compose exec db psql -U app -d app
```

## 更新单个服务

```bash
docker compose build app
docker compose up -d --no-deps app
```

拉取新镜像：

```bash
docker compose pull
docker compose up -d
```

## 查看与执行命令

```bash
docker compose logs --tail 100 app
docker compose exec app sh
docker compose exec db pg_isready -U app -d app
docker compose top
```

`exec` 在已运行容器中执行命令；一次性任务可用：

```bash
docker compose run --rm app python -m pytest
```

## 卷与数据

普通停止不会删除命名卷：

```bash
docker compose down
```

删除命名卷：

```bash
docker compose down --volumes
```

:::warning
`--volumes` 会永久删除 Compose 管理的数据库数据。执行前确认备份和卷名称。
:::

## 健康检查与依赖

`depends_on` 的健康条件能减少启动竞争，但不能替代应用自身的重试机制。数据库可能在运行中重启或短暂不可用，应用仍应设置连接超时和有限重试。

## 多环境配置

可以使用多个文件覆盖配置：

```bash
docker compose -f compose.yaml -f compose.prod.yaml config
docker compose -f compose.yaml -f compose.prod.yaml up -d
```

基础文件保存通用配置，覆盖文件只描述环境差异，避免复制整份服务定义。

## 参考资料

- [Docker Compose Quickstart](https://docs.docker.com/compose/gettingstarted/)
- [Compose file reference](https://docs.docker.com/reference/compose-file/)
