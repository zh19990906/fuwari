---
title: LangChain Middleware 与人在环 Agent
published: 2026-07-30
updated: 2026-07-30
description: 使用 Middleware 管理上下文、模型路由和工具调用，并通过可恢复中断为敏感操作增加 approve、edit、reject 审批。
tags: [LangChain, LangGraph, Middleware, HITL, Agent]
category: AI
contentType: docs
docGroup: ai-llm
docSection: Agent 工程
docOrder: 40
draft: false
---

Middleware 是 LangChain 1.x 中控制 Agent 运行过程的主要扩展机制。它可以在不重写标准 Agent 循环的情况下，调整提示词、裁剪上下文、选择模型、限制工具、记录调用，或者在具有副作用的工具真正执行前暂停并等待人工决定。

Middleware 不是另一个独立运行时。它的 Hook 运行在 `create_agent` 返回的 LangGraph 内部，因此状态持久化、人在环中断和恢复执行仍依赖 LangGraph。

## Middleware 位于哪里

一个工具调用 Agent 的简化生命周期如下：

```text
进入 Agent
  ↓
before_agent
  ↓
before_model
  ↓
wrap_model_call → 调用模型 → after_model
  ↓
模型是否请求工具？
  ├─ 否 → after_agent → 返回
  └─ 是
       ↓
     wrap_tool_call → 执行工具
       ↓
     回到 before_model
```

常见 Hook 的职责：

| Hook | 适合做什么 | 不适合做什么 |
|---|---|---|
| `before_agent` | 加载会话级上下文、输入检查 | 每轮模型调用都重复做昂贵查询 |
| `before_model` | 动态提示词、消息裁剪、工具可见性 | 执行不可恢复的外部写入 |
| `wrap_model_call` | 模型路由、重试、限流、埋点 | 把权限判断只交给模型 |
| `after_model` | 输出校验、检查工具调用、触发审批 | 假设模型输出必然符合业务规则 |
| `wrap_tool_call` | 参数校验、审计、超时、异常转换 | 吞掉错误后伪装成成功 |
| `after_agent` | 汇总指标、清理运行级资源 | 替代持久任务队列 |

应把 Middleware 设计成可组合的小策略。一个 Middleware 同时处理权限、摘要、计费、重试和日志，后续很难判断执行顺序和失败责任。

## 上下文治理

随着对话增长，把全部历史消息持续发送给模型会提高费用和延迟，也可能把已经失效的信息继续带入决策。

常见治理方式包括：

### 裁剪

保留系统提示词、最近若干轮消息和仍然有效的工具结果。裁剪速度快，但删除的信息无法再被模型读取。

### 摘要

达到 Token 阈值后，让模型把较早上下文压缩为摘要，再保留最近消息。摘要本身也可能遗漏细节，因此关键业务状态应放在结构化 State 或数据库中，而不是只存在自然语言摘要里。

### 删除无效工具结果

重复查询、过期搜索结果和体积很大的原始响应，可以转换为结构化摘要或引用 ID。不要把完整数据库记录、日志文件或对象内容无限追加到消息历史。

### 敏感信息处理

在消息进入模型前识别并屏蔽不必要的个人信息、密钥和内部地址。仅做字符串替换不足以构成完整的数据防泄露方案，还要控制日志、Trace、Checkpoint 和错误报告中的内容。

## 动态模型路由

`wrap_model_call` 可以根据运行上下文选择模型，例如：

- 简短分类任务使用低成本模型；
- 长上下文或复杂推理使用能力更强的模型；
- 某个供应商不可用时切换到经过验证的备用模型；
- 达到会话预算后禁止继续调用昂贵模型。

路由规则应该由可测试的指标驱动，而不是只依赖“问题看起来很难”这样的模糊提示词。建议记录每条规则的：

```text
触发条件
选中的模型
输入与输出 Token
延迟
工具调用次数
成功率
人工接管率
费用
```

不同模型对工具调用、结构化输出和内容块的支持可能不同。切换模型前必须确认工具 Schema 和输出处理逻辑仍然兼容。

## 人在环适合处理什么

以下操作通常需要在工具执行前增加审批：

- 修改或删除数据；
- 向外部系统发送消息；
- 改变访问权限；
- 执行费用明显的批量任务；
- 发布内容或触发部署；
- 调用不可逆的第三方接口。

只读查询也不是天然安全。读取跨租户数据、导出敏感字段或访问高成本资源，同样可能需要授权和审计。

## 一个无外部副作用的 HITL 示例

下面的 `stage_change` 只会把审批后的变更写入当前 Python 进程的内存列表，用于演示暂停、审阅和恢复。它不会写文件、发邮件或修改数据库。

安装依赖：

```bash
pip install -U langchain langgraph langchain-openai
```

创建 Agent：

```python
import os

from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver


staged_changes: list[dict[str, str]] = []


@tool
def stage_change(resource: str, new_value: str) -> str:
    """把演示变更写入本地内存列表，不产生外部副作用。"""
    staged_changes.append(
        {
            "resource": resource,
            "new_value": new_value,
        }
    )
    return "change staged"


agent = create_agent(
    model=os.environ["LANGCHAIN_MODEL"],
    tools=[stage_change],
    system_prompt=(
        "你是配置助手。用户要求修改配置时调用 stage_change，"
        "工具执行前必须等待人工审批。"
    ),
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={
                "stage_change": {
                    "allowed_decisions": ["approve", "edit", "reject"],
                    "description": "请检查待暂存的演示配置变更",
                }
            }
        )
    ],
    checkpointer=InMemorySaver(),
)
```

发起调用时必须提供稳定的 `thread_id`：

```python
config = {
    "configurable": {
        "thread_id": "hitl-demo-001",
    }
}

result = agent.invoke(
    {
        "messages": [
            {
                "role": "user",
                "content": "把演示环境的日志级别改为 warning。",
            }
        ]
    },
    config=config,
    version="v2",
)

for pending in result.interrupts:
    print(pending.value)
```

此时工具还没有执行，`staged_changes` 仍为空。审核界面应展示工具名称、参数、允许的决定类型和本次运行身份，再把人工决定传回后端。

## `approve`、`edit` 与 `reject`

恢复时必须使用同一个 `thread_id`。

### 原样批准

```python
from langgraph.types import Command

agent.invoke(
    Command(
        resume={
            "decisions": [
                {
                    "type": "approve",
                }
            ]
        }
    ),
    config=config,
    version="v2",
)
```

### 编辑参数后执行

```python
agent.invoke(
    Command(
        resume={
            "decisions": [
                {
                    "type": "edit",
                    "edited_action": {
                        "name": "stage_change",
                        "args": {
                            "resource": "demo/log-level",
                            "new_value": "info",
                        },
                    },
                }
            ]
        }
    ),
    config=config,
    version="v2",
)
```

编辑应保持工具语义不变。把原本的低风险操作改成完全不同的资源或动作时，更安全的做法是拒绝并要求 Agent 重新生成计划。

### 拒绝执行

```python
agent.invoke(
    Command(
        resume={
            "decisions": [
                {
                    "type": "reject",
                    "message": (
                        "该变更未通过审核，不要再次调用同一工具。"
                    ),
                }
            ]
        }
    ),
    config=config,
    version="v2",
)
```

多个工具调用同时等待审批时，必须按照中断请求中的顺序，为每个 Action 提供一个决定。

## Interrupt 的关键规则

### 节点会从头重新执行

LangGraph 恢复中断时，会重新开始执行包含 `interrupt` 的节点，而不是从 Python 源代码的下一行继续。因此中断之前执行过的代码可能再次运行。

```text
进入节点
→ 执行中断前代码
→ interrupt
→ 保存状态并暂停
→ 收到恢复命令
→ 重新进入节点
→ 再次执行中断前代码
→ interrupt 返回人工决定
→ 执行后续代码
```

中断前不要执行不可重复的副作用。如果必须做准备工作，应让它具备幂等性，或者把真正写入放到审批之后的独立节点。

### 不要用宽泛异常捕获包住中断

Interrupt 通过运行时信号暂停执行。把它包在捕获所有异常的 `try/except` 中，可能把暂停信号误判为普通错误。

### Payload 必须可序列化

中断内容应使用字符串、数字、布尔值、列表和字典等 JSON 可序列化结构。不要把数据库连接、函数、客户端对象或复杂运行时实例放入 Payload。

### 中断顺序要稳定

同一节点中的多个 Interrupt 依赖稳定顺序恢复。不要让前一次运行与恢复运行因为随机条件而改变 Interrupt 的排列。

### 生产环境使用持久化 Checkpointer

`InMemorySaver` 只适合演示。如果进程退出，暂停状态就会消失。生产系统应使用持久化 Checkpointer，并保证：

- Checkpoint 数据加密和访问隔离；
- `thread_id` 与租户、用户和业务对象绑定；
- 保存内容不包含无必要的秘密；
- 存储故障时有明确的失败行为；
- 运行恢复后仍能查到对应审批记录。

## 审批不等于授权

HITL Middleware 解决的是“在执行前停下来等待决定”，但它不能替代：

- 身份认证；
- RBAC 或 ABAC 权限校验；
- 多租户隔离；
- 参数白名单；
- 数据库事务；
- 业务幂等；
- 审计日志；
- 双人复核或职责分离。

后端在接收人工决定时，仍要重新检查审核者身份和权限。不能因为前端展示了一个“批准”按钮，就允许任何持有 `thread_id` 的请求恢复任务。

## 失败与重试策略

工具执行失败后，应区分：

| 错误类型 | 推荐处理 |
|---|---|
| 临时网络错误 | 有上限的指数退避重试 |
| 参数无效 | 返回结构化错误，让 Agent 修正 |
| 权限不足 | 立即终止，不自动重试 |
| 人工拒绝 | 遵循拒绝说明，不重复同一动作 |
| 状态已变化 | 重新读取状态并再次审批 |
| 外部写入结果未知 | 使用幂等键查询结果，不能盲目重放 |

Middleware 可以统一实现重试和错误转换，但重试次数、可重试错误和幂等策略应由工具或领域层明确声明。

## 生产环境检查清单

```text
1. 每个 Middleware 是否只承担一个清晰职责
2. Middleware 顺序是否经过测试
3. 摘要和裁剪是否会丢失关键业务状态
4. 模型路由是否有延迟、费用和成功率指标
5. 哪些工具需要 approve、edit、reject 是否已明确
6. 审核者身份与权限是否在服务端重新校验
7. 中断前的代码是否无副作用或具备幂等性
8. Interrupt Payload 是否可序列化且不含秘密
9. 生产环境是否使用持久化 Checkpointer
10. thread_id 是否隔离租户并防止越权恢复
11. 每次提议、编辑、批准、拒绝和执行是否可审计
12. 工具失败和恢复执行是否有幂等与补偿策略
```

## 官方参考

- [LangChain Middleware Overview](https://docs.langchain.com/oss/python/langchain/middleware/overview)
- [LangChain Human-in-the-loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)
- [LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)

> 本文根据早期个人笔记重新整理，并结合当前官方文档进行了校对。
