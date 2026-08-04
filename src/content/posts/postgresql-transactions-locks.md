---
title: PostgreSQL 事务与并发：隔离级别、锁、死锁和重试
published: 2026-08-04
updated: 2026-08-04
description: 理解 PostgreSQL 事务隔离、行锁、死锁和序列化失败，并为库存扣减、任务领取和并发更新设计可重试边界。
tags: [PostgreSQL, 事务, 锁, 死锁, 并发]
category: PostgreSQL
contentType: docs
docGroup: postgresql
docSection: 事务与并发
docOrder: 60
draft: false
---

数据库并发问题往往不是“SQL 写错了”，而是两个都正确的请求在不同时间观察和修改同一份数据。事务用于把一组操作组成原子边界，隔离级别决定并发事务可以看到什么，锁则控制谁可以先修改资源。

本文聚焦 PostgreSQL 的 `Read Committed`、`Repeatable Read`、`Serializable`、显式行锁和死锁处理。事务不能替代业务幂等，也不能让外部 HTTP、消息系统和数据库天然处于同一个原子操作中。

## 事务边界

```sql
BEGIN;

UPDATE accounts
SET balance = balance - 100
WHERE id = 101
  AND balance >= 100;

INSERT INTO ledger(account_id, amount, event_type)
VALUES (101, -100, 'purchase');

COMMIT;
```

应用必须检查第一条 `UPDATE` 实际影响的行数。如果余额不足导致更新零行，却仍然插入流水，事务语法虽然成功，业务仍然错误。

事务应尽量短：

- 不在事务中等待用户输入；
- 不在持锁期间调用慢外部 API；
- 不把大批文件处理放入事务；
- 先完成必要计算，再打开事务执行数据库读写；
- 为语句和锁等待设置合理超时。

## 默认隔离级别 Read Committed

PostgreSQL 默认使用 `Read Committed`。每条语句看到该语句开始前已经提交的数据，同一事务内两次查询可能看到其他事务新提交的结果。

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT status FROM orders WHERE id = 501;
-- 其他事务提交修改
SELECT status FROM orders WHERE id = 501;
COMMIT;
```

它适合多数短事务，但“先查询、在应用里判断、再更新”的读改写流程可能丢失并发变化。

不安全模式：

```sql
SELECT stock FROM products WHERE id = 9;
-- 应用计算 stock - 1
UPDATE products SET stock = 19 WHERE id = 9;
```

更安全的单语句条件更新：

```sql
UPDATE products
SET stock = stock - 1
WHERE id = 9
  AND stock > 0
RETURNING stock;
```

条件和修改由同一条 SQL 完成，可以减少竞争窗口。

## Repeatable Read

`Repeatable Read` 让事务中的查询基于稳定快照。它适合需要一致读取多个相关查询的场景，但并发写入可能在提交时产生序列化失败。

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT * FROM monthly_summary WHERE month = DATE '2026-08-01';
SELECT * FROM monthly_items WHERE month = DATE '2026-08-01';
COMMIT;
```

稳定快照不代表“不会冲突”。应用仍然要捕获数据库返回的失败并重试整个事务，而不是只重试最后一条语句。

## Serializable

`Serializable` 尝试让并发事务的结果等价于某个串行执行顺序。PostgreSQL 通过可序列化快照隔离检测危险依赖，无法安全排序时会终止其中一个事务。

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- 读取和写入业务数据
COMMIT;
```

适合复杂一致性规则，但必须满足：

- 事务较短；
- 重试逻辑明确；
- 外部副作用不在可重试事务内部直接执行；
- 重试次数有上限并带随机退避；
- 记录冲突率，用数据判断隔离级别是否合适。

## 使用 FOR UPDATE 锁定目标行

任务领取、余额修改和状态机转换常需要显式行锁。

```sql
BEGIN;

SELECT id, status
FROM jobs
WHERE id = 7001
FOR UPDATE;

UPDATE jobs
SET status = 'running', started_at = now()
WHERE id = 7001
  AND status = 'queued';

COMMIT;
```

`FOR UPDATE` 阻止其他事务同时修改或锁定该行，直到当前事务结束。必须按稳定顺序锁定多行，降低死锁概率。

批量 Worker 领取任务可以使用 `SKIP LOCKED`：

```sql
WITH picked AS (
    SELECT id
    FROM jobs
    WHERE status = 'queued'
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT 10
)
UPDATE jobs
SET status = 'running', started_at = now()
WHERE id IN (SELECT id FROM picked)
RETURNING id;
```

`SKIP LOCKED` 适合队列式领取，不适合需要完整一致视图的普通查询，因为它会跳过当前被锁定的数据。

## 乐观并发控制

频繁读取、偶尔冲突的业务可以增加版本号：

```sql
UPDATE articles
SET title = $1,
    version = version + 1,
    updated_at = now()
WHERE id = $2
  AND version = $3
RETURNING version;
```

影响零行表示版本已经变化，API 可以返回冲突，让客户端重新读取。不要静默覆盖他人的修改。

## 死锁如何形成

两个事务以不同顺序锁定资源：

```text
事务 A：锁定账户 1 → 等待账户 2
事务 B：锁定账户 2 → 等待账户 1
```

PostgreSQL 会检测死锁并终止一个事务。数据库自动解除死锁，不代表应用可以忽略错误；被终止事务必须回滚并决定是否重试。

降低死锁：

- 所有代码按相同顺序锁定资源；
- 缩短事务；
- 不在事务中等待网络调用；
- 为批量更新设置稳定排序；
- 避免无索引条件导致大范围扫描和锁等待；
- 不用无限重试掩盖设计问题。

## 查看锁与等待关系

```sql
SELECT
    a.pid,
    a.usename,
    a.state,
    a.wait_event_type,
    a.wait_event,
    now() - a.xact_start AS transaction_age,
    a.query
FROM pg_stat_activity AS a
WHERE a.datname = current_database()
ORDER BY a.xact_start NULLS LAST;
```

查看 `pg_locks`：

```sql
SELECT
    l.pid,
    l.locktype,
    l.mode,
    l.granted,
    l.relation::regclass AS relation,
    a.query
FROM pg_locks AS l
LEFT JOIN pg_stat_activity AS a ON a.pid = l.pid
ORDER BY l.granted, l.pid;
```

使用 `pg_blocking_pids()` 定位阻塞者：

```sql
SELECT
    pid,
    pg_blocking_pids(pid) AS blocking_pids,
    now() - query_start AS query_age,
    query
FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0;
```

不要在不了解事务内容时直接终止生产连接。先确认阻塞者、事务年龄、业务影响和是否存在回滚成本。

## 超时设置

```sql
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
```

- `lock_timeout` 限制等待锁时间；
- `statement_timeout` 限制语句总执行时间；
- `idle_in_transaction_session_timeout` 限制事务打开后长时间空闲。

设置必须结合业务延迟目标。超时过短会放大瞬时抖动，过长则让连接和锁长期占用。

## 应用重试整个事务

伪代码：

```python
import random
import time


def run_transaction_with_retry(operation, attempts: int = 3):
    for attempt in range(attempts):
        try:
            return operation()
        except SerializationFailure:
            if attempt == attempts - 1:
                raise
            time.sleep((2**attempt) * 0.05 + random.random() * 0.05)
```

重试函数内部的操作必须可以安全重新执行。邮件、扣款和外部请求等副作用应通过 Outbox、幂等键或事务提交后的可靠任务处理。

## 生产检查清单

- [ ] 每个业务动作有明确事务边界；
- [ ] 事务内不等待用户输入或慢外部 API；
- [ ] 库存、余额等竞争写入使用条件更新、版本号或 `FOR UPDATE`；
- [ ] 多资源锁定采用一致顺序；
- [ ] Serializable 和 Repeatable Read 失败会重试整个事务；
- [ ] 重试操作具备幂等性，外部副作用不被重复执行；
- [ ] 设置锁等待、语句和空闲事务超时；
- [ ] 监控长事务、阻塞链和死锁日志；
- [ ] 运维脚本在终止连接前确认业务影响；
- [ ] 并发测试覆盖竞争更新和重试路径。

## 参考资料

- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL Serialization Failure Handling](https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html)
- [PostgreSQL Lock Monitoring](https://www.postgresql.org/docs/current/monitoring-locks.html)

> 本文补充现有 PostgreSQL 查询优化系列，重点覆盖并发写入和事务失败后的恢复边界。
