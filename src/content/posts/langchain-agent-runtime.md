---
title: LangChain 1.x Agent Runtime 与 LangGraph 分工
published: 2026-07-30
updated: 2026-07-30
description: 从 create_agent 的执行循环、状态与检查点理解 LangChain 和 LangGraph 的职责边界，并判断什么时候不该使用 Agent。
tags: [LangChain, LangGraph, Agent, Middleware, LLM]
category: AI
contentType: docs
docGroup: ai-llm
docSection: Agent 工程
docOrder: 30
draft: false
---

LangChain 1.x 把 Agent 开发入口集中到了 `create_agent`。它负责把模型、工具、系统提示词和中间件组合成一个可调用的 Agent；真正承载状态流转、持久化、暂停恢复和长流程执行的底层运行时则是 LangGraph。

理解这两个层次，可以避免两种常见问题：一是把所有业务流程都写成不可预测的 Agent；二是在只需要增加一条审批规则时，过早手写完整状态图。

## 一次 Agent 调用发生了什么

一个标准工具调用 Agent 通常重复以下循环：

```text
用户消息
  ↓
模型判断下一步
  ├─ 不调用工具 → 返回最终答案
  └─ 生成工具调用
          ↓
      校验并执行工具
          ↓
      把工具结果加入消息
          └────────────→ 再次调用模型
```

`create_agent` 提供这个循环的标准实现。模型可以连续调用多个工具，也可以根据工具结果修正计划，直到不再产生工具调用。

这不意味着业务系统应该把控制权完全交给模型。模型只适合承担需要语言理解、模糊判断或动态选择工具的步骤；权限检查、金额计算、状态迁移和数据约束仍应由确定性代码控制。

## `create_agent` 负责什么

LangChain 层主要负责统一和组装：

- 模型调用接口；
- 消息和内容块；
- 工具定义与参数 Schema；
- 系统提示词；
- 结构化输出；
- Middleware；
- 标准 Agent 循环。

LangChain 1.x 推荐从下面的导入路径创建 Agent：

```python
from langchain.agents import create_agent
```

旧项目可能仍在使用 `langgraph.prebuilt.create_react_agent` 或早期 `AgentExecutor`。迁移时不应只替换函数名，还要检查动态提示词、自定义状态、模型路由和前后置 Hook 是否已经改为 Middleware 形式。

## LangGraph 负责什么

LangGraph 把一次运行表示为带状态的图。核心概念包括：

| 概念 | 作用 |
|---|---|
| State | 在节点之间传递的结构化状态 |
| Node | 执行模型、工具或普通 Python 逻辑的步骤 |
| Edge | 定义节点之间的流向 |
| Conditional edge | 根据状态选择下一步 |
| Checkpoint | 保存某一步执行后的状态快照 |
| Thread | 用 `thread_id` 标识的一条持续会话或任务线 |

`create_agent` 返回的对象本身运行在 LangGraph 上，因此可以自然获得流式输出、检查点、人在环审批和故障恢复能力。只有当外围拓扑超出标准 Agent 循环时，才需要直接编排 `StateGraph`。

例如这些场景更适合直接使用 LangGraph：

- 先做固定的输入分类，再路由到不同 Agent；
- Agent 前后必须执行不可跳过的确定性步骤；
- 多条分支需要并行执行后汇总；
- 需要明确的重试节点、补偿节点和人工处理节点；
- 要求从历史 Checkpoint 回放或分叉执行。

## 最小工具调用 Agent

下面的示例只提供一个无外部副作用的加法工具。模型名称通过环境变量提供，模型供应商凭据由对应集成按照其官方环境变量读取。

安装依赖：

```bash
pip install -U langchain langgraph langchain-openai
```

示例代码：

```python
import os

from langchain.agents import create_agent
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver


@tool
def add(left: int, right: int) -> int:
    """返回两个整数的和。"""
    return left + right


model_name = os.environ["LANGCHAIN_MODEL"]

agent = create_agent(
    model=model_name,
    tools=[add],
    system_prompt=(
        "你是一个谨慎的计算助手。需要计算时调用工具，"
        "不要自行猜测工具结果。"
    ),
    checkpointer=InMemorySaver(),
)

config = {
    "configurable": {
        "thread_id": "calculator-demo",
    }
}

result = agent.invoke(
    {
        "messages": [
            {
                "role": "user",
                "content": "请计算 37 加 58，并说明结果。",
            }
        ]
    },
    config=config,
)

print(result["messages"][-1].content)
```

运行前设置模型名称和对应供应商要求的凭据。例如：

```bash
export LANGCHAIN_MODEL="<provider>:<model>"
```

示例没有把凭据作为函数参数或源代码常量保存。生产服务还应通过密钥管理系统注入环境变量，而不是把 `.env` 文件提交到仓库。

## Checkpointer 与 `thread_id`

只传入 `checkpointer` 还不够。调用时还需要提供稳定的 `thread_id`，运行时才能找到同一条任务线的历史状态。

```python
config = {
    "configurable": {
        "thread_id": conversation_id,
    }
}
```

需要注意：

- 同一个 `thread_id` 会继续同一条状态线；
- 新的 `thread_id` 会创建新的状态线；
- `InMemorySaver` 只适合本地演示和单进程测试；
- 多进程、容器重启或跨实例恢复需要持久化 Checkpointer；
- `thread_id` 不是权限凭据，读取状态前仍要校验当前用户是否有权访问该线程。

Checkpoint 让系统能从已保存状态恢复，但不会自动让外部副作用具备事务性。如果某个工具在保存 Checkpoint 前已经调用了第三方接口，重试时仍可能重复执行，因此工具本身需要幂等键或去重机制。

## 什么时候使用哪一层

| 需求 | 推荐方案 |
|---|---|
| 固定顺序的字段校验和数据库写入 | 普通 Python / 工作流代码 |
| 模型在少量只读工具中动态选择 | `create_agent` |
| 标准 Agent 加摘要、审批或模型路由 | `create_agent` + Middleware |
| 明确的多阶段分支、循环和恢复节点 | 直接使用 LangGraph |
| 长时间后台任务但不需要语言推理 | 任务队列或工作流引擎 |
| 强事务、强一致的资金或库存状态迁移 | 确定性领域服务，不让 Agent 直接控制 |

一个实用判断方式是：如果流程能够用稳定的条件分支完整描述，并且模型不需要理解自然语言上下文，就优先写普通代码。

## 工具设计边界

### 参数必须有明确 Schema

工具参数应尽量小而明确，不要让模型直接拼接 SQL、Shell 或任意文件路径。高风险输入应转换为受控枚举或业务对象 ID。

```python
@tool
def lookup_order(order_id: str) -> dict[str, str]:
    """读取一个订单的公开状态，不执行修改。"""
    ...
```

### 设置真正的底层超时

Agent 的整体超时不能替代 HTTP、数据库和对象存储客户端自身的连接、读取与写入超时。否则停止等待 Agent 时，底层阻塞请求可能仍然占用线程或连接。

### 限制循环与成本

模型可能因为工具结果不完整而反复调用同一个工具。生产系统需要：

- 最大步骤数；
- 单次运行时间上限；
- Token 或费用预算；
- 相同工具参数的重复调用检测；
- 失败分类与可观察日志。

### 区分读工具和写工具

只读查询可以在完成授权后直接执行。具有外部副作用的工具应增加：

- 权限检查；
- 参数确认；
- 人在环审批；
- 幂等键；
- 审计记录；
- 失败补偿策略。

人在环只决定“是否允许继续”，不能替代这些工程控制。

## 版本与依赖管理

Agent 框架接口变化较快。项目中应固定直接依赖的兼容范围，并在升级时运行针对工具调用、结构化输出、Checkpointer 和 Middleware 的测试。

推荐记录：

```text
Python 版本
langchain 版本
langgraph 版本
模型集成包版本
模型名称
工具 Schema 版本
Checkpoint 存储实现
```

不要根据一段历史 Notebook 输出判断当前接口是否仍然有效，应以当前官方迁移指南和 API 文档为准。

## 生产环境检查清单

```text
1. 这个流程是否真的需要模型动态决策
2. 工具参数是否经过结构化校验和权限检查
3. 读工具与写工具是否采用不同的审批策略
4. 每个外部请求是否有连接和读取超时
5. 工具是否支持幂等或业务去重
6. 是否限制最大步骤、运行时间和费用
7. 生产环境是否使用持久化 checkpointer
8. thread_id 是否和租户、用户权限正确绑定
9. 是否记录模型调用、工具调用、审批和错误
10. 框架升级后是否运行端到端回归测试
```

## 官方参考

- [LangChain v1 更新说明](https://docs.langchain.com/oss/python/releases/langchain-v1)
- [LangChain v1 迁移指南](https://docs.langchain.com/oss/python/migrate/langchain-v1)
- [LangChain Agents](https://docs.langchain.com/oss/python/langchain/agents)
- [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)

> 本文根据早期个人笔记重新整理，并结合当前官方文档进行了校对。
