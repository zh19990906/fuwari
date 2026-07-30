---
title: Python 安全访问 PostgreSQL：参数化查询、事务与连接池
published: 2023-02-20
updated: 2026-07-30
description: 使用 psycopg 编写参数化 SQL、管理事务，并通过连接池支撑 Web 与批处理任务。
tags: [PostgreSQL, Python, psycopg, SQL, 连接池]
category: PostgreSQL
contentType: docs
docGroup: postgresql
docSection: 应用接入
docOrder: 50
draft: false
---

Python 访问 PostgreSQL 时，最重要的不是把连接代码封装成一个“万能工具类”，而是明确连接生命周期、参数化查询、事务边界和并发上限。本篇使用 psycopg 3。

## 安装与连接字符串

```bash
pip install "psycopg[binary,pool]"
export DATABASE_URL='postgresql://app_user:replace-me@db.example.com:5432/app'
```

连接字符串应由环境变量、密钥管理服务或部署平台注入，不要写进源码和镜像。

## 参数化查询

```python
import os

import psycopg
from psycopg.rows import dict_row

with psycopg.connect(
    os.environ["DATABASE_URL"],
    row_factory=dict_row,
) as conn:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, title, published_at
            FROM articles
            WHERE published_at >= %s
            ORDER BY published_at DESC
            """,
            ("2026-01-01",),
        )
        rows = cursor.fetchall()

for row in rows:
    print(row["id"], row["title"])
```

占位符由驱动处理。不要使用 f-string、字符串拼接或 `%` 运算把用户输入直接放进 SQL：

```python
# 不安全：不要这样写
# cursor.execute(f"SELECT * FROM users WHERE name = '{name}'")
```

参数只能替换值，不能直接替换表名、列名或排序方向。动态标识符要使用 `psycopg.sql`：

```python
from psycopg import sql

query = sql.SQL("SELECT {field} FROM {table} LIMIT %s").format(
    field=sql.Identifier("title"),
    table=sql.Identifier("articles"),
)
cursor.execute(query, (20,))
```

标识符仍应来自应用允许列表，而不是完全信任外部输入。

## 插入并获取主键

PostgreSQL 使用 `RETURNING`：

```python
with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO articles (title, body)
            VALUES (%s, %s)
            RETURNING id
            """,
            ("参数化查询", "正文内容"),
        )
        article_id = cursor.fetchone()[0]

print(article_id)
```

不要使用其他数据库专有的自增 ID 查询语句。

## 事务边界

`with psycopg.connect(...) as conn` 在正常退出时提交事务，异常时回滚：

```python
import psycopg


def transfer_points(source_id: int, target_id: int, amount: int) -> None:
    if amount <= 0:
        raise ValueError("amount must be positive")

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE accounts
                SET points = points - %s
                WHERE id = %s AND points >= %s
                RETURNING id
                """,
                (amount, source_id, amount),
            )
            if cursor.fetchone() is None:
                raise ValueError("insufficient points or source not found")

            cursor.execute(
                "UPDATE accounts SET points = points + %s WHERE id = %s",
                (amount, target_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("target not found")
```

异常会让两次更新一起回滚。不要在业务流程中间随意 `commit()`，否则无法保持原子性。

## 批量写入

小批量可以使用 `executemany`：

```python
rows = [
    ("first", "body-1"),
    ("second", "body-2"),
]

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    with conn.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO articles (title, body) VALUES (%s, %s)",
            rows,
        )
```

大量导入应评估 `COPY`，并控制批次大小，避免单个事务占用过多 WAL、锁和内存。

## 连接池

Web 服务和并发任务不应为每个小查询无限创建新连接。使用连接池限制并发：

```python
import os

from psycopg_pool import ConnectionPool

pool = ConnectionPool(
    os.environ["DATABASE_URL"],
    min_size=1,
    max_size=10,
    timeout=10,
)

with pool.connection() as conn:
    with conn.cursor() as cursor:
        cursor.execute("SELECT now()")
        print(cursor.fetchone()[0])

pool.close()
```

池大小应结合：

- PostgreSQL `max_connections`；
- 应用实例数量；
- 后台任务和管理连接；
- 查询耗时；
- 是否使用 PgBouncer。

例如每个实例配置 20 个连接、部署 20 个实例，就可能产生 400 个连接。不要只看单个进程的配置。

## 游标和连接不要全局常驻

一个全局连接或游标容易出现：

- 网络中断后对象失效；
- 多线程并发使用同一游标；
- 事务长时间未提交；
- 空闲事务持有锁；
- 应用关闭时资源没有释放。

正确做法是从连接池短暂借用连接，在清晰的事务范围内完成操作后归还。

## 超时与保护

可以在数据库角色、连接或事务层设置超时：

```sql
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';
```

Python 中：

```python
with pool.connection() as conn:
    with conn.transaction():
        conn.execute("SET LOCAL statement_timeout = '5s'")
        rows = conn.execute(
            "SELECT id FROM jobs WHERE status = %s",
            ("pending",),
        ).fetchall()
```

还应限制返回行数，避免无条件读取整张大表。

## 日志与错误处理

不要把完整连接字符串、SQL 参数中的个人数据或密码写入日志。建议记录：

- 操作名称；
- 受影响行数；
- 耗时；
- PostgreSQL 错误类型和 SQLSTATE；
- 请求或任务关联 ID。

对唯一约束、外键约束和序列化冲突分别处理，不要用一个宽泛 `except Exception` 把所有错误都变成“SQL 有问题”。

## 检查清单

```text
1. 连接信息来自环境变量或密钥管理
2. 所有外部值使用参数化查询
3. 动态表名和列名使用 Identifier 与允许列表
4. 事务范围短且清晰
5. 插入主键通过 RETURNING 获取
6. 连接池总量不超过数据库预算
7. 查询设置超时并限制返回规模
8. 日志不输出凭据和敏感参数
```

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
