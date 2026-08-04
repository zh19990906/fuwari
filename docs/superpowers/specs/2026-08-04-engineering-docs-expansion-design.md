# 工程闭环文档扩展设计

日期：2026-08-04

## 目标

在现有 Fuwari 文档体系中新增八篇工程实践文档，补齐从 FastAPI 开发、数据库事务、测试、容器化、可观测性到 CI/CD 的主链路，并新增 `DevOps` 文档分组。

## 范围

新增文档：

1. FastAPI 认证授权实战
2. FastAPI 测试体系
3. FastAPI、SQLAlchemy 2.x 与 Alembic
4. PostgreSQL 事务、锁、死锁与重试
5. Python 服务 OpenTelemetry 可观测性
6. Docker Compose 生产实践
7. 生产 Dockerfile 与容器安全
8. GitHub Actions 安全 CI/CD

不包含后续候选清单中的 Linux、Nginx、RAG、MCP 和 YOLO 扩展，以控制单个 PR 的审阅范围。

## 内容结构

每篇文章继续位于 `src/content/posts/`，使用现有 `contentType: docs` 元数据。Python 三篇 Web 文档按 110、120、130 排序，可观测性文档按 140 排序；PostgreSQL 文档按 60；Docker 文档按 70 和 80；DevOps 首篇按 10。

每篇文章必须包含：

- 明确的适用范围和不适用范围；
- 可执行但不含真实凭据的示例；
- 失败模式与安全边界；
- 验证或排障步骤；
- 生产检查清单；
- 第一方官方参考资料；
- `updated: 2026-08-04`；
- 不设置单篇 `author`。

## 分组变更

在 `src/config/docs.ts` 新增：

```ts
{
  slug: "devops",
  title: "DevOps",
  description: "版本控制、CI/CD、发布、可观测性与自动化实践",
  order: 80,
}
```

## 测试策略

新增 `tests/engineering-docs.test.mjs`，静态验证：

- 八个文件存在；
- Frontmatter 分组、章节、排序和更新时间正确；
- 必需主题与官方参考存在；
- 无单篇作者、私有 IPv4、明文密码、API Key、Token 或默认弱凭据；
- DevOps 分组已注册。

从 `tests/docs-core.test.mjs` 导入该测试，使现有 `pnpm test:docs` 在 Node.js 22/23 中运行。

## 发布方式

所有改动进入独立分支 `agent/engineering-docs-expansion`，通过 Draft PR 提交到 `main`。PR 必须等待 Code quality、文档测试、Astro Check 和 Astro Build 全部通过后再标记完成。
