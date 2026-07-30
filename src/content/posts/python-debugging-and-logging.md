---
title: Python 调试、日志与常见异常排查
published: 2025-01-12
updated: 2026-07-30
description: 使用 traceback、断点、logging 和最小复现定位 Python 程序问题。
tags: [Python, 调试, logging, 异常]
category: Python
contentType: docs
docGroup: python
docSection: 排障
docOrder: 40
draft: false
---

调试的核心不是不断添加 `print()`，而是缩小问题范围、保留上下文，并让错误能够稳定复现。

## 先读完整 traceback

```text
Traceback (most recent call last):
  File "main.py", line 12, in <module>
    load_config()
  File "main.py", line 8, in load_config
    return data["database"]
KeyError: 'database'
```

从最后一行确认异常类型，再向上追踪调用链。不要只复制最后一句错误，因为真正的触发位置通常在前面的业务代码中。

## 使用断点

Python 内置调试器：

```python
def calculate_total(prices: list[float]) -> float:
    breakpoint()
    return sum(prices)
```

运行后常用命令：

```text
n        下一行
s        进入函数
c        继续运行
p value  打印表达式
q        退出
```

也可以使用编辑器的图形化断点，但仍要理解变量、调用栈和执行路径。

## 使用 logging

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


def load_user(user_id: int) -> None:
    logger.info("loading user", extra={"user_id": user_id})
```

记录异常时保留堆栈：

```python
try:
    result = 10 / 0
except ZeroDivisionError:
    logger.exception("calculation failed")
```

不要在日志中输出密码、访问令牌、完整身份证号或数据库连接串。

## 区分日志级别

- `DEBUG`：开发期细节，例如参数和分支。
- `INFO`：正常业务节点，例如任务开始和完成。
- `WARNING`：可恢复异常或即将失效的配置。
- `ERROR`：当前操作失败，但进程仍可继续。
- `CRITICAL`：系统无法继续提供核心服务。

## 制作最小复现

遇到复杂问题时：

1. 固定输入数据；
2. 去掉网络、数据库等无关依赖；
3. 删除不影响错误的代码；
4. 保留能够稳定触发错误的最短脚本；
5. 记录 Python 与依赖版本。

```bash
python --version
python -m pip freeze
```

## 常见异常方向

### `ModuleNotFoundError`

确认解释器和包安装位置：

```bash
python -c "import sys; print(sys.executable)"
python -m pip show package-name
```

### `PermissionError`

检查文件路径、父目录权限和当前用户，不要第一时间使用管理员权限运行整个程序。

### 编码错误

明确指定 UTF-8：

```python
from pathlib import Path

text = Path("data.txt").read_text(encoding="utf-8")
```

### 程序卡住

检查是否等待网络、锁、子进程或标准输入。为外部请求设置合理超时，并在关键阶段记录日志。

## 参考资料

- [Python pdb 调试器](https://docs.python.org/zh-cn/3/library/pdb.html)
- [Python logging](https://docs.python.org/zh-cn/3/library/logging.html)
