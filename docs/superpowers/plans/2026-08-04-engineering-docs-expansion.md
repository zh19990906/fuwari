# Engineering Documentation Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight production-focused engineering documents and a DevOps documentation group to complete the repository's development-to-deployment learning path.

**Architecture:** Keep all articles in the existing Astro content collection, register one new documentation group, and add a focused static regression test imported by the existing documentation test entry. No runtime dependencies are added.

**Tech Stack:** Astro content collections, Markdown, TypeScript configuration, Node.js built-in test runner, FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL, OpenTelemetry, Docker Compose, Docker Build, GitHub Actions.

## Global Constraints

- All articles are Chinese prose with English API names where needed.
- All files use `contentType: docs`, `updated: 2026-08-04`, and `draft: false`.
- No per-post `author` field.
- No real credentials, private IPv4 addresses, internal domains, or reusable weak secrets.
- References must point to first-party official documentation.
- No new Astro runtime dependency.

---

### Task 1: Define regression requirements

**Files:**
- Create: `tests/engineering-docs.test.mjs`
- Modify: `tests/docs-core.test.mjs`

- [ ] Write a failing static test for all eight expected Markdown files and the `devops` group.
- [ ] Run `node --test tests/engineering-docs.test.mjs` and verify it fails because files and group are missing.
- [ ] Import the focused test from `tests/docs-core.test.mjs`.

### Task 2: Add FastAPI engineering series

**Files:**
- Create: `src/content/posts/fastapi-authentication-authorization.md`
- Create: `src/content/posts/fastapi-testing-pytest.md`
- Create: `src/content/posts/fastapi-sqlalchemy-alembic.md`

- [ ] Write authentication and authorization guidance with password hashing, access/refresh token boundaries, RBAC and resource ownership.
- [ ] Write pytest/TestClient guidance with dependency overrides, database isolation and async testing.
- [ ] Write SQLAlchemy 2.x Session, transaction, pool and Alembic migration guidance.
- [ ] Run the focused test and confirm only later tasks remain missing.

### Task 3: Add database and observability documents

**Files:**
- Create: `src/content/posts/postgresql-transactions-locks.md`
- Create: `src/content/posts/python-opentelemetry-observability.md`

- [ ] Cover PostgreSQL isolation levels, row locks, deadlocks, serialization retries and monitoring queries.
- [ ] Cover structured logs, traces, metrics, OTLP, Collector, cardinality and sensitive-data handling.
- [ ] Run the focused test and confirm only Docker and DevOps files remain missing.

### Task 4: Add Docker production documents

**Files:**
- Create: `src/content/posts/docker-compose-production.md`
- Create: `src/content/posts/dockerfile-production-security.md`

- [ ] Cover production override files, health checks, startup ordering, restart policies, resource limits, backup and rollback.
- [ ] Cover multi-stage builds, cache ordering, pinned bases, non-root runtime, read-only filesystems, build secrets, SBOM and CI scans.
- [ ] Run the focused test and confirm only the DevOps file and group remain missing.

### Task 5: Add DevOps group and GitHub Actions guide

**Files:**
- Modify: `src/config/docs.ts`
- Create: `src/content/posts/github-actions-secure-cicd.md`

- [ ] Register the `devops` group at order 80.
- [ ] Cover PR checks, permissions, SHA pinning, dependency review, environments, OIDC, artifacts, concurrency and rollback.
- [ ] Run the focused test and verify all assertions pass.

### Task 6: Complete verification and publish

- [ ] Run `node --test tests/engineering-docs.test.mjs`.
- [ ] Scan all new Markdown for secrets, private addresses, malformed frontmatter and unclosed code fences.
- [ ] Create branch `agent/engineering-docs-expansion` from `main`.
- [ ] Commit all files in one coherent content commit.
- [ ] Open a Draft PR targeting `main`.
- [ ] Confirm GitHub Actions results for Code quality, documentation tests, Astro Check and Astro Build.
