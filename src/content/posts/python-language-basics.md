---
title: Python 常用语法与代码组织
published: 2024-03-10
updated: 2026-07-30
description: 掌握变量、容器、函数、异常、类型提示和模块组织等日常 Python 基础。
tags: [Python, 语法, 类型提示]
category: Python
contentType: docs
docGroup: python
docSection: 语言基础
docOrder: 20
draft: false
---

这篇文档只覆盖日常开发中最常用的 Python 写法，重点是写出清晰、可维护的代码。

## 基本数据结构

```python
name = "alice"
age = 20
scores = [88, 91, 95]
profile = {"name": name, "age": age}
unique_tags = {"python", "backend"}
```

列表适合有顺序的数据，字典适合键值映射，集合适合去重和成员判断，元组适合表达不应随意修改的固定组合。

## 条件与循环

```python
for score in scores:
    if score >= 90:
        print("优秀", score)
    elif score >= 60:
        print("合格", score)
    else:
        print("需要改进", score)
```

需要索引时使用 `enumerate()`：

```python
for index, score in enumerate(scores, start=1):
    print(index, score)
```

同时遍历两组数据时使用 `zip()`，不要手工维护多个下标。

## 函数与类型提示

```python
def average(values: list[float]) -> float:
    if not values:
        raise ValueError("values 不能为空")
    return sum(values) / len(values)
```

类型提示不会自动限制运行时数据，但能帮助编辑器、静态检查工具和读代码的人理解接口。

参数较多时优先使用关键字参数：

```python
def connect(host: str, port: int = 5432, *, timeout: float = 5.0) -> None:
    print(host, port, timeout)


connect("127.0.0.1", timeout=2.5)
```

`*` 后的参数必须显式写参数名，可以减少调用顺序错误。

## 推导式

```python
passed = [score for score in scores if score >= 60]
score_map = {index: score for index, score in enumerate(scores, start=1)}
```

推导式适合一层简单转换。逻辑过长、包含多个分支时，普通循环通常更清晰。

## 异常处理

```python
from pathlib import Path


def read_config(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise RuntimeError(f"配置文件不存在：{path}") from error
```

只捕获你能处理的异常。避免使用裸 `except:`，它会把程序退出、键盘中断等信号也吞掉。

## 上下文管理器

```python
from pathlib import Path

with Path("data.txt").open("w", encoding="utf-8") as file:
    file.write("hello\n")
```

`with` 能保证文件、锁和连接在异常情况下也被正确释放。

## 模块组织

```text
my_project/
├── pyproject.toml
├── src/
│   └── my_app/
│       ├── __init__.py
│       ├── config.py
│       └── main.py
└── tests/
```

避免把所有逻辑写进一个脚本。按职责拆分模块，并把程序入口放在 `main()` 中。

## 实用原则

- 变量名表达含义，不使用无意义缩写。
- 函数尽量只承担一个职责。
- 优先返回结果，不在底层函数里到处打印。
- 对外接口写类型提示和简短文档字符串。
- 先写可读代码，再考虑微小性能优化。

## 参考资料

- [Python 官方教程](https://docs.python.org/zh-cn/3/tutorial/)
- [Python 类型提示](https://docs.python.org/zh-cn/3/library/typing.html)
