# Python Service Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish four secure Python engineering documents for Redis, Kafka, MinIO, and FastAPI.

**Architecture:** Add four Markdown documents to the existing `python` documentation group. Build a dedicated static regression test for metadata, technical coverage, official references, and secret removal; the branch is stacked on the AI documentation branch while under review to avoid conflicting edits to the shared docs test entry.

**Tech Stack:** Astro content collections, Markdown, Node.js built-in test runner, redis-py, confluent-kafka-python, MinIO Python SDK, FastAPI/Starlette/asyncio.

## Global Constraints

- Files and orders: Redis 70, Kafka 80, MinIO 90, FastAPI 100.
- Redis/Kafka/MinIO section: `数据服务`; FastAPI section: `Web 工程`.
- Use current official first-party documentation for API and operational claims.
- No new Astro runtime dependency; code examples are illustrative Python snippets only.
- No private IPs, internal domains, real bucket/topic/database names, credentials, Yuque links, export footers, provider response IDs, or per-post `author`.
- Environment variables are read with `os.environ[...]` or `os.getenv(...)`; examples never include realistic secret literals.
- Every article contains a production checklist, official references, and the standard personal-note rewrite statement.

---

### Task 1: Add Python service documentation regression test

**Files:**
- Create: `tests/yuque-python-service-docs.test.mjs`
- Modify: `tests/docs-core.test.mjs`

**Interfaces:**
- Consumes: Markdown files under `src/content/posts`.
- Produces: CI assertions for four Python documents.

- [ ] **Step 1: Write the failing test**

Map each filename to group, section, order, required phrases, and official-domain patterns. Assert Frontmatter, `updated: 2026-07-30`, source note, checklist heading, official references, and absence of private IPv4 ranges, Yuque syntax, `author:`, `minioadmin`, weak password examples, literal API/access/secret keys, and known internal endpoints.

- [ ] **Step 2: Import the test**

Add:

```js
import "./yuque-python-service-docs.test.mjs";
```

to `tests/docs-core.test.mjs`.

- [ ] **Step 3: Run RED verification**

Run: `pnpm test:docs`

Expected: FAIL because all four target files are missing.

- [ ] **Step 4: Commit**

```bash
git add tests/docs-core.test.mjs tests/yuque-python-service-docs.test.mjs
git commit -m "test: require Python service documentation"
```

### Task 2: Write Redis production article

**Files:**
- Create: `src/content/posts/python-redis-production.md`

**Interfaces:**
- Produces: `python` / `数据服务` / order 70.

- [ ] **Step 1: Add Frontmatter and scope**

Title: `Python 生产环境使用 Redis`; explain that the article covers client behavior and boundaries, not Redis server deployment.

- [ ] **Step 2: Add connection example**

Use `REDIS_URL`, `redis.ConnectionPool.from_url`, `Redis.from_pool`, `decode_responses=True`, socket connect/read timeouts, health checks, and explicit client/pool close.

- [ ] **Step 3: Explain data structures and expiry**

Compare String, Hash, Set, and List; include TTL behavior and a session/cache example without personal data.

- [ ] **Step 4: Explain batching and key iteration**

Show Pipeline and `scan_iter`; explain why production code should not use `KEYS` on a large keyspace.

- [ ] **Step 5: Explain concurrent occupancy**

Show `SET key value nx=True ex=...` as a bounded occupancy/idempotency primitive, explicitly not a complete distributed-lock guarantee.

- [ ] **Step 6: Add async choice, errors, checklist, references, source note**

Reference Redis redis-py connection/client docs and command docs.

- [ ] **Step 7: Run tests and commit**

```bash
pnpm test:docs
git add src/content/posts/python-redis-production.md
git commit -m "docs: add production Redis guide for Python"
```

Expected after the test: only Kafka, MinIO, and FastAPI remain missing.

### Task 3: Write reliable Kafka article

**Files:**
- Create: `src/content/posts/python-kafka-reliable-messaging.md`

**Interfaces:**
- Produces: `python` / `数据服务` / order 80.

- [ ] **Step 1: Add Frontmatter and delivery model**

Title: `Python 可靠使用 Kafka：生产、消费与 Offset`; choose `confluent-kafka` and explain producer, partition, consumer group, and offset responsibilities.

- [ ] **Step 2: Add producer example**

Use `KAFKA_BOOTSTRAP_SERVERS` and optional SASL variables, JSON UTF-8 bytes, delivery callback, `poll(0)`, queue-full handling, and final `flush()` with remaining-message check.

- [ ] **Step 3: Add consumer example**

Use a poll loop, disabled auto commit, error handling, JSON decode, successful processing followed by synchronous message-relative commit, signal-based shutdown, and `close()` in `finally`.

- [ ] **Step 4: Explain guarantees and idempotency**

Cover at-least-once processing, duplicates after crashes, business idempotency keys, ordering only within a partition, poison messages, and batching trade-offs.

- [ ] **Step 5: Add checklist, references, and source note**

Reference Confluent's official Python client overview/API and Apache Kafka design/docs where relevant.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm test:docs
git add src/content/posts/python-kafka-reliable-messaging.md
git commit -m "docs: add reliable Kafka guide for Python"
```

### Task 4: Write secure MinIO article

**Files:**
- Create: `src/content/posts/python-minio-object-storage.md`

**Interfaces:**
- Produces: `python` / `数据服务` / order 90.

- [ ] **Step 1: Add Frontmatter and security defaults**

Title: `Python 安全使用 MinIO 对象存储`; state private bucket and TLS as the default posture.

- [ ] **Step 2: Add client configuration**

Use `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_SECURE`; reject missing values and do not include default credentials.

- [ ] **Step 3: Add a lightweight wrapper**

Implement focused methods for ensure bucket, upload, download, list, stat, delete, and presigned download. Use current SDK method signatures and content types.

- [ ] **Step 4: Handle streamed response cleanup**

For `get_object`, show `try/finally` with both `response.close()` and `response.release_conn()`.

- [ ] **Step 5: Explain bucket policies and sharing**

Differentiate private bucket, public policy, and time-limited presigned URL; do not publish an anonymous-read policy as the default example.

- [ ] **Step 6: Add checklist, references, and source note**

Reference the official MinIO Python SDK API and repository.

- [ ] **Step 7: Run tests and commit**

```bash
pnpm test:docs
git add src/content/posts/python-minio-object-storage.md
git commit -m "docs: add secure MinIO guide for Python"
```

### Task 5: Write FastAPI concurrency article

**Files:**
- Create: `src/content/posts/fastapi-concurrency-background-tasks.md`

**Interfaces:**
- Produces: `python` / `Web 工程` / order 100.

- [ ] **Step 1: Add Frontmatter and decision table**

Title: `FastAPI 并发模型与后台任务`; compare async I/O, sync blocking I/O, CPU work, short post-response tasks, and durable jobs.

- [ ] **Step 2: Explain `async def` and `def`**

State that directly called utility functions are not automatically scheduled by FastAPI; blocking calls inside `async def` block the event loop. Show an async client example and `asyncio.to_thread` for unavoidable sync I/O.

- [ ] **Step 3: Add `BackgroundTasks` example and limits**

Pass immutable identifiers/data rather than request-scoped DB sessions. Explain same-process execution, no durable queue, no built-in retry/status, and loss on worker termination.

- [ ] **Step 4: Add lifespan resource example**

Use `asynccontextmanager` to initialize and close an async client/pool once per worker.

- [ ] **Step 5: Explain worker multiplication**

Show `total_possible_connections = workers * pool_size` and discuss reserve capacity, overflow, deployment replicas, and per-process initialization.

- [ ] **Step 6: Explain event-loop errors**

Do not recommend `run_until_complete` inside a running event loop; use `await`, `asyncio.run()` only at a synchronous program entry point, or `to_thread`/executor for blocking functions.

- [ ] **Step 7: Add checklist, references, and source note**

Reference FastAPI async, BackgroundTasks, lifespan, workers/deployment concepts, and Python asyncio docs.

- [ ] **Step 8: Run GREEN verification and commit**

```bash
pnpm test:docs
git add src/content/posts/fastapi-concurrency-background-tasks.md
git commit -m "docs: add FastAPI concurrency and background task guide"
```

Expected: PASS.

### Task 6: Verify and open Python PR

**Files:**
- Review: all Python branch changes.

**Interfaces:**
- Produces: draft PR initially targeting the AI documentation branch.

- [ ] **Step 1: Run complete verification**

```bash
pnpm test:docs
pnpm test:ui-language
pnpm test:site-personalization
pnpm test:site-professionalization
pnpm check
pnpm build
pnpm biome check .
```

Expected: all pass.

- [ ] **Step 2: Review sensitive data**

Search for private IPv4 ranges, literal passwords/API keys, `minioadmin`, internal names, Yuque links, and default insecure policies. Expected: none.

- [ ] **Step 3: Open stacked draft PR**

Title: `docs: add Python data service and FastAPI engineering guides`

Base: `docs/yuque-agent-python-batch` until the AI PR merges. Body explains the temporary stacked base and that it will be retargeted to `main` after the AI PR merges.
