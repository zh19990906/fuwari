# 工程闭环文档索引

本批文档补齐从 FastAPI 开发、数据库事务、测试、容器化、可观测性到 CI/CD 的主要工程链路。

## Python / Web 工程

1. FastAPI 认证授权实战：OAuth2、JWT、角色与资源权限
2. FastAPI 测试体系：pytest、TestClient、依赖覆盖与数据库隔离
3. FastAPI 数据库工程：SQLAlchemy 2.x、事务、连接池与 Alembic

## PostgreSQL / 事务与并发

1. PostgreSQL 事务与并发：隔离级别、锁、死锁和重试

## Python / 可观测性

1. Python 服务可观测性：结构化日志、指标与 OpenTelemetry 链路追踪

## Docker

1. Docker Compose 生产实践：健康检查、资源限制、配置与回滚
2. 生产 Dockerfile：多阶段构建、缓存、非 root 用户与供应链安全

## DevOps / CI/CD

1. GitHub Actions 实战：从 Pull Request 检查到安全部署

所有文章均使用 `updated: 2026-08-04`，包含生产检查清单和第一方官方参考资料，并由 `tests/engineering-docs.test.mjs` 验证元数据、安全边界与关键主题。
