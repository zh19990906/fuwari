---
title: PostgreSQL 角色、权限、备份与恢复
published: 2025-03-16
updated: 2026-07-30
description: 管理最小权限角色，并使用 pg_dump、pg_restore 和 pg_dumpall 完成可验证备份。
tags: [PostgreSQL, 备份, 恢复, 权限]
category: PostgreSQL
contentType: docs
docGroup: postgresql
docSection: 运维管理
docOrder: 20
draft: false
---

数据库备份只有在成功恢复后才算可靠。生产环境应明确备份范围、保留周期、加密方式、恢复目标时间以及谁可以读取备份。

## 角色与权限

创建只用于应用连接的角色：

```sql
CREATE ROLE app LOGIN PASSWORD 'replace-me';
CREATE DATABASE app OWNER app;
```

创建只读角色：

```sql
CREATE ROLE app_readonly;
GRANT CONNECT ON DATABASE app TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO app_readonly;
```

把登录用户加入角色：

```sql
CREATE ROLE analyst LOGIN PASSWORD 'replace-me';
GRANT app_readonly TO analyst;
```

`ALTER DEFAULT PRIVILEGES` 只影响之后由指定创建者建立的对象。多人创建对象时，要按实际拥有者配置默认权限。

## 逻辑备份

自定义格式适合配合 `pg_restore` 选择对象和并行恢复：

```bash
pg_dump \
  --format=custom \
  --file=app-$(date +%F).dump \
  --dbname='postgresql://backup@127.0.0.1/app'
```

纯 SQL 格式：

```bash
pg_dump --format=plain --file=app.sql app
```

备份全局角色和表空间定义：

```bash
pg_dumpall --globals-only > globals.sql
```

逻辑备份通常需要分别考虑数据库内容和全局对象。

## 恢复到新数据库

```bash
createdb app_restore
pg_restore \
  --dbname=app_restore \
  --clean \
  --if-exists \
  app-2026-07-30.dump
```

恢复完成后检查：

```bash
psql app_restore -c '\dt+'
psql app_restore -c 'select count(*) from important_table;'
```

`--clean` 会删除将要恢复的对象，只应在明确的恢复目标库中使用。

## 并行备份和恢复

目录格式支持并行：

```bash
pg_dump --format=directory --jobs=4 --file=app-backup app
pg_restore --jobs=4 --dbname=app_restore app-backup
```

并行度不是越高越好，应根据磁盘 I/O、CPU、锁和业务负载评估。

## 压缩与校验

```bash
sha256sum app-2026-07-30.dump > app-2026-07-30.dump.sha256
sha256sum -c app-2026-07-30.dump.sha256
pg_restore --list app-2026-07-30.dump | head
```

将备份复制到与数据库主机故障域不同的位置，并对传输和静态存储进行加密。

## 定期恢复演练

至少验证以下内容：

1. 备份文件能够读取且校验通过；
2. 新建空数据库并成功恢复；
3. 关键表行数、约束和索引存在；
4. 应用可以连接恢复库并完成核心读写；
5. 记录实际恢复耗时；
6. 恢复文档不依赖某个个人记忆中的步骤。

## 物理备份说明

大型数据库、时间点恢复和高可用场景通常需要 `pg_basebackup`、WAL 归档或专业备份工具。逻辑备份方便迁移和选择对象，但不能替代所有灾难恢复需求。

## 参考资料

- [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)
- [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html)
- [数据库角色](https://www.postgresql.org/docs/current/user-manag.html)
