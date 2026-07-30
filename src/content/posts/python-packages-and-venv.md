---
title: Python 虚拟环境与依赖管理
published: 2024-05-05
updated: 2026-07-30
description: 理解 venv、pip、requirements.txt 和 pyproject.toml 的职责，减少环境冲突。
tags: [Python, venv, pip, 依赖管理]
category: Python
contentType: docs
docGroup: python
docSection: 工程实践
docOrder: 30
draft: false
---

一个 Python 项目应该拥有独立环境。把依赖直接安装进系统 Python，容易造成版本冲突，也不利于部署和复现。

## 创建与激活环境

```bash
python -m venv .venv

# Linux / macOS
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1
```

确认环境：

```bash
python -c "import sys; print(sys.executable)"
python -m pip --version
```

退出环境：

```bash
deactivate
```

## pip 的常用操作

```bash
python -m pip install requests
python -m pip install "django>=5,<6"
python -m pip uninstall requests
python -m pip list
python -m pip show requests
python -m pip check
```

`pip check` 可以检查已安装包之间是否存在依赖冲突。

## requirements.txt

记录当前环境完整版本：

```bash
python -m pip freeze > requirements.txt
```

恢复环境：

```bash
python -m pip install -r requirements.txt
```

对应用项目来说，完整锁定版本有利于复现。对库项目来说，不宜把所有间接依赖都写死，应在项目元数据中声明合理的版本范围。

## pyproject.toml

现代 Python 项目通常使用 `pyproject.toml` 描述项目和直接依赖：

```toml
[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.build_meta"

[project]
name = "example-app"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "requests>=2.32,<3",
]
```

开发模式安装：

```bash
python -m pip install -e .
```

这样修改源码后不需要反复重新安装。

## 依赖升级策略

不要一次性无条件升级所有包。更稳妥的流程是：

1. 查看过期包；
2. 阅读目标版本变更说明；
3. 单独升级一个直接依赖；
4. 运行测试；
5. 更新依赖快照。

```bash
python -m pip list --outdated
python -m pip install --upgrade requests
python -m pip check
```

## 缓存与镜像排查

```bash
python -m pip cache dir
python -m pip cache purge
python -m pip config list
```

网络异常时先检查代理、证书和 pip 配置，不要随意关闭 TLS 校验。

## 不要提交虚拟环境

`.gitignore` 中加入：

```gitignore
.venv/
__pycache__/
*.py[cod]
.pytest_cache/
```

虚拟环境是可生成产物，项目仓库应保存依赖声明，而不是保存环境目录。

## 参考资料

- [Python 虚拟环境与包](https://docs.python.org/zh-cn/3/tutorial/venv.html)
- [Python Packaging User Guide](https://packaging.python.org/)
