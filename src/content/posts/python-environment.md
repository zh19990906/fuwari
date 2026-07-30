---
title: Python 环境搭建与版本检查
published: 2024-02-18
updated: 2026-07-30
description: 从解释器、pip 到第一个虚拟环境，建立可复现的 Python 开发环境。
tags: [Python, 开发环境, pip]
category: Python
contentType: docs
docGroup: python
docSection: 快速开始
docOrder: 10
draft: false
---

Python 项目最常见的问题通常不是语法，而是“命令调用了哪个解释器”“包装到了哪个环境”。因此，开始写代码前先把解释器、包管理器和虚拟环境理清楚。

## 检查解释器

```bash
python --version
python -c "import sys; print(sys.executable)"
```

在部分 Linux 发行版中命令名是 `python3`：

```bash
python3 --version
python3 -c "import sys; print(sys.executable)"
```

不要只看版本号，还要看可执行文件路径。系统 Python、Homebrew Python、pyenv 与虚拟环境可能同时存在。

## 创建项目目录

```bash
mkdir hello-python
cd hello-python
python -m venv .venv
```

激活环境：

```bash
# Linux / macOS
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1
```

激活后再次检查：

```bash
python -c "import sys; print(sys.prefix)"
python -m pip --version
```

推荐使用 `python -m pip`，这样可以明确由当前解释器运行 pip，减少“pip 和 python 指向不同环境”的问题。

## 安装与记录依赖

```bash
python -m pip install --upgrade pip
python -m pip install requests
python -m pip freeze > requirements.txt
```

在另一台机器恢复：

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

`pip freeze` 适合记录当前环境快照。正式项目也可以使用 `pyproject.toml` 管理直接依赖，把锁定版本交给专门的依赖工具处理。

## 第一个脚本

创建 `main.py`：

```python
from pathlib import Path


def main() -> None:
    project_dir = Path.cwd()
    print(f"Python 环境正常，当前目录：{project_dir}")


if __name__ == "__main__":
    main()
```

运行：

```bash
python main.py
```

## 常见排查

```bash
which python       # Linux / macOS
where python       # Windows
python -m site
python -m pip list
```

遇到导入失败时，先确认当前解释器路径，再确认包是否安装在这个解释器对应的环境中。

## 参考资料

- [Python 虚拟环境与包](https://docs.python.org/zh-cn/3/tutorial/venv.html)
- [Python 模块安装指南](https://docs.python.org/zh-cn/3/installing/index.html)
