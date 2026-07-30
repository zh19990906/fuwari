---
title: Python ThreadPoolExecutor 并发实操
published: 2022-08-02
updated: 2026-07-30
description: 使用线程池执行 I/O 密集任务，并正确处理结果、异常、超时和资源释放。
tags: [Python, ThreadPoolExecutor, 并发, 线程池]
category: Python
contentType: docs
docGroup: python
docSection: 并发编程
docOrder: 50
draft: false
---

`ThreadPoolExecutor` 适合把多个阻塞型 I/O 操作并发执行，例如 HTTP 请求、文件读取和数据库访问。它提供固定大小的工作线程池，比手动创建线程更容易回收资源和传播异常。

## 一个完整示例

```python
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import urlopen


def fetch(url: str) -> tuple[str, int]:
    with urlopen(url, timeout=10) as response:
        return url, response.status


urls = [
    "https://example.com",
    "https://www.python.org",
]

with ThreadPoolExecutor(
    max_workers=4,
    thread_name_prefix="fetch",
) as executor:
    futures = {executor.submit(fetch, url): url for url in urls}

    for future in as_completed(futures):
        url = futures[future]
        try:
            _, status = future.result(timeout=15)
            print(url, status)
        except Exception as exc:
            print(url, type(exc).__name__, exc)
```

关键点：

- `with` 会在退出时调用 `shutdown()`，等待工作线程结束；
- `submit()` 返回 `Future`，可以关联输入参数；
- `as_completed()` 按完成顺序返回，而不是提交顺序；
- `future.result()` 会把工作线程中的异常重新抛到主线程。

## `map` 与 `as_completed`

需要保持输入顺序且任务处理方式一致时，可以使用 `map`：

```python
from concurrent.futures import ThreadPoolExecutor


def normalize(value: str) -> str:
    return value.strip().lower()


with ThreadPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(normalize, [" A ", " B ", " C "]))

print(results)
```

`map` 返回结果时保持输入顺序。某个靠前任务很慢时，即使后续任务已经完成，消费结果仍可能被阻塞。

需要尽快处理已完成任务、记录每个输入的异常或做增量输出时，优先使用 `submit` + `as_completed`。

## 线程数如何设置

线程数不是越多越快。需要考虑：

- 下游服务的并发限制；
- 数据库连接池大小；
- 单个请求的内存占用；
- 文件描述符限制；
- 超时和重试带来的请求放大。

可以从较小值开始，通过吞吐、延迟和错误率逐步调整：

```python
max_workers = min(16, max(4, len(urls)))
```

不要在每次函数调用时都创建一个巨大线程池。长期服务可以在明确的生命周期内复用线程池，退出时必须关闭。

## 超时与取消

`future.result(timeout=5)` 的超时只表示主线程等待结束，不会自动终止已经运行的底层阻塞调用。因此，真正的网络或数据库函数也必须设置自己的超时。

```python
from concurrent.futures import TimeoutError

try:
    result = future.result(timeout=5)
except TimeoutError:
    cancelled = future.cancel()
    print("cancelled before start:", cancelled)
```

`cancel()` 只能取消尚未开始执行的任务。已经运行的线程不能被安全强杀，应让任务函数支持连接超时、截止时间或协作式停止标志。

## 异常处理

不要在工作线程中使用裸 `except` 后静默返回 `None`，这会让调用方误以为任务成功。可以让异常自然传播，并在主线程记录上下文：

```python
for future in as_completed(futures):
    item = futures[future]
    try:
        value = future.result()
    except OSError as exc:
        logger.warning("I/O failed for %s: %s", item, exc)
    except Exception:
        logger.exception("unexpected failure for %s", item)
```

批处理任务还应统计成功、失败和重试数量，而不是只打印异常。

## 什么时候不该使用线程池

### CPU 密集任务

纯 Python 的压缩、图像像素循环、密码学计算等 CPU 密集代码通常受 GIL 限制。可以考虑：

- `ProcessPoolExecutor`；
- NumPy、PyTorch 等会释放 GIL 的底层库；
- 原生扩展或任务队列。

### 超大任务集合

一次提交数百万个 `Future` 会占用大量内存。应分批提交，或使用有界队列控制生产速度。

### 异步应用

在 FastAPI、aiohttp 等异步应用中，原生异步客户端通常更合适。只有无法替换的同步阻塞函数才放入线程池，并避免在线程池中再次创建事件循环。

## 实用封装

```python
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TypeVar

T = TypeVar("T")
R = TypeVar("R")


def run_parallel(
    items: Iterable[T],
    worker: Callable[[T], R],
    *,
    max_workers: int = 8,
) -> list[R]:
    results: list[R] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(worker, item): item for item in items}
        for future in as_completed(futures):
            results.append(future.result())
    return results
```

这个封装保留了异常传播，但返回顺序是完成顺序。业务需要输入顺序时应保存索引，或直接使用 `executor.map`。

## 检查清单

```text
1. 任务是否主要等待 I/O
2. 底层网络和数据库调用是否设置超时
3. 线程数是否低于下游连接限制
4. Future 异常是否被读取和记录
5. 线程池是否在退出时关闭
6. 是否避免一次提交过多任务
```

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
