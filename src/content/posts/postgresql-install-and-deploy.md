---
title: PostgreSQL 安装、初始化与基础部署
published: 2024-09-22
updated: 2026-07-30
description: 完成 PostgreSQL 服务安装、角色数据库创建、网络访问和部署检查。
tags: [PostgreSQL, 数据库, 部署]
category: PostgreSQL
contentType: docs
docGroup: postgresql
docSection: 部署基础
docOrder: 10
draft: false
---

PostgreSQL 部署的重点不只是“服务能启动”，还包括数据目录、监听地址、认证规则、备份位置和运行账户都可控。本文以现代受支持版本为主，命令需根据发行版调整。

## 安装后检查

```bash
psql --version
systemctl status postgresql
pg_isready
```

部分发行版会同时安装多个 PostgreSQL 版本，服务名和数据目录可能包含版本号。先确认实际运行实例：

```bash
ps aux | grep '[p]ostgres'
sudo -u postgres psql -c 'select version();'
```

## 创建角色和数据库

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE app LOGIN PASSWORD 'replace-with-a-strong-password';
CREATE DATABASE app OWNER app;
REVOKE ALL ON DATABASE app FROM PUBLIC;
```

测试：

```bash
psql 'postgresql://app@127.0.0.1:5432/app'
```

密码不应直接写在 Shell 历史、代码仓库或镜像中。使用秘密管理服务、受限环境变量或权限严格的凭据文件。

## 监听地址

在 `postgresql.conf` 中：

```conf
listen_addresses = 'localhost'
port = 5432
```

只供本机应用使用时保持本地监听。需要远程访问时，应绑定明确的内部地址，并结合防火墙和 `pg_hba.conf` 限制来源。

查看配置文件位置：

```sql
SHOW config_file;
SHOW hba_file;
SHOW data_directory;
```

## 客户端认证

`pg_hba.conf` 示例：

```conf
# TYPE  DATABASE  USER  ADDRESS          METHOD
host    app       app   10.20.0.0/16     scram-sha-256
```

修改后重新加载：

```bash
sudo systemctl reload postgresql
```

验证规则：

```bash
sudo -u postgres psql -c 'select pg_reload_conf();'
```

:::warning
不要使用 `trust` 暴露远程连接，也不要用 `0.0.0.0/0` 配合弱密码开放数据库端口。
:::

## Docker Compose 示例

```yaml
services:
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

数据库容器的端口不必默认映射到公网。与应用位于同一 Compose 网络时，应用可以直接连接 `db:5432`。

## 基础安全检查

```sql
SELECT current_user, current_database();
SHOW password_encryption;
SHOW listen_addresses;
SELECT rolname, rolsuper, rolcanlogin FROM pg_roles ORDER BY rolname;
```

应用角色通常不应拥有超级用户、创建角色或创建数据库权限。

## 上线前检查

- 数据目录位于持久化存储，并监控剩余空间。
- 时区和系统时间同步正常。
- 已验证备份与恢复流程。
- 数据库端口只对需要的网络开放。
- 应用连接池设置上限，避免耗尽连接。
- 日志能够记录启动、认证失败和慢查询线索。
- 升级前有兼容性测试和回滚计划。

## 参考资料

- [PostgreSQL 当前版本文档](https://www.postgresql.org/docs/current/)
- [PostgreSQL 客户端认证](https://www.postgresql.org/docs/current/client-authentication.html)
