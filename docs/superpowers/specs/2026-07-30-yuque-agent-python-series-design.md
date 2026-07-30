# 语雀 Agent 与 Python 工程系列迁移设计

日期：2026-07-30

## 目标

从私有 `zh19990906/yuque` 仓库中选择六篇高价值主题，重写为可公开、可持续维护的博客文档：

1. LangChain 1.0 核心架构与 LangGraph 分工
2. LangChain Middleware 与人在环 Agent
3. Python 生产环境使用 Redis
4. Python 可靠使用 Kafka
5. Python 安全使用 MinIO
6. FastAPI 并发模型与后台任务

本批次不做语雀原文的直接复制。语雀笔记提供个人实践素材、问题背景和示例线索；最终正文以当前官方文档和可复现示例为准，并明确清理私有信息和过时接口。

## 交付方式

拆成两个独立 PR：

### PR A：AI / LLM Agent 工程

新增两篇文档：

| 文件 | 分组 | 章节 | 顺序 |
|---|---|---|---:|
| `langchain-agent-runtime.md` | `ai-llm` | `Agent 工程` | 30 |
| `langchain-middleware-hitl.md` | `ai-llm` | `Agent 工程` | 40 |

现有 AI / LLM 文档顺序保持不变：

- 10：NLP 与大语言模型基础概念
- 20：注意力机制与 Transformer 架构

### PR B：Python 数据服务与 Web 工程

新增四篇文档：

| 文件 | 分组 | 章节 | 顺序 |
|---|---|---|---:|
| `python-redis-production.md` | `python` | `数据服务` | 70 |
| `python-kafka-reliable-messaging.md` | `python` | `数据服务` | 80 |
| `python-minio-object-storage.md` | `python` | `数据服务` | 90 |
| `fastapi-concurrency-background-tasks.md` | `python` | `Web 工程` | 100 |

现有 Python 文档最高顺序为 60，因此本批次从 70 开始，不调整已有文章顺序。

## 内容设计

### 1. LangChain 1.0 核心架构与 LangGraph 分工

来源：语雀《LangChain 1.0 学习笔记》。

正文重点：

- LangChain 1.x 的统一模型、消息、工具和 Agent 抽象
- `create_agent` 的职责和运行流程
- LangChain 与 LangGraph 的边界
- 状态、节点、边、检查点和恢复执行
- 什么场景使用 LangChain，什么场景直接使用 LangGraph
- 最小可运行的工具调用 Agent 示例
- 版本、依赖和环境变量约定

明确不保留：

- 语雀笔记中的明文 API Key
- DeepSeek、GLM 名称和接口地址混用示例
- Notebook 输出中的供应商私有响应
- 未经复核的版本断言
- 课程式大段说明和原截图

### 2. LangChain Middleware 与人在环 Agent

来源：同一份 LangChain 1.0 语雀笔记中的 Middleware、Human-in-the-loop、消息治理和动态模型路由内容。

正文重点：

- Middleware 的作用和执行位置
- 模型调用前后处理
- 消息裁剪、删除与摘要
- 动态模型路由和预算控制
- 敏感工具调用的暂停、批准、拒绝与恢复
- Checkpointer 与可恢复执行
- 哪些操作必须使用人在环
- 一个带危险工具审批的最小示例

安全边界：

- 示例工具只使用本地内存或演示数据
- 不包含转账、真实发信、写生产数据库等真实副作用
- 凭据只从环境变量读取
- 明确说明人在环不能替代权限控制、审计和幂等性

### 3. Python 生产环境使用 Redis

来源：语雀《Python 操作 Redis》。

正文重点：

- `redis-py` 客户端和连接池
- URL / 环境变量配置
- 连接、读取和写入超时
- 字符串、Hash、Set 和 List 的适用场景
- TTL 和过期策略
- Pipeline 批处理
- `SCAN` 与 `KEYS` 的差别
- `SET NX EX` 的并发占位语义
- 同步与异步客户端的选择
- 异常处理、重试和连接关闭

不把分布式锁描述成绝对可靠方案；只说明单 Redis 实例下的基础占位模式和边界。

### 4. Python 可靠使用 Kafka

来源：语雀《Python 操作 Kafka》。

正文重点：

- Producer / Consumer / Consumer Group 基础
- JSON 序列化和 UTF-8
- `acks`、重试和发送结果检查
- `flush()` 与资源关闭
- Consumer Poll 模式
- 自动提交与手动提交 Offset
- 处理成功后提交
- 重复消息和业务幂等
- 批量拉取、错误记录与优雅退出
- 一个可运行的生产者和消费者示例

旧笔记中的真实 Broker 地址、临时 Topic 名、无意义调试输出和未使用导入全部删除。

### 5. Python 安全使用 MinIO

来源：语雀《Python 操作 MinIO》。

正文重点：

- MinIO Python SDK 初始化
- Endpoint、Access Key、Secret Key 和 TLS
- Bucket 检查与创建
- 上传、下载、列举、删除和元数据
- 流式读取后的资源关闭
- 预签名下载 URL
- 私有 Bucket、公开策略和临时分享的差别
- 大文件、Content-Type 和错误处理
- 一个职责清晰的轻量客户端封装

明确不保留：

- `minioadmin/minioadmin`
- 真实内网地址
- 默认匿名公开 Bucket 的行为
- 将凭据写进模块级常量的写法
- 旧作者头注释

### 6. FastAPI 并发模型与后台任务

来源：语雀综合《笔记》中的 FastAPI 工程经验。

正文重点：

- `async def` 和普通 `def` 的区别
- 阻塞 I/O 对事件循环的影响
- 何时使用同步客户端、异步客户端和线程池
- `BackgroundTasks` 的适用范围
- 不适合使用 `BackgroundTasks` 的持久任务
- 多进程部署与数据库连接数放大
- 每个 Worker 的连接池容量估算
- 应用生命周期中的资源初始化和关闭
- 常见错误：在运行中的事件循环里调用 `run_until_complete`
- 最小 FastAPI 示例和部署检查清单

不扩展成完整 FastAPI 入门教程，聚焦原笔记中真实遇到的并发和部署问题。

## 写作标准

每篇文档必须包含：

- 清晰的 Frontmatter
- 问题背景和适用范围
- 可运行或接近可运行的最小示例
- 关键参数解释
- 常见错误或边界
- 生产环境检查清单
- 个人笔记重写说明
- 官方资料参考链接

写作风格：

- 使用中文正文和必要的英文 API 名称
- 不使用课程讲义式套话
- 不复制语雀中的大段原文
- 不展示未经必要的完整模型响应
- 示例使用 `example.com`、`localhost`、文档保留地址或环境变量
- 不新增单篇 `author` 字段，继续继承全站作者 `Henson`

## 安全清理

迁移前必须扫描并移除：

- API Key、Access Key、Secret Key、Token 和密码
- 内网 IP、内部域名和私人服务地址
- 真实数据库、Bucket、Topic 和业务名称
- 语雀链接和导出页脚
- 语雀 HTML 标签、提示块语法和本地图片引用
- 私人 Notebook 输出、账号信息和模型供应商响应 ID

已在 LangChain 原笔记中发现明文模型 API Key。它不会进入博客；该凭据应按已泄露处理并完成轮换。

## 外部复核范围

正文实现阶段只使用一手资料复核技术内容：

- LangChain / LangGraph 官方文档
- Redis 官方命令文档和 redis-py 官方文档
- Apache Kafka 官方文档及所选 Python 客户端官方文档
- MinIO Python SDK 官方文档
- FastAPI、Starlette、Python 官方文档

外部资料用于校正当前接口、版本和安全实践；语雀来源中的个人问题背景和经验保留，但会明确与官方事实区分。

## 测试与验收

新增回归测试，验证六篇文档：

- 文件存在
- `contentType: docs`
- 正确的 `docGroup`、`docSection` 和 `docOrder`
- 标题和 slug 不重复
- 无单篇作者覆盖
- 无语雀链接、导出页脚和语雀 HTML
- 无私有 IPv4 地址
- 无疑似硬编码密钥、密码和 Token
- 无 `minioadmin`、示例明文 API Key 和已知内部地址
- 每篇包含个人笔记重写说明和至少一个官方参考链接

完整验证：

- Biome
- 文档回归测试
- 现有 UI、活动、个人化和专业化测试
- Astro Check，Node.js 22 / 23
- Astro 生产构建，Node.js 22 / 23

## 非目标

本批次不做：

- 新增 Redis、Kafka、MinIO 独立一级文档分组
- 部署真实 Redis、Kafka 或 MinIO 服务
- 完整 RAG 教程
- LangGraph 多 Agent 系统
- Celery 或独立任务队列教程
- MongoDB、Elasticsearch、ClickHouse 和 Scrapy 迁移
- 语雀图片批量搬运

这些内容留给后续独立批次。