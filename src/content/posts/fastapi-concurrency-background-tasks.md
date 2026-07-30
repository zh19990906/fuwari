---
title: FastAPI 并发模型与后台任务
published: 2026-07-30
updated: 2026-07-30
description: 正确选择 async def、同步线程池和 BackgroundTasks，并评估多 Worker 对数据库连接池和应用资源的放大效应。
tags: [Python, FastAPI, asyncio, BackgroundTasks, 并发]
category: Python
contentType: docs
docGroup: python
docSection: Web 工程
docOrder: 100
draft: false
---

FastAPI 可以同时运行同步和异步路径函数，但“写成 `async def`”不会让任何代码自动变成非阻塞。真正决定并发行为的是调用链中的网络、数据库、文件和 CPU 操作是否能够在等待时让出执行权。

后台任务也不是独立任务队列。`BackgroundTasks` 适合响应返回后在同一应用进程中完成少量、短时间、允许丢失的工作；需要重试、状态查询和跨部署存活的任务应交给持久化队列或工作流系统。

## 先按工作类型选择执行方式

| 工作类型 | 推荐方式 |
|---|---|
| 原生异步 HTTP / 数据库调用 | `async def` + `await` |
| 只能使用同步阻塞客户端 | 普通 `def`，或在异步路径中使用 `asyncio.to_thread` |
| 纯 Python CPU 密集计算 | 独立进程、任务 Worker 或原生计算库 |
| 响应后执行的短小非关键工作 | `BackgroundTasks` |
| 需要重试、持久状态或执行数分钟以上 | 外部任务队列 / 工作流引擎 |

不要用“接口是否需要等待结果”来判断 `def` 或 `async def`。两种函数都可以返回结果，区别是等待 I/O 时如何调度其他请求。

## `async def` 适合原生异步调用链

```python
import httpx
from fastapi import FastAPI


app = FastAPI()


@app.get("/status/{service_name}")
async def read_status(service_name: str) -> dict[str, object]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(
            "https://status.example.com/api/services",
            params={"name": service_name},
        )
        response.raise_for_status()
        return response.json()
```

在 `await client.get(...)` 等待网络时，事件循环可以处理其他请求。

如果在 `async def` 中直接调用同步阻塞函数：

```python
@app.get("/bad")
async def bad_endpoint():
    return blocking_sdk_call()
```

`blocking_sdk_call()` 会占住事件循环线程，其他协程无法正常推进，直到它返回。

## 普通 `def` 的执行方式

FastAPI 会把普通同步路径函数放入线程池执行：

```python
@app.get("/legacy/{item_id}")
def read_legacy_item(item_id: str) -> dict[str, str]:
    return legacy_sync_client.fetch(item_id)
```

这适合无法替换的同步 I/O SDK，但要注意：

- 线程池容量有限；
- 阻塞很久的请求会占用工作线程；
- 同步数据库客户端仍受连接池限制；
- 增加线程数不会让下游服务容量变大；
- CPU 密集 Python 代码不会因为放在线程池中就高效并行。

### 普通工具函数不会被 FastAPI 自动调度

FastAPI 只会根据路径函数和依赖函数的声明选择调用方式。你在 `async def` 内直接调用的普通 Python 函数，仍然在当前事件循环线程同步执行。

```python
async def endpoint():
    # 这是普通函数调用，不会自动进入 FastAPI 线程池。
    result = blocking_function()
    return result
```

## 在异步路径中隔离无法替换的同步 I/O

Python 提供 `asyncio.to_thread()`：

```python
import asyncio

from fastapi import FastAPI


app = FastAPI()


def load_with_legacy_sdk(item_id: str) -> dict[str, str]:
    return legacy_sync_client.fetch(item_id)


@app.get("/items/{item_id}")
async def read_item(item_id: str) -> dict[str, str]:
    return await asyncio.to_thread(load_with_legacy_sdk, item_id)
```

它适合不可替换的阻塞 I/O。仍需给底层客户端设置真正的连接和读取超时，因为取消等待协程并不能安全强杀已经运行的线程函数。

CPU 密集任务不应大量塞进默认线程池。可以使用独立任务 Worker、`ProcessPoolExecutor`，或者 NumPy、PyTorch 等在原生层执行并释放 GIL 的库。

## `BackgroundTasks` 的适用范围

```python
import logging

from fastapi import BackgroundTasks, FastAPI, status


logger = logging.getLogger(__name__)
app = FastAPI()


def record_noncritical_event(item_id: str, action: str) -> None:
    logger.info("item=%s action=%s", item_id, action)


@app.post("/items/{item_id}/refresh", status_code=status.HTTP_202_ACCEPTED)
async def request_refresh(
    item_id: str,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    background_tasks.add_task(
        record_noncritical_event,
        item_id,
        "refresh-requested",
    )
    return {"status": "accepted", "item_id": item_id}
```

任务会在响应发送后由当前应用进程执行。函数可以是普通 `def` 或 `async def`，但这不改变它的可靠性边界。

适合的任务：

- 写一条非关键日志；
- 更新可丢失的本地指标；
- 小型缓存清理；
- 失败后允许用户重新触发的短操作。

不适合的任务：

- 必须送达的通知；
- 需要自动重试的 Webhook；
- 视频转码、模型推理或大文件处理；
- 需要任务 ID 和进度查询的工作；
- 跨服务的业务状态迁移；
- Worker 重启后必须继续的任务。

`BackgroundTasks` 没有内置持久化、确认、重试、调度和任务状态。部署重启或 Worker 被终止时，尚未完成的任务可能丢失。

## 不要把请求级资源传给后台任务

依赖函数通过 `yield` 提供的数据库 Session、事务或客户端，可能在响应生命周期结束时被关闭。不要把这些对象直接传入后台任务。

不推荐：

```python
background_tasks.add_task(update_record, request_scoped_session, item_id)
```

推荐传递不可变标识，并让任务自己创建和释放需要的资源：

```python
def update_record_in_background(item_id: str) -> None:
    with create_session() as session:
        record = session.get(Item, item_id)
        if record is None:
            return
        record.refresh_requested = True
        session.commit()


background_tasks.add_task(update_record_in_background, item_id)
```

如果这个写入不可丢失，就不应该依赖 `BackgroundTasks`，而应先在请求事务中写入任务记录或 Outbox，再由独立 Worker 执行。

## 使用 `lifespan` 管理每个 Worker 的共享资源

长期客户端和连接池应在应用启动时创建，在关闭时释放：

```python
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(5.0, connect=2.0),
        limits=httpx.Limits(
            max_connections=50,
            max_keepalive_connections=20,
        ),
    )
    try:
        yield
    finally:
        await app.state.http_client.aclose()


app = FastAPI(lifespan=lifespan)


@app.get("/health/dependency")
async def dependency_health(request: Request):
    response = await request.app.state.http_client.get(
        "https://status.example.com/health"
    )
    return {"upstream_status": response.status_code}
```

每个 Worker 都是独立进程，会分别运行自己的 `lifespan`。不要误以为四个 Worker 共享同一个 Python 客户端或同一个进程内连接池。

## 多 Worker 会放大数据库连接数

假设每个 Worker 的数据库池允许 `pool_size` 条常驻连接，最简单的上界是：

```text
total_possible_connections = workers * pool_size
```

如果还配置了临时溢出连接和多个部署副本：

```text
total_possible_connections
= replicas * workers * (pool_size + max_overflow)
```

例如应用扩容、滚动发布的新旧副本重叠、后台 Worker 和管理脚本都会继续占用连接。数据库最大连接数不能全部分配给 Web 应用，还要预留：

- 管理和迁移连接；
- 监控与备份；
- 后台任务；
- 故障转移和滚动发布；
- 其他服务；
- 应急操作空间。

不要仅根据 CPU 核心数增加 Worker。需要结合单请求内存、外部连接、延迟目标和实际负载测试。

启动多个进程的示例：

```bash
fastapi run --workers 4 app.py
```

容器编排环境通常更适合每个容器运行一个进程，再通过副本数量扩缩容；具体方式取决于平台的健康检查、资源限制和进程管理策略。

## 避免嵌套事件循环

历史代码常见：

```python
loop = asyncio.get_event_loop()
loop.run_until_complete(async_function())
```

在 FastAPI 正在运行的事件循环中再次调用 `run_until_complete()` 会失败，也破坏了调用链的并发模型。

正确选择：

- 当前函数已经是异步函数：直接 `await async_function()`；
- 同步脚本的最外层入口：使用 `asyncio.run(main())`；
- 异步代码调用阻塞同步函数：使用 `await asyncio.to_thread(...)`；
- 从其他线程向已运行事件循环提交协程：使用明确的线程安全桥接方式，并管理 Future 结果；
- 框架管理事件循环时：不要自行创建、运行或关闭它。

```python
import asyncio


async def main() -> None:
    await async_function()


if __name__ == "__main__":
    asyncio.run(main())
```

## 超时、取消与资源释放

API 层的超时不一定能停止底层工作：

- HTTP 客户端要设置连接、读取、写入和连接池超时；
- 数据库查询要有语句或事务超时；
- 线程中的阻塞函数需要自己的超时；
- Background Task 要记录异常，不能静默失败；
- 应用关闭时要停止接收新请求，并给在途请求有限完成时间；
- 长任务要支持取消标志或持久状态机。

对外返回 `202 Accepted` 只表示请求已接受，不代表后台业务一定会完成。需要可靠任务时，应返回持久化任务 ID，并提供状态查询接口。

## 常见错误

### 在 `async def` 里使用同步 HTTP 客户端

这会阻塞事件循环。改用异步客户端，或临时放入 `asyncio.to_thread()`。

### 为每次请求创建新的连接池

会增加握手、连接数和资源抖动。使用 `lifespan` 创建每 Worker 的共享资源。

### Worker 数量增加后数据库耗尽

检查 `workers * pool_size`，再乘部署副本和溢出连接；数据库池不是每个服务的全局共享值。

### 把重要任务交给 `BackgroundTasks`

进程退出后没有恢复能力。先持久化任务或 Outbox，再由独立 Worker 处理。

### 捕获异常后返回成功

无论请求内还是后台工作，都应记录结构化上下文并区分可重试、不可重试和业务拒绝。

## 生产环境检查清单

```text
1. 每条 I/O 调用链是否保持一致的同步或异步模型
2. async def 中是否仍有未隔离的阻塞函数
3. 底层 HTTP、数据库和 SDK 是否设置真实超时
4. CPU 密集任务是否移出 Web 事件循环和默认线程池
5. BackgroundTasks 是否只承载短小、非关键、允许丢失的工作
6. 后台任务是否只接收 ID 或不可变数据，不复用请求级资源
7. 共享客户端是否在 lifespan 中初始化和关闭
8. 是否按 replicas * workers * pool capacity 估算数据库连接
9. 滚动发布和后台 Worker 是否已计入连接预留
10. 是否避免在运行中的事件循环调用 run_until_complete
11. 应用关闭时是否有在途请求与任务的有限排空策略
12. 是否监控事件循环延迟、线程池、连接池、任务失败和请求超时
```

## 官方参考

- [FastAPI 并发与 async / await](https://fastapi.tiangolo.com/async/)
- [FastAPI Background Tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [FastAPI Lifespan Events](https://fastapi.tiangolo.com/advanced/events/)
- [FastAPI Server Workers](https://fastapi.tiangolo.com/deployment/server-workers/)
- [FastAPI Deployment Concepts](https://fastapi.tiangolo.com/deployment/concepts/)
- [Python asyncio](https://docs.python.org/3/library/asyncio/)
- [Python Event Loop Executor](https://docs.python.org/3/library/asyncio-eventloop.html#executing-code-in-thread-or-process-pools)

> 本文根据早期个人笔记重新整理，并结合当前官方文档进行了校对。
