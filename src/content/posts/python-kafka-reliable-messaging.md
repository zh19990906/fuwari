---
title: Python 可靠使用 Kafka：生产、消费与 Offset
published: 2026-07-30
updated: 2026-07-30
description: 使用 confluent-kafka-python 处理发送确认、手动提交 Offset、优雅退出和至少一次语义，并通过业务幂等应对重复消息。
tags: [Python, Kafka, confluent-kafka, 消息队列, 数据服务]
category: Python
contentType: docs
docGroup: python
docSection: 数据服务
docOrder: 80
draft: false
---

Kafka 客户端能够成功连接 Broker，并不代表消息链路已经可靠。生产者要确认消息是否真正写入；消费者要决定处理完成前后何时提交 Offset；业务还必须接受“可能重复”这一事实，并把幂等性设计在数据写入边界。

本文使用 `confluent-kafka-python`。它基于 `librdkafka`，提供 Producer、Consumer 和管理客户端，适合需要较高吞吐和完整 Kafka 配置能力的 Python 服务。

## 安装

```bash
pip install -U confluent-kafka
```

连接信息通过环境变量提供：

```bash
export KAFKA_BOOTSTRAP_SERVERS="broker-a.example.com:9092,broker-b.example.com:9092"
export KAFKA_TOPIC="events.demo"
```

需要 SASL/TLS 时再由部署环境提供用户名和凭据，不要把连接密钥写入源码、Dockerfile 或提交到仓库的配置文件。

## 先理解四个对象

| 概念 | 说明 |
|---|---|
| Producer | 把记录发送到 Topic |
| Topic / Partition | Topic 被分成多个有序分区 |
| Consumer Group | 同一组内的消费者分摊分区 |
| Offset | 消费者在某个分区中的读取位置 |

Kafka 只保证同一 Partition 内的记录顺序。需要同一业务实体有序时，应使用稳定 Key，让同一实体路由到同一 Partition；不要假设整个 Topic 全局有序。

## 一个可检查发送结果的 Producer

```python
import json
import os
import socket

from confluent_kafka import KafkaException, Producer


producer_config: dict[str, object] = {
    "bootstrap.servers": os.environ["KAFKA_BOOTSTRAP_SERVERS"],
    "client.id": socket.gethostname(),
    "acks": "all",
    "enable.idempotence": True,
    "message.timeout.ms": 10_000,
}

if os.getenv("KAFKA_SASL_USERNAME"):
    producer_config.update(
        {
            "security.protocol": "SASL_SSL",
            "sasl.mechanism": "PLAIN",
            "sasl.username": os.environ["KAFKA_SASL_USERNAME"],
            "sasl.password": os.environ["KAFKA_SASL_PASSWORD"],
        }
    )

producer = Producer(producer_config)


def delivery_report(error, message) -> None:
    if error is not None:
        raise KafkaException(error)
    print(
        "delivered",
        message.topic(),
        message.partition(),
        message.offset(),
    )


def send_event(event: dict[str, object]) -> None:
    payload = json.dumps(
        event,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")

    producer.produce(
        topic=os.environ["KAFKA_TOPIC"],
        key=str(event["event_id"]).encode("utf-8"),
        value=payload,
        on_delivery=delivery_report,
    )
    producer.poll(0)


send_event(
    {
        "event_id": "demo-001",
        "event_type": "example.created",
        "payload": {"value": 42},
    }
)

remaining = producer.flush(10)
if remaining:
    raise TimeoutError(f"{remaining} Kafka messages were not delivered")
```

### `produce()` 不是同步写入

`producer.produce()` 通常只是把记录放入本地队列，让客户端批量、压缩并异步发送。成功返回不等于 Broker 已经确认。

发送结果通过 Delivery Callback 返回，而 Callback 需要在调用 `poll()` 或 `flush()` 时被派发。

### 不要每条消息都 `flush()`

每条消息发送后立刻 `flush()` 会把吞吐限制在网络往返速度。常见模式是：

- 循环中持续调用 `produce()`；
- 周期性调用 `poll(0)` 派发回调；
- 服务关闭或批次结束时调用一次有超时的 `producer.flush()`；
- 检查返回的未完成消息数量。

### 本地队列可能已满

当生产速度持续高于发送速度时，`produce()` 可能抛出 `BufferError`。处理方式不是无限重试，而是：

- 调用 `poll()` 让已完成回调释放队列；
- 对生产速率施加背压；
- 监控本地队列长度和发送延迟；
- 设置有截止时间的重试；
- 超过截止时间后明确失败或转入持久补偿队列。

## `acks` 与幂等 Producer

`acks="all"` 要求当前同步副本集合按 Broker 配置确认写入。`enable.idempotence=True` 可以减少 Producer 重试造成的分区内重复写入，并让相关安全配置保持一致。

这仍不能替代业务幂等：

- 发送方可能在收到确认前崩溃，然后重新提交业务事件；
- 上游事务可能重复触发同一发送逻辑；
- 跨系统写数据库和发 Kafka 不是天然原子操作；
- 消费者至少一次处理会再次执行同一事件。

需要数据库与事件一致性时，可考虑 Outbox 模式，而不是先提交数据库、再“尽力”发送 Kafka。

## 手动提交 Offset 的 Consumer

下面的消费者只在 `process_event()` 成功后提交当前消息位置。

```python
import json
import os
import signal

from confluent_kafka import Consumer, KafkaError, KafkaException


running = True


def request_shutdown(signum, frame) -> None:
    del signum, frame
    global running
    running = False


signal.signal(signal.SIGINT, request_shutdown)
signal.signal(signal.SIGTERM, request_shutdown)

consumer_config: dict[str, object] = {
    "bootstrap.servers": os.environ["KAFKA_BOOTSTRAP_SERVERS"],
    "group.id": os.environ.get("KAFKA_CONSUMER_GROUP", "demo-worker"),
    "auto.offset.reset": "earliest",
    "enable.auto.commit": False,
}

if os.getenv("KAFKA_SASL_USERNAME"):
    consumer_config.update(
        {
            "security.protocol": "SASL_SSL",
            "sasl.mechanism": "PLAIN",
            "sasl.username": os.environ["KAFKA_SASL_USERNAME"],
            "sasl.password": os.environ["KAFKA_SASL_PASSWORD"],
        }
    )

consumer = Consumer(consumer_config)


def process_event(event: dict[str, object]) -> None:
    event_id = str(event["event_id"])
    print("processed", event_id)


consumer.subscribe([os.environ["KAFKA_TOPIC"]])

try:
    while running:
        message = consumer.poll(timeout=1.0)
        if message is None:
            continue

        if message.error():
            if message.error().code() == KafkaError._PARTITION_EOF:
                continue
            raise KafkaException(message.error())

        try:
            event = json.loads(message.value().decode("utf-8"))
            process_event(event)
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError) as error:
            # 生产环境应记录 Topic、Partition、Offset 和错误类型，
            # 再按策略写入隔离 Topic 或人工处理队列。
            raise ValueError(
                f"invalid event at {message.topic()} "
                f"partition={message.partition()} "
                f"offset={message.offset()}"
            ) from error

        consumer.commit(message=message, asynchronous=False)
finally:
    consumer.close()
```

`consumer.close()` 会释放 Socket，并让 Consumer Group 更快完成 Rebalance。不要依赖进程被强制结束后由 Broker 超时回收。

## 为什么处理后再提交

假设顺序是：

```text
读取消息
→ 完成业务处理
→ 提交 Offset
```

如果业务处理完成后、提交 Offset 前进程崩溃，重启后会再次读取这条消息，因此得到“至少一次”语义。

如果先提交 Offset 再处理：

```text
读取消息
→ 提交 Offset
→ 业务处理
```

进程在最后一步失败时，消息位置已经前移，可能永久漏处理。

至少一次不是“完全可靠”的同义词，它把丢失风险转换成重复风险。业务写入必须能够识别重复事件。

## 业务幂等

每条业务事件应有稳定的 `event_id`。消费者处理时可以在同一数据库事务中：

```text
检查 event_id 是否已经处理
→ 未处理：执行业务写入
→ 记录 event_id
→ 提交事务
→ 提交 Kafka Offset
```

幂等设计示例：

- 数据库唯一约束；
- 幂等请求表；
- 按业务版本执行条件更新；
- 目标记录的最后处理事件 ID；
- 外部 API 的幂等键。

不要只在内存 Set 中记录已处理 ID。进程重启、扩容或流量切换后，该记录无法共享。

## 批量处理与提交

逐条同步提交最容易理解，但提交请求较多。批量处理可以提高吞吐：

```text
Poll 一批消息
→ 逐条或批量执行幂等业务处理
→ 确认整批成功
→ 提交每个 Partition 已连续成功处理的最大 Offset
```

不能因为某个 Partition 的后续消息成功，就跳过同一 Partition 前面失败的消息直接提交更大 Offset。并发处理时需要按 Partition 维护连续完成位置。

## Poison Message

格式错误、缺字段或业务永远无法处理的消息会反复阻塞消费。应定义明确策略：

- 记录 Topic、Partition、Offset、Key 和错误类型；
- 限制重试次数；
- 原始 Payload 按权限脱敏保存；
- 转入隔离 Topic；
- 提供重放和人工修复工具；
- 告警而不是静默丢弃。

隔离消息后是否提交原 Offset，需要由业务的数据完整性要求决定。

## Rebalance 与长任务

Consumer Group 成员变化会触发分区重新分配。单条处理时间过长时，要关注：

- `max.poll.interval.ms`；
- Poll 循环是否持续运行；
- 分区撤销前是否完成或停止任务；
- 是否错误地让两个 Worker 同时处理同一业务对象；
- 关闭时是否停止接收新消息并等待在途任务。

长耗时任务可以把 Kafka 消息转换为有状态任务记录，再由专门 Worker 执行；不要无限延长 Poll 间隔掩盖不适合的处理模型。

## 生产环境检查清单

```text
1. Broker、Topic 和凭据是否由环境或密钥管理服务提供
2. 是否使用 TLS/SASL 和最小权限账号
3. Producer 是否设置 acks=all 与 enable.idempotence
4. 是否处理 Delivery Callback 和本地队列已满
5. 服务关闭前是否调用有超时的 producer.flush
6. Consumer 是否明确选择自动或手动提交策略
7. Offset 是否只在业务处理成功后提交
8. 消费业务是否使用持久化幂等键
9. 是否明确 Partition Key 与顺序要求
10. Poison Message 是否有重试上限和隔离流程
11. Rebalance、退出和在途任务是否有处理策略
12. 是否监控 Consumer Lag、发送失败、提交失败和处理延迟
```

## 官方参考

- [Confluent Kafka Python Client Overview](https://docs.confluent.io/kafka-clients/python/current/overview.html)
- [confluent-kafka-python API](https://docs.confluent.io/platform/current/clients/confluent-kafka-python/html/index.html)
- [confluent-kafka-python Repository](https://github.com/confluentinc/confluent-kafka-python)
- [Apache Kafka Design](https://kafka.apache.org/documentation/#design)

> 本文根据早期个人笔记重新整理，并结合当前官方文档进行了校对。
