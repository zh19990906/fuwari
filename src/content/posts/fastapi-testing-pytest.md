---
title: FastAPI 测试体系：pytest、TestClient、依赖覆盖与数据库隔离
published: 2026-08-04
updated: 2026-08-04
description: 为 FastAPI 建立可重复的单元与集成测试，覆盖 TestClient、异步接口、依赖覆盖、数据库事务回滚和外部服务替身。
tags: [Python, FastAPI, pytest, TestClient, 测试]
category: Python
contentType: docs
docGroup: python
docSection: Web 工程
docOrder: 120
draft: false
---

接口能在浏览器中返回一次正确结果，不等于它在权限失败、数据库异常、并发修改和外部服务超时时仍然可靠。FastAPI 测试应把路由、依赖、数据库和外部服务边界拆开，让失败能够快速定位。

本文使用 `pytest`、FastAPI `TestClient` 和 HTTPX。测试目标不是追求一个漂亮的覆盖率数字，而是为关键业务规则和失败路径建立可重复证据。

## 测试层次

| 层次 | 主要验证 | 是否访问真实外部依赖 |
|---|---|---|
| 纯函数单元测试 | 校验、权限、转换、计算 | 否 |
| 路由测试 | 状态码、响应体、依赖组合 | 通常否 |
| 数据库集成测试 | SQL、事务、约束、迁移 | 使用隔离测试库 |
| 契约测试 | 与外部 API 的请求响应格式 | 使用沙箱或录制契约 |
| 端到端测试 | 部署后的关键用户路径 | 是，但数量应少 |

不要把所有测试都写成完整 HTTP + 真数据库 + 真第三方服务。测试越慢、越不稳定，开发者越容易跳过它。

## 最小 TestClient 测试

```bash
python -m pip install pytest httpx
```

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

测试应断言业务需要的字段，而不是把整个大型响应做脆弱快照。时间、随机 ID 和排序不稳定的集合需要先规范化。

## 使用 fixture 统一创建客户端

```python
import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def app():
    return create_app(testing=True)


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client
```

使用上下文管理器可以让应用的 lifespan 启动和关闭逻辑在测试中执行。不要在模块导入时连接数据库、Redis 或外部 API，否则测试还没开始就产生不可控副作用。

## dependency_overrides 替换外部依赖

FastAPI 可以通过 `app.dependency_overrides` 在测试中替换认证、数据库或第三方客户端依赖。

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class TestPrincipal:
    user_id: str
    permissions: frozenset[str]


async def override_current_user() -> TestPrincipal:
    return TestPrincipal(
        user_id="user-test-1",
        permissions=frozenset({"article:read"}),
    )


def test_list_articles_as_user(app, client):
    app.dependency_overrides[get_current_principal] = override_current_user
    try:
        response = client.get("/articles")
        assert response.status_code == 200
    finally:
        app.dependency_overrides.clear()
```

必须在测试后清理覆盖，否则后续测试会继承错误身份。可以通过 fixture 自动清理：

```python
@pytest.fixture(autouse=True)
def clear_overrides(app):
    yield
    app.dependency_overrides.clear()
```

## 身份和权限要分别测试

至少覆盖：

- 无 Authorization Header 返回 `401`；
- 无效或过期令牌返回 `401`；
- 已登录但权限不足返回 `403`；
- 资源所有者可以修改自己的资源；
- 普通用户不能修改他人资源；
- 管理权限是否按设计覆盖资源所有者规则；
- 禁用账号不能继续访问。

不要只测试管理员成功路径。越权通常发生在“普通账号访问别人的资源”这一类横向权限场景。

## 测试数据库使用事务回滚

测试库应和生产库使用相同数据库引擎，尤其是依赖 PostgreSQL 锁、JSON、数组、约束或事务隔离时。SQLite 适合纯 SQLAlchemy 基础测试，但不能代表 PostgreSQL 行为。

常用策略是每个测试开启外层事务，测试结束后统一回滚：

```python
import pytest
from sqlalchemy.orm import Session


@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, expire_on_commit=False)

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
```

再覆盖应用数据库依赖：

```python
@pytest.fixture
def client_with_db(app, client, db_session):
    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    yield client
```

如果应用代码会调用 `commit()`，需要使用 SAVEPOINT 或在测试 Session 中重新绑定事务事件。选择何种模式必须通过实际提交、异常回滚和唯一约束测试验证，而不是只看简单查询通过。

## 迁移必须在测试库执行

测试启动前使用 Alembic 升级到目标版本，可以捕获“ORM 模型存在但迁移缺失”的问题。

```bash
alembic upgrade head
pytest -q
```

CI 不应直接对长期共享测试库反复迁移。更稳定的方式是为每个 Job 创建临时数据库或启动独立 PostgreSQL Service Container。

## 异步测试

异步业务函数可以直接使用 pytest 异步插件和 HTTPX `AsyncClient`。

```python
import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.anyio
async def test_async_health(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        response = await client.get("/health")

    assert response.status_code == 200
```

不要在正在运行的事件循环里调用 `asyncio.run()`。同步与异步 fixture 的生命周期要与客户端和数据库连接保持一致。

## 外部 HTTP 服务使用明确替身

测试不应依赖真实短信、邮件、支付或模型 API。优先把外部调用封装为客户端接口，再替换实现。

```python
class FakeNotifier:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str]] = []

    async def send(self, recipient: str, message: str) -> None:
        self.messages.append((recipient, message))
```

断言最终业务行为，而不是过度断言内部调用次数。对于外部协议格式，单独增加契约测试，确认请求字段、签名和错误映射。

## 测试异常和边界输入

每个写接口至少考虑：

- 缺失字段和格式错误；
- 超长字符串、空列表和重复项；
- 唯一约束冲突；
- 资源不存在；
- 下游超时；
- 数据库异常后的事务状态；
- 重复请求和幂等键；
- 并发更新产生的版本冲突。

错误响应也应有稳定契约，例如错误代码、可读消息和关联 ID，而不是把数据库异常文本直接返回客户端。

## 覆盖率的正确使用

```bash
pytest --cov=app --cov-report=term-missing
```

覆盖率只能提示“哪些代码没有执行”，不能证明断言正确。优先覆盖认证授权、金额状态、事务边界、重试和错误映射；自动生成模型和简单属性不需要为了数字编写低价值测试。

## 生产检查清单

- [ ] 测试可以在全新环境中独立运行；
- [ ] 路由测试不调用收费或不稳定的真实第三方服务；
- [ ] `dependency_overrides` 在每个测试后清理；
- [ ] PostgreSQL 特性使用真实 PostgreSQL 测试；
- [ ] 每个测试拥有隔离数据并通过事务回滚或临时数据库清理；
- [ ] Alembic 迁移在 CI 测试库中执行；
- [ ] `401`、`403`、资源所有者和禁用账号路径均有覆盖；
- [ ] 下游超时、数据库异常和重复请求有测试；
- [ ] 异步测试不嵌套事件循环；
- [ ] 失败输出不泄露密码、令牌或完整数据库连接串。

## 参考资料

- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [FastAPI Testing Dependencies with Overrides](https://fastapi.tiangolo.com/advanced/testing-dependencies/)
- [pytest Documentation](https://docs.pytest.org/)

> 本文补充现有 FastAPI Web 工程系列，重点建立可重复的测试和隔离边界。
