---
title: PostgreSQL 配置与性能优化基础
published: 2026-02-22
updated: 2026-07-30
description: 从连接、内存、WAL、自动清理和慢查询入手，建立可验证的 PostgreSQL 调优流程。
tags: [PostgreSQL, 性能优化, VACUUM, WAL]
category: PostgreSQL
contentType: docs
docGroup: postgresql
docSection: 查询优化
docOrder: 40
draft: false
---

PostgreSQL 调优应从指标和业务负载出发，而不是复制一份“万能参数”。参数之间相互影响，错误地放大连接数或单查询内存，可能让高并发时的总内存远超机器容量。

## 查看当前配置

```sql
SHOW config_file;
SHOW data_directory;
SHOW max_connections;
SHOW shared_buffers;
SHOW work_mem;
SHOW maintenance_work_mem;
SHOW effective_cache_size;
```

查看参数来源：

```sql
SELECT name, setting, unit, source, pending_restart
FROM pg_settings
WHERE name IN (
  'max_connections',
  'shared_buffers',
  'work_mem',
  'maintenance_work_mem',
  'effective_cache_size'
);
```

## 连接数

`max_connections` 不是吞吐量旋钮。每个连接都有资源成本，过多活跃连接会增加上下文切换和内存压力。

优先考虑：

- 应用端设置连接池上下限；
- 为连接和查询设置超时；
- 使用 PgBouncer 等连接池代理处理大量短连接；
- 查看真实活跃连接，而不是只看总连接数。

```sql
SELECT state, count(*)
FROM pg_stat_activity
GROUP BY state
ORDER BY state;
```

## 内存参数

- `shared_buffers`：PostgreSQL 共享缓存，不应占满系统内存。
- `work_mem`：每个排序或哈希操作可能使用的内存，不是每个连接只分配一次。
- `maintenance_work_mem`：VACUUM、CREATE INDEX 等维护操作可用内存。
- `effective_cache_size`：规划器对系统缓存可用量的估计，不会直接分配内存。

调整 `work_mem` 前先查看执行计划中的磁盘排序，并按并发峰值估算总量。

## 慢查询日志

```conf
log_min_duration_statement = 500ms
log_line_prefix = '%m [%p] %u@%d %r '
```

更精细的统计可以使用 `pg_stat_statements`：

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT
  calls,
  total_exec_time,
  mean_exec_time,
  rows,
  query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

总耗时高的高频 SQL 和单次耗时极高的 SQL 都值得关注。

## 自动清理与统计

```sql
SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

自动清理长期跟不上时，应先分析写入模式、长事务、表规模和实际触发频率，再针对单表调整：

```sql
ALTER TABLE events SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
```

不要轻易关闭 autovacuum。它不仅清理死元组，也关系到事务 ID 回卷安全。

## WAL 与检查点

频繁检查点可能带来 I/O 抖动。观察日志和统计：

```sql
SELECT * FROM pg_stat_bgwriter;
SELECT * FROM pg_stat_checkpointer;
```

具体可用视图取决于 PostgreSQL 版本。调整 `max_wal_size`、`checkpoint_timeout` 等参数前，应了解恢复时间、磁盘容量和复制需求。

## 长事务与锁

```sql
SELECT pid, usename, state, xact_start, query_start, wait_event_type, wait_event, query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;
```

查看阻塞关系：

```sql
SELECT
  blocked.pid AS blocked_pid,
  blocking.pid AS blocking_pid,
  blocked.query AS blocked_query,
  blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));
```

优化前先解决异常长事务、空闲事务和锁等待，它们可能让 VACUUM、DDL 和正常请求都受影响。

## 调优原则

1. 建立 CPU、内存、磁盘、连接、延迟和错误率基线。
2. 从最耗时 SQL 和等待事件定位瓶颈。
3. 一次只改变少量参数。
4. 记录修改前后指标和执行计划。
5. 在接近生产数据规模和并发下验证。
6. 保留回滚值，并确认哪些参数需要重启。

## 参考资料

- [PostgreSQL 服务端配置](https://www.postgresql.org/docs/current/runtime-config.html)
- [查询规划配置](https://www.postgresql.org/docs/current/runtime-config-query.html)
- [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)
