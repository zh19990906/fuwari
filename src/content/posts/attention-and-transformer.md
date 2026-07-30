---
title: 注意力机制与 Transformer 架构
published: 2026-01-07
updated: 2026-07-30
description: 用直观流程理解 Q、K、V、自注意力、多头注意力和 Transformer 编码器/解码器。
tags: [Transformer, Attention, QKV, 深度学习, LLM]
category: AI
contentType: docs
docGroup: ai-llm
docSection: 模型架构
docOrder: 20
draft: false
---

Transformer 的核心不是“完全不需要顺序”，而是通过注意力让每个 token 可以直接读取其他位置的信息，再结合位置信息、前馈网络和残差结构逐层构建上下文表示。

## 为什么需要注意力

循环神经网络按时间步处理序列，长距离信息需要经过许多状态传递；卷积网络依靠堆叠扩大感受野。注意力提供了更直接的交互方式：当前 token 可以为序列中不同位置分配不同权重。

例如句子：

```text
小王把书放在桌上，因为它太重了。
```

模型理解“它”时，需要综合“书”“桌”等候选信息。注意力不是显式语法规则，但可以学习哪些位置对当前表示更重要。

## Q、K、V 的直觉

每个 token 的隐藏向量通过三个线性变换得到：

- **Query（Q）**：当前位置正在寻找什么；
- **Key（K）**：每个位置可以用什么特征被匹配；
- **Value（V）**：匹配后真正汇总的信息。

类比检索系统：Query 是查询，Key 是索引特征，Value 是被取回的内容。这个类比帮助理解数据流，但 Q/K/V 都是训练得到的连续向量，不是人工编写的关键词。

## 缩放点积注意力

核心公式：

```text
Attention(Q, K, V) = softmax(QKᵀ / √dₖ)V
```

步骤：

1. `QKᵀ` 计算每个 Query 与所有 Key 的相似分数；
2. 除以 `√dₖ`，减小维度增大导致的数值幅度；
3. 经过 softmax 得到每行权重；
4. 权重与 V 相乘，得到加权汇总结果。

简化伪代码：

```python
scores = query @ key.transpose(-1, -2)
scores = scores / sqrt(key_dimension)
weights = softmax(scores, axis=-1)
output = weights @ value
```

这段代码只展示数据流。真实实现还要处理 batch、多头、mask、数值稳定性、低精度和高效内核。

## 自注意力的数据流

自注意力中，Q、K、V 都来自同一序列：

```text
输入 token
→ Embedding + 位置信息
→ 线性映射得到 Q/K/V
→ 计算注意力权重
→ 汇总其他 token 的 V
→ 得到新的上下文表示
```

每层都会更新表示。浅层可能更关注局部结构，深层可以组合更抽象的语义，但具体模式取决于模型、数据和训练目标。

## 多头注意力

单个注意力头只有一套投影空间。多头注意力并行计算多组 Q/K/V：

```text
Head 1：可能关注局部搭配
Head 2：可能关注实体关系
Head 3：可能关注长距离依赖
...
拼接所有 Head
→ 输出投影
```

形式上：

```text
MultiHead(Q, K, V) = Concat(head₁, ..., headₕ)Wᴼ
```

不要把每个头解释成固定的人类概念。某些头的行为可以观察，但不同层和不同输入下会变化。

## 位置信息

纯注意力只看向量集合，无法自然区分 token 顺序。Transformer 需要注入位置信息，常见方式包括：

- 固定正弦位置编码；
- 可学习绝对位置向量；
- 相对位置偏置；
- 旋转位置编码（RoPE）。

不同方法影响长度外推、计算方式和模型结构。阅读模型配置时，应确认最大位置、RoPE 参数和实际支持的上下文长度，而不是只看宣传值。

## Mask 的作用

### Padding Mask

批量序列长度不同，需要屏蔽补齐 token，避免模型把 padding 当作有效内容。

### Causal Mask

自回归生成时，第 `i` 个位置只能查看自己和之前的位置，不能看到未来答案：

```text
可见矩阵
1 0 0 0
1 1 0 0
1 1 1 0
1 1 1 1
```

训练时即使整段目标文本同时输入，也通过 causal mask 保持“预测下一个 token”的约束。

### 业务 Mask

部分模型还使用滑动窗口、局部注意力或稀疏注意力来降低计算量。Mask 写错会导致信息泄漏、生成质量下降或数值异常。

## Transformer Block

典型 Block 包括：

```text
输入
→ LayerNorm
→ Attention
→ 残差相加
→ LayerNorm
→ 前馈网络（MLP/FFN）
→ 残差相加
→ 输出
```

不同模型可能使用 Pre-Norm、Post-Norm、RMSNorm、门控 MLP、不同激活函数或并行分支，但“信息混合 + 非线性变换 + 残差”是阅读结构图时的主线。

## 前馈网络

注意力负责 token 之间交换信息，FFN 通常对每个位置独立执行非线性变换：

```text
hidden → 扩大维度 → 激活/门控 → 压回隐藏维度
```

大型模型中，FFN 参数和计算量经常占很大比例。混合专家模型（MoE）会让每个 token 只路由到部分专家，以增加参数容量而不按比例增加单 token 计算。

## Encoder、Decoder 与 Decoder-only

### Encoder-only

每个位置通常可以双向查看上下文，适合分类、抽取和表示学习。

```text
输入文本 → 双向编码 → 分类头或向量
```

### Encoder-Decoder

Encoder 读取源序列，Decoder 通过交叉注意力读取 Encoder 输出，并自回归生成目标序列。经典机器翻译与摘要常使用这种结构。

### Decoder-only

使用 causal self-attention，根据已有 token 预测后续 token。许多通用 LLM 采用 Decoder-only 架构，再通过指令微调和对话模板支持多任务。

## Cross-Attention

Cross-Attention 的 Q 来自当前序列，K/V 来自另一个序列或模态：

```text
Decoder hidden 生成 Q
Encoder output 生成 K/V
→ Decoder 选择需要的源信息
```

多模态模型也可能通过交叉注意力或统一 token 空间融合图像、音频和文本。

## 计算与上下文成本

标准全注意力需要构造长度 `n × n` 的分数矩阵，时间和显存通常随序列长度近似平方增长。上下文翻倍可能带来远高于两倍的注意力成本。

实际系统会使用：

- FlashAttention 等内存高效内核；
- KV Cache；
- 分页缓存；
- 滑动窗口或稀疏注意力；
- 分块预填充；
- 上下文压缩和检索。

## KV Cache

自回归生成时，历史 token 的 K/V 不必每一步重新计算，可以保存在 KV Cache 中。代价是缓存随层数、隐藏维度、序列长度和并发增长。

因此服务容量不能只看模型权重：

```text
总显存 ≈ 模型权重 + KV Cache + 激活/工作区 + 框架开销
```

长上下文和高并发往往首先受 KV Cache 限制。

## 注意力权重能否解释模型

注意力权重可以帮助观察信息流，但不能直接等同于完整因果解释：

- 后续层会继续变换表示；
- 残差连接绕过注意力分支；
- 多头和 MLP 共同影响结果；
- 高权重不一定意味着对最终输出贡献最大。

解释模型时应结合消融实验、梯度方法、对照输入和行为评估。

## 阅读模型结构图的顺序

```text
1. 输入如何分词或编码
2. 隐藏维度与层数
3. Attention 类型和头数
4. 位置编码与上下文限制
5. Norm、残差和 FFN 结构
6. Mask 与信息可见范围
7. 输出头和训练目标
8. 推理时 KV Cache 与并行策略
```

先理解单个 Block 的输入输出，再看模型如何重复堆叠，避免一开始陷入全部公式和框架实现细节。

## 常见误区

- **注意力就是搜索数据库：** 只是直觉类比，向量和权重由模型端到端学习。
- **上下文越长越好：** 长上下文增加成本，也不保证模型能有效利用远处信息。
- **所有头都有明确功能：** 头的行为通常分布式且输入相关。
- **Transformer 不处理顺序：** 它通过位置机制表示顺序。
- **注意力权重就是解释：** 它只是分析信号之一。

## 学习检查清单

```text
1. 能画出 Q/K/V 到输出的数据流
2. 理解 softmax 前为什么除以 √dₖ
3. 能区分 self-attention 与 cross-attention
4. 能说明 causal mask 防止了什么
5. 能区分 Encoder、Encoder-Decoder、Decoder-only
6. 知道上下文长度对计算和 KV Cache 的影响
7. 阅读具体模型时会核对位置编码和 Attention 变体
```

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
