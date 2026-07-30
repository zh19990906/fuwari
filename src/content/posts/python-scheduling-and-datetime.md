---
title: Python 轻量定时任务与日期时间处理
published: 2022-08-19
updated: 2026-07-30
description: 组合 schedule 与 dateutil 处理简单定时任务、字符串时间、时区和失败重试。
tags: [Python, schedule, datetime, dateutil, 定时任务]
category: Python
contentType: docs
docGroup: python
docSection: 实用技巧
docOrder: 60
draft: false
---

小型脚本经常需要每天执行一次、定期检查状态或解析外部时间字符串。`schedule` 适合单进程、允许短暂停机的轻量任务；日期处理则应优先使用带时区的 `datetime`，并明确输入格式。

## 一个可维护的轻量任务

```python
import logging
import time

import schedule

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)


def job() -> None:
    logging.info("job started")
    try:
        # 直接调用应用函数，不要再通过 os.system 启动另一个 Python 进程。
        logging.info("job finished")
    except Exception:
        logging.exception("job failed")


schedule.every().day.at("08:20").do(job)

while True:
    schedule.run_pending()
    time.sleep(1)
```

这个进程必须持续运行。应用退出、服务器重启或进程被杀死后，错过的任务不会自动补执行。

## 不要用 shell 拼接业务命令

旧脚本常见做法是：

```python
# 不推荐
# os.system("python task.py")
```

问题包括：

- 无法可靠获取结构化返回值；
- shell 参数可能产生注入风险；
- Python 解释器和虚拟环境不一定与当前进程一致；
- 超时、日志和异常处理困难。

优先把任务逻辑提取为普通函数，再由命令行入口和定时任务共同调用。

## 给任务增加防重入

任务执行时间超过调度间隔时，可能发生重叠。单进程可以用锁避免重复执行：

```python
from threading import Lock

job_lock = Lock()


def guarded_job() -> None:
    if not job_lock.acquire(blocking=False):
        logging.warning("previous job is still running")
        return

    try:
        job()
    finally:
        job_lock.release()
```

多进程或多主机场景不能依赖内存锁，应使用数据库锁、Redis 锁、任务队列或由平台保证单实例运行。

## 失败重试

重试只适合短暂网络错误，不能掩盖参数错误和数据错误：

```python
import time
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


def retry(
    operation: Callable[[], T],
    *,
    attempts: int = 3,
    base_delay: float = 1.0,
) -> T:
    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except OSError:
            if attempt == attempts:
                raise
            time.sleep(base_delay * attempt)
    raise RuntimeError("unreachable")
```

任务需要幂等设计：重复执行不能产生重复订单、重复消息或不可逆副作用。

## 解析标准时间字符串

优先处理 ISO 8601 格式：

```python
from dateutil import parser

value = parser.isoparse("2026-07-30T10:00:00+08:00")
print(value)
print(value.astimezone())
```

`isoparse` 比通用 `parse` 更严格，适合 API 和配置文件。面对历史数据中不统一的格式时，可以使用：

```python
from dateutil.parser import ParserError, parse

try:
    value = parse("July 30, 2026 10:00 +08:00")
except (ParserError, OverflowError) as exc:
    raise ValueError("unsupported datetime value") from exc
```

不要对来源不受控的大批量字符串无限制尝试模糊解析；应记录失败样本并收敛输入格式。

## 使用带时区的时间

```python
from datetime import datetime, timezone

now_utc = datetime.now(timezone.utc)
print(now_utc.isoformat())
```

不带时区信息的 `datetime` 称为 naive datetime。它无法说明“10:00”属于哪个时区，跨服务器、数据库或夏令时地区时容易产生歧义。

把本地时间转换为 UTC 保存：

```python
from datetime import datetime
from zoneinfo import ZoneInfo

local = datetime(
    2026,
    7,
    30,
    10,
    0,
    tzinfo=ZoneInfo("Asia/Shanghai"),
)
print(local.astimezone(ZoneInfo("UTC")))
```

数据库通常保存 UTC，展示层再转换为用户时区。

## `schedule` 的适用边界

适合：

- 单机个人脚本；
- 短时任务；
- 允许人工恢复；
- 不要求错过后补执行；
- 没有复杂依赖关系。

不适合：

- 多实例服务；
- 任务必须执行且可追踪；
- 需要持久化重试；
- 需要并发控制、优先级或工作节点；
- 任务执行数小时。

更稳妥的替代方案：

| 场景 | 方案 |
|---|---|
| Linux 单机命令 | systemd timer 或 cron |
| 容器平台 | Kubernetes CronJob |
| Python 分布式任务 | Celery、RQ 等任务队列 |
| 云平台 | 托管调度器和消息队列 |

## systemd timer 的优势

systemd 可以记录日志、限制权限并在重启后恢复调度。服务单元调用应用命令，定时器负责周期：

```ini
# /etc/systemd/system/report.timer
[Unit]
Description=Run report task every day

[Timer]
OnCalendar=*-*-* 08:20:00
Persistent=true

[Install]
WantedBy=timers.target
```

`Persistent=true` 可以在机器恢复后触发错过的日历任务，但仍需保证任务幂等。

## 检查清单

```text
1. 时间输入格式是否明确
2. datetime 是否包含时区
3. 调度进程停止后是否允许漏执行
4. 任务是否幂等
5. 是否限制重试次数和总耗时
6. 是否有结构化日志和失败告警
7. 多实例是否使用了分布式协调
```

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
