---
title: Python 生产环境使用 Redis
author: placeholder
published: 2026-07-30
updated: 2026-07-30
description: 使用 redis-py 管理连接池、超时、TTL、Pipeline、SCAN 和并发占位，并理解单实例方案的可靠性边界。
tags: [Python, Redis, redis-py, 缓存, 数据服务]
category: Python
contentType: docs
docGroup: python
docSection: 数据服务
docOrder: 70
draft: false
---

Redis 常被用作缓存、会话存储、限流计数器、任务去重和短期状态服务。真正进入生产环境后，重点不再是会不会调用 `set()` 和 `get()`，而是连接如何复用、命令是否有边界、键能否过期，以及故障时应用会怎么退化。

本文只讨论 Python 客户端侧的工程实践，不包含 Redis Server、Sentinel 或 Cluster 的完整部署教程。

## 安装 redis-py

```bash
pip install -U redis
```

`redis-py` 同时提供同步与 `asyncio` 客户端。同步脚本或同步 Web Worker 可以使用 `redis.Redis`；已经运行在事件循环中的应用应优先使用 `redis.asyncio.Redis`，避免同步网络调用阻塞事件循环。

## 使用 URL 与共享连接池

连接信息通过环境变量注入：

```bash
export REDIS_URL="rediss://<username>:<credential>@redis.example.com:6380/0"
```

示例代码：

```python
import os

import redis


pool = redis.ConnectionPool.from_url(
    os.environ["REDIS_URL"],
    decode_responses=True,
    max_connections=20,
    socket_connect_timeout=2,
    socket_timeout=2,
    health_check_interval=30,
)

client = redis.Redis(connection_pool=pool)

try:
    client.ping()
    client.set("demo:greeting", "hello", ex=60)
    print(client.get("demo:greeting"))
finally:
    client.close()
    pool.close()
```

关键参数：

| 参数 | 作用 |
|---|---|
| `socket_connect_timeout` | 限制建立连接等待时间 |
| `socket_timeout` | 限制命令响应等待时间 |
| `health_check_interval` | 空闲连接复用前周期性检查 |
| `max_connections` | 限制客户端池可占用的最大连接数 |
| `decode_responses` | 自动把字节响应按编码转换为字符串 |

这里使用 `Redis(connection_pool=pool)`，客户端不拥有共享池，池由应用生命周期统一关闭。`Redis.from_pool(pool)` 适合单个客户端独占连接池的场景；它会接管池的生命周期，关闭客户端时也会关闭池，不应让多个请求级客户端同时接管同一个池。

生产环境优先使用 TLS 的 `rediss://` URL、Redis ACL 用户和密钥管理服务。不要把完整连接 URL 写入日志或异常响应，因为 URL 可能包含凭据。

## 数据结构怎么选

### String

适合缓存单值、计数器、序列化结果和短期令牌状态。

```python
client.set("cache:article:42", "rendered-content", ex=300)
value = client.get("cache:article:42")
```

### Hash

适合保存一个对象的少量字段，允许独立更新字段。

```python
client.hset(
    "session:demo-user",
    mapping={
        "locale": "zh-CN",
        "theme": "dark",
    },
)
client.expire("session:demo-user", 1800)
```

### Set

适合无重复成员、标签集合和已经处理过的业务 ID。

```python
added = client.sadd("job:processed", "event-001")
if added == 1:
    print("first time")
```

Set 自身不会自动过期。用于时间窗口去重时，需要在首次创建键后设置 TTL，或者使用专门的数据结构和清理策略。

### List

适合简单的有序列表和有限长度日志，但不能替代具备确认、重试和消费组语义的消息队列。

```python
with client.pipeline(transaction=False) as pipe:
    pipe.lpush("recent:events", "event-003")
    pipe.ltrim("recent:events", 0, 99)
    pipe.execute()
```

## TTL 是缓存设计的一部分

缓存键如果没有 TTL，可能在业务数据已经变化后永久保留旧值，也可能让内存持续增长。

```python
client.set("cache:profile:42", "...", ex=600)
remaining = client.ttl("cache:profile:42")
```

要明确：

- TTL 从什么时候开始；
- 写入新值是否重置 TTL；
- 缓存未命中时如何回源；
- 回源失败时是否允许使用旧值；
- 大量键同时过期是否造成请求尖峰；
- 业务删除时是否主动清理相关键。

对热点键可以加入随机抖动，避免大量缓存同一秒失效：

```python
import random

base_ttl = 600
client.set(
    "cache:item:42",
    "...",
    ex=base_ttl + random.randint(0, 60),
)
```

## Pipeline 减少往返

Pipeline 可以把多条命令批量发送，减少网络往返次数：

```python
with client.pipeline(transaction=False) as pipe:
    for item_id in range(1, 101):
        pipe.hgetall(f"item:{item_id}")
    items = pipe.execute()
```

`transaction=False` 表示只做批量传输，不自动提供 `MULTI/EXEC` 事务语义。即使使用事务，Redis 事务也不会像关系数据库那样在命令报错时自动回滚所有业务效果。

Pipeline 过大也会增加客户端内存、单次响应体积和 Redis 处理延迟。应按可控批次执行，而不是一次堆积数十万条命令。

## 使用 `SCAN`，不要在线上大键空间执行 `KEYS`

`KEYS pattern` 会遍历当前数据库的全部键。键空间很大时，单次命令可能长时间占用 Redis 主线程。

redis-py 提供了迭代器封装：

```python
for key in client.scan_iter(
    match="cache:article:*",
    count=500,
):
    print(key)
```

`SCAN` 是增量游标遍历：

- 一次迭代不会返回全部键；
- 遍历期间键空间可能变化；
- 结果可能重复，调用方应允许幂等处理；
- `count` 是提示值，不保证每批严格数量；
- 不应把扫描结果当成强一致快照。

如果业务经常需要按属性查找键，更好的方案通常是维护显式索引或把查询放到合适的数据库中，而不是频繁扫描 Redis。

## `SET NX EX` 的并发占位

Redis 的单条 `SET` 可以组合“键不存在才写入”和过期时间：

```python
acquired = client.set(
    "dedupe:job:42",
    "worker-a",
    nx=True,
    ex=30,
)

if acquired:
    print("this worker owns the short-lived slot")
else:
    print("another worker already owns it")
```

这适合：

- 短时间防止重复提交；
- 简单任务占位；
- 幂等窗口标记；
- 防止同一个缓存键被同时大量回源。

它不是无条件可靠的分布式锁：

- 任务可能执行超过 TTL；
- 客户端暂停后可能在租约失效后继续写入；
- 删除锁时必须确认值仍属于当前持有者；
- Redis 故障转移和网络分区会影响语义；
- 涉及资金、库存等强一致状态时应使用领域数据库事务或专门协调机制。

释放占位时不能直接无条件 `DEL`，应使用 Lua 脚本比较持有者值后再删除。

## 异步客户端

FastAPI 等异步应用中可以使用：

```python
import os

from redis.asyncio import Redis


async def read_cache(key: str) -> str | None:
    client = Redis.from_url(
        os.environ["REDIS_URL"],
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    try:
        return await client.get(key)
    finally:
        await client.aclose()
```

长期 Web 服务不要为每次请求新建客户端。应在应用 `lifespan` 中创建共享客户端，在关闭阶段执行 `aclose()`。

同步和异步客户端不能通过简单增加 `await` 互换。所依赖的框架、连接池和调用链必须保持一致的并发模型。

## 错误处理与降级

```python
from redis.exceptions import ConnectionError, TimeoutError


def get_optional_cache(key: str) -> str | None:
    try:
        return client.get(key)
    except (ConnectionError, TimeoutError):
        return None
```

只有“缓存不可用时可以安全回源”的读取适合这样降级。下面这些操作不能把错误静默当成成功：

- 分布式限流；
- 幂等占位；
- 会话状态；
- 任务确认；
- 权限相关缓存；
- 业务计数写入。

重试需要限制次数、总时长和可重试错误。对写操作盲目重试可能产生重复效果，应先确认命令是否天然幂等。

## 生产环境检查清单

```text
1. 是否通过环境变量或密钥管理服务提供 REDIS_URL
2. 生产连接是否使用 TLS 和最小权限 ACL 用户
3. 是否设置连接、读取超时和最大连接数
4. 连接池大小是否低于 Redis 与应用的容量上限
5. 所有缓存键是否有明确的 TTL 或清理策略
6. Pipeline 批次是否有上限
7. 是否避免在大键空间执行 KEYS
8. SCAN 结果是否允许重复并采用幂等处理
9. SET NX EX 是否只用于能够接受其边界的场景
10. 缓存故障时每类读写操作的降级策略是否明确
11. 是否监控连接数、超时、命中率、内存与大键
12. 应用退出时是否正确关闭客户端和连接池
```

## 官方参考

- [redis-py 官方指南](https://redis.io/docs/latest/develop/clients/redis-py/)
- [redis-py 连接方式](https://redis.io/docs/latest/develop/clients/redis-py/connect/)
- [Redis SCAN 命令](https://redis.io/docs/latest/commands/scan/)
- [Redis SET 命令](https://redis.io/docs/latest/commands/set/)
- [redis-py Connection API](https://redis.readthedocs.io/en/stable/connections.html)

> 本文根据早期个人笔记重新整理，并结合当前官方文档进行了校对。
