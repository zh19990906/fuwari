---
title: Docker Compose 生产实践：健康检查、资源限制、配置与回滚
published: 2026-08-04
updated: 2026-08-04
description: 将开发环境 Compose 调整为可维护的单机生产部署，覆盖覆盖文件、健康检查、启动顺序、资源限制、日志、备份和回滚。
tags: [Docker, Compose, 生产部署, Healthcheck, 回滚]
category: Docker
contentType: docs
docGroup: docker
docSection: 生产部署
docOrder: 70
draft: false
---

Docker Compose 可以用于单机或小规模受控部署，但生产要求与本地开发不同：源码热挂载、调试端口、自动重载和无上限日志都不应直接带到服务器。

本文以 `compose.yaml` 加 `compose.production.yaml` 的覆盖方式组织配置。Compose 不是 Kubernetes 的替代品；当需要多节点调度、自动跨主机故障转移、复杂滚动发布和平台级网络策略时，应评估更合适的编排系统。

## 基础文件与生产覆盖文件

开发和生产共享服务拓扑：

```yaml
# compose.yaml
services:
  web:
    build:
      context: .
    environment:
      APP_ENV: development
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:18
    environment:
      POSTGRES_DB: blog
      POSTGRES_USER: blog_app
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - db-data:/var/lib/postgresql/data

secrets:
  db_password:
    file: ./secrets/db_password.txt

volumes:
  db-data:
```

生产覆盖：

```yaml
# compose.production.yaml
services:
  web:
    image: registry.example.com/blog-api@sha256:REPLACE_WITH_VERIFIED_DIGEST
    build: null
    environment:
      APP_ENV: production
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp:size=64m,mode=1777
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"

  db:
    restart: unless-stopped
    ports: []
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"
```

启动：

```bash
docker compose \
  -f compose.yaml \
  -f compose.production.yaml \
  up -d
```

先查看合并后的最终配置：

```bash
docker compose \
  -f compose.yaml \
  -f compose.production.yaml \
  config
```

生产覆盖文件中不要保留源码目录挂载、调试器和自动重载命令。

## healthcheck 检查服务是否可用

容器进程存在不代表服务已经可以处理请求。数据库可能仍在恢复，Web 服务可能尚未加载迁移或模型。

```yaml
services:
  db:
    image: postgres:18
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U blog_app -d blog"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  web:
    healthcheck:
      test: ["CMD", "python", "-m", "app.healthcheck"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```

健康检查应该：

- 快速完成；
- 有明确超时；
- 不写业务数据；
- 不依赖不必要的远程服务；
- 区分进程存活和依赖可用性。

如果健康端点每次执行昂贵数据库查询或调用所有第三方 API，检查本身可能成为故障放大器。

## depends_on 与 service_healthy

```yaml
services:
  web:
    depends_on:
      db:
        condition: service_healthy
        restart: true
```

`service_healthy` 让 Compose 等待依赖健康后再创建服务。它只解决启动顺序，不保证数据库以后永远可用。应用仍然需要连接超时、有限重试和断线恢复。

`restart: true` 在显式 Compose 操作重启依赖时，可以让依赖方重启并重新建立连接；它不等同于任意崩溃时的自动级联恢复。

## restart policy

```yaml
restart: unless-stopped
```

常见选择：

- `no`：默认，不自动重启；
- `on-failure`：非零退出时重启；
- `always`：持续重启，包括守护进程重启后；
- `unless-stopped`：除非人工停止，否则重启。

反复崩溃的容器不应只靠重启掩盖。监控重启次数，并查看退出码、OOM 和应用日志。

## 资源限制

Compose 服务可以设置 CPU、内存、进程和文件描述符边界。具体字段支持取决于 Compose 和运行模式，部署前必须用目标版本验证。

```yaml
services:
  web:
    mem_limit: 1g
    cpus: 1.5
    pids_limit: 256
    ulimits:
      nofile:
        soft: 4096
        hard: 8192
```

限制过小会造成 OOM 或请求失败，完全不限制则可能让单个服务拖垮宿主机。先压测，再按实际峰值保留余量。

查看资源：

```bash
docker stats
docker inspect blog-web-1 --format '{{json .HostConfig.Memory}}'
docker inspect blog-web-1 --format '{{json .State}}'
```

## 配置与敏感信息

普通非敏感配置可以使用环境变量；敏感值使用 Docker Secrets、宿主机权限受限文件或外部密钥系统。

```yaml
services:
  web:
    environment:
      APP_ENV: production
      DATABASE_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
```

`.env` 不是密钥保险箱。它适合本地变量组合，但不应提交真实生产凭据。还要理解 shell、`.env`、Compose 和 Dockerfile 中环境变量的优先级。

## 网络最小暴露

数据库和内部服务通常不需要发布宿主机端口：

```yaml
services:
  db:
    expose:
      - "5432"
```

只有入口代理或 Web 服务使用 `ports`。Compose 网络中的服务名可用于内部解析，不要把数据库端口开放给公网。

```yaml
networks:
  frontend: {}
  backend:
    internal: true

services:
  proxy:
    networks: [frontend]
  web:
    networks: [frontend, backend]
  db:
    networks: [backend]
```

`internal: true` 不是完整防火墙策略，仍需结合宿主机防火墙、云安全组和应用认证。

## 日志与轮转

默认 `json-file` 日志如果不限制大小，会持续占用磁盘。

```yaml
logging:
  driver: json-file
  options:
    max-size: "20m"
    max-file: "5"
```

应用日志写到标准输出，避免容器内未挂载的日志目录。需要集中查询时由日志代理采集，不要让应用直接承担复杂日志传输重试。

## 更新单个服务

```bash
docker compose \
  -f compose.yaml \
  -f compose.production.yaml \
  pull web

docker compose \
  -f compose.yaml \
  -f compose.production.yaml \
  up -d --no-deps web
```

单机 Compose 更新通常会有短暂重建窗口。要求零停机时可以在反向代理后运行蓝绿两套项目名，验证新版本健康后切换流量。

不要使用可漂移的 `latest` 作为唯一发布标识。镜像应使用不可变版本或经过验证的 digest。

## 数据备份

Compose 卷不是备份。数据库备份应使用数据库原生工具并验证恢复。

```bash
docker compose exec -T db \
  pg_dump -U blog_app -d blog -Fc \
  > backups/blog-$(date +%F).dump
```

恢复演练要在隔离环境执行，并验证：

- 备份文件可读；
- Schema 和数据可恢复；
- 应用能够连接；
- 恢复时间满足目标；
- 加密和保留策略符合要求。

不要在数据库持续高写入时直接复制其数据目录作为一致备份。

## 回滚

回滚前记录当前镜像 digest 和数据库迁移版本：

```bash
docker compose images
docker image inspect registry.example.com/blog-api@sha256:REPLACE_WITH_VERIFIED_DIGEST
```

回滚流程：

1. 停止继续扩大故障影响；
2. 判断是否包含不可逆数据库迁移；
3. 把覆盖文件中的镜像恢复为上一已验证 digest；
4. `docker compose up -d --no-deps web`；
5. 等待 healthcheck；
6. 执行关键接口冒烟测试；
7. 检查错误率和数据一致性。

应用回滚不等于数据库自动回滚。Schema 变更应采用向前兼容的 expand/contract，避免旧应用无法读取新结构。

## 常用排查

```bash
docker compose ps
docker compose logs --tail 200 web
docker compose config
docker inspect blog-web-1 --format '{{json .State.Health}}'
docker events --since 30m
df -h
docker system df
```

先确认最终配置、容器状态、健康检查和宿主机资源，再决定是否重建。

## 生产检查清单

- [ ] 开发和生产使用独立覆盖文件；
- [ ] `docker compose config` 输出经过审查；
- [ ] 关键服务有快速且无副作用的 healthcheck；
- [ ] 启动依赖使用 `service_healthy`，应用仍有超时和重试；
- [ ] restart policy 与告警策略配套；
- [ ] CPU、内存、PID 和日志大小有边界；
- [ ] 数据库等内部服务不发布公网端口；
- [ ] 生产凭据不提交到 `.env` 或仓库；
- [ ] 镜像使用不可变版本或 digest；
- [ ] 数据库备份经过定期恢复演练；
- [ ] 发布前记录回滚镜像和迁移兼容性。

## 参考资料

- [Use Compose in production](https://docs.docker.com/compose/how-tos/production/)
- [Control startup and shutdown order](https://docs.docker.com/compose/how-tos/startup-order/)
- [Compose service healthcheck reference](https://docs.docker.com/reference/compose-file/services/#healthcheck)
- [Merge Compose files](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)

> 本文补充 Docker 从多容器开发到受控生产运行的实践边界。
