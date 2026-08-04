---
title: Python 服务可观测性：结构化日志、指标与 OpenTelemetry 链路追踪
published: 2026-08-04
updated: 2026-08-04
description: 为 Python 和 FastAPI 服务建立日志、指标、Trace 和 OTLP 导出链路，覆盖上下文传播、高基数风险、敏感数据和 Collector 部署边界。
tags: [Python, OpenTelemetry, 可观测性, Metrics, Tracing]
category: Python
contentType: docs
docGroup: python
docSection: 可观测性
docOrder: 140
draft: false
---

监控回答“系统是否异常”，可观测性帮助回答“为什么异常”。单独增加更多日志并不能自动解决问题：没有请求关联 ID、服务间上下文和稳定字段时，日志量越大，定位反而越慢。

OpenTelemetry 提供统一的 Trace、Metrics、Logs API、SDK 和协议。当前 Python 实现中 Traces 与 Metrics 为稳定状态，Logs 仍处于 Development；生产方案应按各信号成熟度分别评估，而不是假设它们完全等价。

## 三类信号的职责

| 信号 | 适合回答 | 常见错误 |
|---|---|---|
| 日志 | 某个事件发生了什么 | 记录敏感数据、字段不一致 |
| 指标 | 系统整体是否偏离正常范围 | 标签高基数、只看平均值 |
| Trace | 一个请求跨服务经历了什么 | 全量采样成本过高、缺少传播 |

可观测性不能替代业务审计。审计事件关注“谁在何时执行了什么受控操作”，保留周期、完整性和访问权限通常不同于普通应用日志。

## 结构化日志

```python
import json
import logging
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "trace_id": getattr(record, "trace_id", None),
            "request_id": getattr(record, "request_id", None),
        }
        return json.dumps(payload, ensure_ascii=False)
```

字段名要稳定。不要把整个请求体、Authorization Header、Cookie、数据库连接串或模型提示词默认写入日志。

日志级别建议：

- `DEBUG`：只在受控调试环境开启；
- `INFO`：关键生命周期与业务里程碑；
- `WARNING`：系统能够继续但需要关注；
- `ERROR`：当前操作失败；
- `CRITICAL`：服务级不可用或数据安全风险。

## Request ID 与 Trace ID

Request ID 适合单个入口请求的用户支持和日志搜索；Trace ID 由链路追踪系统生成并跨服务传播。两者可以同时存在。

```python
from uuid import uuid4

from fastapi import Request


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response
```

只信任外部 Request ID 用于关联，不要把它直接作为权限、数据库主键或文件路径。

## 安装 OpenTelemetry

```bash
python -m pip install \
  opentelemetry-api \
  opentelemetry-sdk \
  opentelemetry-exporter-otlp \
  opentelemetry-instrumentation-fastapi \
  opentelemetry-instrumentation-httpx
```

应用使用 SDK 初始化 Provider；可复用库通常只依赖 API，让宿主应用决定采样和导出。

## 自动插桩

```bash
opentelemetry-instrument \
  --traces_exporter otlp \
  --metrics_exporter otlp \
  uvicorn app.main:app --host 0.0.0.0 --port 8000
```

常用环境变量：

```bash
export OTEL_SERVICE_NAME=blog-api
export OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=production,service.version=2026.08.04
```

OTLP Endpoint 应指向受控 Collector 或后端。不要把遥测出口直接暴露在公网，也不要在环境变量示例中提交真实认证信息。

## 手动创建 Span

```python
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

tracer = trace.get_tracer(__name__)


def rebuild_article_index(article_id: str) -> None:
    with tracer.start_as_current_span("article.index.rebuild") as span:
        span.set_attribute("article.id", article_id)
        try:
            rebuild(article_id)
        except Exception as exc:
            span.record_exception(exc)
            span.set_status(Status(StatusCode.ERROR))
            raise
```

Span 名称表达稳定操作，不要把用户 ID、完整 URL 或随机值放进名称。动态信息使用属性，并限制敏感性和基数。

读取当前 Trace ID 写入日志：

```python
from opentelemetry import trace


def current_trace_id() -> str | None:
    context = trace.get_current_span().get_span_context()
    if not context.is_valid:
        return None
    return format(context.trace_id, "032x")
```

## 指标设计

服务最基本的 RED 指标：

- Rate：请求速率；
- Errors：错误数量或比例；
- Duration：延迟分布。

```python
from opentelemetry import metrics

meter = metrics.get_meter(__name__)
article_counter = meter.create_counter(
    "article.publish.count",
    description="Number of completed article publications",
)


def record_publish(result: str) -> None:
    article_counter.add(1, {"result": result})
```

标签值应是有限集合，例如 `result=success|conflict|error`。不要使用用户 ID、订单 ID、完整错误文本或 URL 作为指标标签，这会造成高基数并显著增加存储和查询成本。

延迟应使用 Histogram，而不是只记录平均值。平均值可能掩盖少量极慢请求。

## 上下文传播

OpenTelemetry Python 默认使用 W3C Trace Context 和 Baggage。HTTP 客户端和服务端插桩会传播 `traceparent`。

不要把访问令牌、邮箱等敏感信息放进 Baggage。Baggage 会跨服务传播，且可能进入遥测后端。

异步任务和消息系统需要显式传播上下文：

- HTTP 使用标准 Header；
- Kafka 等消息在消息 Header 中注入上下文；
- 后台任务如果与请求存在因果关系，可继续父上下文或使用 Span Link；
- 长时间队列任务不应伪装为一直打开的同步请求 Span。

## Collector 的作用

推荐链路：

```text
应用
  ↓ OTLP
OpenTelemetry Collector
  ├─ 批处理
  ├─ 重试与队列
  ├─ 属性清洗
  ├─ 采样
  └─ 导出到遥测后端
```

Collector 可以减少应用直接绑定某个厂商后端。它不是无限缓冲区；后端长时间不可用时仍然可能丢数据或占满磁盘，需要限制队列和监控自身健康。

简化配置：

```yaml
receivers:
  otlp:
    protocols:
      grpc: {}
      http: {}

processors:
  batch: {}
  memory_limiter:
    check_interval: 1s
    limit_mib: 512

exporters:
  debug: {}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [debug]
```

生产环境把 `debug` 换成经过认证的后端 Exporter，并限制 Collector 管理端口的网络访问。

## 采样

全量 Trace 在高流量系统中成本很高。常见策略：

- 开发环境全采样；
- 生产使用父级一致的概率采样；
- 对错误和高延迟请求使用尾部采样；
- 关键交易单独设置更高采样率；
- 采样策略变更后监控成本与可定位性。

采样会影响 Trace，不应影响错误计数等核心指标。

## 敏感数据与属性清洗

禁止默认采集：

- Authorization Header 和 Cookie；
- 密码、访问令牌和刷新令牌；
- 完整 SQL 参数；
- 上传文件内容；
- 模型 Prompt 中的个人信息；
- 内部密钥路径和连接串。

路由模板 `/users/{user_id}` 适合作为低基数属性，实际路径 `/users/928374` 不适合直接作为指标标签。

## 告警从用户影响出发

优先告警：

- 错误率持续超过阈值；
- p95/p99 延迟超过 SLO；
- 数据库连接池耗尽；
- 队列积压和消费停滞；
- Collector 拒绝或丢弃数据；
- 服务实例反复重启。

不要给每一条错误日志创建告警。告警必须可行动，并包含服务、环境、时间窗口、关键指标和排障入口。

## 生产检查清单

- [ ] 日志使用稳定 JSON 字段，并包含 Request ID 或 Trace ID；
- [ ] 日志、Span 和指标不采集密码、令牌和认证 Header；
- [ ] Trace、Metrics 和 Logs 的成熟度分别评估；
- [ ] OTLP 流量只发送到受控 Collector 或后端；
- [ ] 服务名、版本和部署环境作为 Resource 属性；
- [ ] 指标标签使用有限集合，避免高基数；
- [ ] 延迟使用 Histogram 并关注 p95/p99；
- [ ] 上下文跨 HTTP 和消息链路传播；
- [ ] Collector 的队列、内存、丢弃和出口失败被监控；
- [ ] 采样策略与成本、SLO 和故障定位需求匹配。

## 参考资料

- [OpenTelemetry Python](https://opentelemetry.io/docs/languages/python/)
- [OpenTelemetry Python Instrumentation](https://opentelemetry.io/docs/languages/python/instrumentation/)
- [OpenTelemetry Python Getting Started](https://opentelemetry.io/docs/languages/python/getting-started/)

> 本文补充 Python 服务从日志排查到分布式可观测性的工程链路。
