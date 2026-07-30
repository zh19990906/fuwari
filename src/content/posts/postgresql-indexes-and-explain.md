---
title: PostgreSQL 索引与 EXPLAIN 分析
published: 2025-08-24
updated: 2026-07-30
description: 使用 EXPLAIN ANALYZE 理解扫描、连接、排序和索引是否真正改善查询。
tags: [PostgreSQL, 索引, EXPLAIN, SQL优化]
category: PostgreSQL
contentType: docs
docGroup: postgresql
docSection: 查询优化
docOrder: 30
draft: false
---

索引不是越多越好。它会占用磁盘、增加写入成本，并需要统计信息和真实查询条件配合，规划器才可能选择使用。

## 从 EXPLAIN 开始

```sql
EXPLAIN
SELECT * FROM orders WHERE user_id = 1001;
```

需要真实执行时间时：

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM orders WHERE user_id = 1001;
```

:::warning
`EXPLAIN ANALYZE` 会真正执行语句。对 `UPDATE`、`DELETE`、`INSERT` 或昂贵查询，应在事务和安全环境中测试，并理解副作用。
:::

## 常见节点

- `Seq Scan`：顺序扫描整张表。小表或需要大量行时可能是正确选择。
- `Index Scan`：通过索引定位后访问表数据。
- `Index Only Scan`：需要的数据可从索引获取，但仍受可见性映射影响。
- `Bitmap Index Scan` + `Bitmap Heap Scan`：适合返回中等数量离散行。
- `Nested Loop`：小结果集和索引连接常见。
- `Hash Join`：等值连接且输入较大时常见。
- `Merge Join`：双方已排序或可高效排序时可能出现。
- `Sort`：关注排序方式、内存和是否写入磁盘。

## 建立索引

```sql
CREATE INDEX CONCURRENTLY idx_orders_user_id
ON orders (user_id);
```

生产大表通常考虑 `CONCURRENTLY` 以降低阻塞，但创建时间更长，也有额外限制。失败的并发索引可能留下无效索引，应检查：

```sql
SELECT indexrelid::regclass, indisvalid
FROM pg_index
WHERE indexrelid = 'idx_orders_user_id'::regclass;
```

## 联合索引

```sql
CREATE INDEX idx_orders_user_status_created
ON orders (user_id, status, created_at DESC);
```

索引列顺序应基于查询条件，不是简单把所有 `WHERE` 字段都堆进去。通常优先考虑高频等值条件，再考虑范围与排序，但必须用实际执行计划验证。

## 部分索引

```sql
CREATE INDEX idx_orders_pending
ON orders (created_at)
WHERE status = 'pending';
```

当查询长期集中在一个较小子集时，部分索引可以减小体积和维护成本。查询条件必须能让规划器证明它满足索引谓词。

## 表达式索引

```sql
CREATE INDEX idx_users_lower_email
ON users (lower(email));
```

对应查询：

```sql
SELECT * FROM users WHERE lower(email) = lower('Alice@example.com');
```

## 查看索引使用情况

```sql
SELECT
  schemaname,
  relname,
  indexrelname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;
```

`idx_scan = 0` 不等于可以立即删除。统计可能刚重置，索引可能用于月度任务、约束或灾难场景。删除前观察完整业务周期并检查约束依赖。

## 统计信息

```sql
ANALYZE orders;
```

估算行数与实际行数差距很大时，检查自动清理与统计信息：

```sql
SELECT relname, last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'orders';
```

对分布特殊的列可以提高统计目标，但会增加分析时间和统计数据体积：

```sql
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 500;
ANALYZE orders;
```

## 优化流程

1. 保存慢 SQL、参数和当前执行计划。
2. 查看实际行数与估算行数差异。
3. 确认主要耗时节点、缓冲区读取和磁盘排序。
4. 检查过滤、连接、排序和返回行数。
5. 小范围修改 SQL、索引或统计信息。
6. 在相同数据规模下重新执行并比较。
7. 同时评估写入成本和磁盘占用。

## 参考资料

- [PostgreSQL 使用 EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [检查索引使用情况](https://www.postgresql.org/docs/current/indexes-examine.html)
