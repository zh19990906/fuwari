---
title: FastAPI 数据库工程：SQLAlchemy 2.x、事务、连接池与 Alembic
published: 2026-08-04
updated: 2026-08-04
description: 使用 SQLAlchemy 2.x 和 Alembic 管理 FastAPI 数据访问，覆盖 Session 生命周期、事务、连接池、N+1 查询、迁移和发布顺序。
tags: [Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL]
category: Python
contentType: docs
docGroup: python
docSection: Web 工程
docOrder: 130
draft: false
---

FastAPI 负责请求生命周期，SQLAlchemy `Session` 负责一个数据库工作单元。最常见的问题不是 ORM 语法，而是 Session 被跨请求共享、异常后没有回滚、连接池容量被多 Worker 放大，以及数据库 Schema 与代码版本不同步。

本文使用 SQLAlchemy 2.x 风格。同步和异步方案都可以正确工作，关键是从入口到驱动保持一致，不在异步路由中偷偷执行阻塞数据库调用。

## 推荐目录

```text
app/
├── main.py
├── db.py
├── models.py
├── schemas.py
├── repositories/
├── services/
└── api/
alembic/
alembic.ini
```

`db.py` 只负责 Engine、连接池和 Session 工厂；业务事务由 service 层控制；路由负责 HTTP 输入输出，不把 ORM 对象生命周期暴露给外部。

## 创建 Engine 和 sessionmaker

```python
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=5,
    pool_timeout=5,
    pool_pre_ping=True,
)

SessionFactory = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)
```

`pool_pre_ping` 可以在取连接时发现部分失效连接，但不能替代数据库高可用、请求超时和应用重试。不要把 `max_connections` 全部分给一个服务。

## 每个请求一个 Session

```python
from collections.abc import Generator
from sqlalchemy.orm import Session


def get_db() -> Generator[Session, None, None]:
    with SessionFactory() as session:
        yield session
```

```python
from typing import Annotated
from fastapi import Depends

DbSession = Annotated[Session, Depends(get_db)]
```

`Session` 是有状态事务对象，不应作为全局单例，也不能在并发线程或 asyncio Task 之间共享。请求结束必须关闭，未提交事务会随连接归还而回滚。

## SQLAlchemy 2 查询方式

```python
from sqlalchemy import select


def get_user_by_email(session: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    return session.scalar(statement)
```

不要继续围绕旧 `Query` API 设计新代码。复杂查询应返回明确结构，避免把整个 ORM 实体直接作为 API 响应。

## 事务由业务动作控制

创建订单、扣减库存和写审计日志属于一个业务事务时，应由 service 层统一提交。

```python
from sqlalchemy.exc import IntegrityError


def create_article(session: Session, command: CreateArticle) -> Article:
    article = Article(
        title=command.title,
        owner_id=command.owner_id,
    )
    session.add(article)

    try:
        session.flush()
        session.add(
            AuditEvent(
                actor_id=command.owner_id,
                action="article.created",
                resource_id=article.id,
            )
        )
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ArticleConflictError()

    return article
```

异常后必须先 `rollback()` 才能继续使用 Session。不要在 repository 的每个小函数里自动 `commit()`，否则上层无法把多个写操作组成一个原子事务。

更紧凑的写法是事务上下文：

```python
with SessionFactory.begin() as session:
    session.add(article)
    session.add(audit_event)
```

上下文正常退出时提交，异常时回滚并关闭。

## 不要把 Session 传给后台任务

FastAPI 请求依赖提供的 Session 会在响应生命周期结束后关闭。后台任务只接收不可变 ID，并自行建立资源生命周期。

```python
def refresh_search_index(article_id: str) -> None:
    with SessionFactory() as session:
        article = session.get(Article, article_id)
        if article is None:
            return
        update_index(article)
```

如果任务不可丢失，应在请求事务中写入 Outbox 或任务表，再由独立 Worker 消费，而不是依赖进程内后台任务。

## N+1 查询

加载文章列表后逐条访问作者关系，可能产生一次列表查询加 N 次作者查询。

```python
from sqlalchemy.orm import selectinload

statement = (
    select(Article)
    .options(selectinload(Article.author))
    .order_by(Article.created_at.desc())
    .limit(50)
)
articles = session.scalars(statement).all()
```

`selectinload`、`joinedload` 和显式 JOIN 的选择取决于数据量和返回形状。开启 SQL 日志或查询统计验证实际 SQL，不要凭 ORM 代码外观看性能。

## 分页避免无限 offset

简单后台页面可以使用 `LIMIT/OFFSET`。大表连续翻页更适合基于稳定排序键的游标分页。

```python
statement = (
    select(Article)
    .where(Article.id > after_id)
    .order_by(Article.id)
    .limit(page_size)
)
```

排序字段必须稳定且有索引。客户端传入的页大小要设置上限。

## 异步数据库访问

使用异步路由时需要异步驱动和 `AsyncSession`。

```python
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

async_engine = create_async_engine(
    os.environ["ASYNC_DATABASE_URL"],
    pool_size=10,
    max_overflow=5,
    pool_pre_ping=True,
)

AsyncSessionFactory = async_sessionmaker(
    async_engine,
    expire_on_commit=False,
)


async def get_async_db():
    async with AsyncSessionFactory() as session:
        yield session
```

每个并发 Task 使用独立 `AsyncSession`。不要用一个 Session 同时执行多个协程，也不要在异步 Session 中触发隐式懒加载网络 I/O。

## Worker 与连接池容量

连接上界至少要按部署副本计算：

```text
连接上界 ≈ replicas × workers × (pool_size + max_overflow)
```

还要预留迁移、后台任务、监控、备份、管理连接和滚动发布中新旧副本重叠。`pool_timeout` 应小于请求总超时，连接耗尽时快速失败比无限等待更容易恢复。

## Alembic 初始化

```bash
python -m pip install alembic
alembic init alembic
```

在 `alembic/env.py` 中导入模型元数据：

```python
from app.models import Base

target_metadata = Base.metadata
```

生成迁移：

```bash
alembic revision --autogenerate -m "add article status"
```

自动生成只是草稿，必须人工检查：

- 是否误删列或索引；
- 新增非空列是否有数据回填；
- 枚举和约束是否可回滚；
- 大表操作是否长时间持锁；
- `downgrade()` 是否真实可执行。

## 安全的发布顺序

不兼容 Schema 变更使用 expand/contract：

1. 先新增兼容列或表；
2. 发布同时兼容新旧结构的应用；
3. 后台回填历史数据；
4. 切换读写到新结构；
5. 确认旧版本已退出；
6. 最后删除旧列和约束。

不要让多个 Web 实例同时自动执行迁移。使用单独发布 Job，在应用扩容前完成经过审查的迁移。

## 生产检查清单

- [ ] 每个请求或任务使用独立 Session；
- [ ] Session 在所有路径都能关闭，异常后明确回滚；
- [ ] 事务边界位于业务 service 层，而不是分散在 repository；
- [ ] 连接池容量按副本和 Worker 总数计算；
- [ ] 查询、连接和请求均设置超时；
- [ ] 列表接口限制页大小，并检查 N+1 查询；
- [ ] 异步路由只使用异步驱动和独立 AsyncSession；
- [ ] Alembic 自动生成结果经过人工审查；
- [ ] 迁移在独立 Job 中运行，并有备份和回滚计划；
- [ ] CI 使用空数据库执行 `alembic upgrade head` 和应用测试。

## 参考资料

- [SQLAlchemy 2.0 Session Basics](https://docs.sqlalchemy.org/en/20/orm/session_basics.html)
- [SQLAlchemy asyncio Extension](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
- [Alembic Tutorial](https://alembic.sqlalchemy.org/en/latest/tutorial.html)

> 本文补充 FastAPI 数据库工程主线，示例以 SQLAlchemy 2.x 和 Alembic 官方文档为准。
