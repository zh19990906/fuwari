# LangChain Agent Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish two current, secure AI/LLM documents covering LangChain 1.x agent runtime architecture and middleware-based human approval.

**Architecture:** Keep both articles in the existing `ai-llm` documentation group. Add a focused static regression test that validates metadata, required technical topics, official references, and sensitive-data removal; import that test from the existing docs test entry so CI runs it on Node.js 22 and 23.

**Tech Stack:** Astro content collections, Markdown, Node.js built-in test runner, LangChain 1.x, LangGraph 1.x.

## Global Constraints

- Files: `langchain-agent-runtime.md` and `langchain-middleware-hitl.md`.
- `docGroup: ai-llm`; `docSection: Agent 工程`; orders 30 and 40.
- Chinese prose with necessary English API names.
- Source note must say the article was rewritten from early personal notes.
- Use only current official LangChain/LangGraph documentation for API claims.
- No API keys, tokens, private IPs, internal domains, Yuque links, export footers, provider response IDs, or per-post `author`.
- Examples use environment variables and local in-memory side effects only.
- No new runtime dependency in the Astro project.

---

### Task 1: Add AI documentation regression test

**Files:**
- Create: `tests/yuque-agent-docs.test.mjs`
- Modify: `tests/docs-core.test.mjs`

**Interfaces:**
- Consumes: Markdown files under `src/content/posts`.
- Produces: CI assertions for the two AI documents.

- [ ] **Step 1: Write the failing test**

Create a test that maps each expected filename to group, section, order, required phrases, and official-domain patterns. For every article assert Frontmatter, `updated: 2026-07-30`, source note, checklist heading, and absence of Yuque markup, private IPv4 ranges, credentials, `minioadmin`, and `author:`.

- [ ] **Step 2: Import the test from the docs entry**

Add:

```js
import "./yuque-agent-docs.test.mjs";
```

to `tests/docs-core.test.mjs`.

- [ ] **Step 3: Run RED verification**

Run: `pnpm test:docs`

Expected: FAIL because `langchain-agent-runtime.md` and `langchain-middleware-hitl.md` do not exist.

- [ ] **Step 4: Commit the failing test**

```bash
git add tests/docs-core.test.mjs tests/yuque-agent-docs.test.mjs
git commit -m "test: require LangChain agent documentation"
```

### Task 2: Write LangChain agent runtime article

**Files:**
- Create: `src/content/posts/langchain-agent-runtime.md`
- Test: `tests/yuque-agent-docs.test.mjs`

**Interfaces:**
- Consumes: LangChain v1 release/migration docs and LangGraph persistence docs.
- Produces: `ai-llm` document order 30.

- [ ] **Step 1: Add Frontmatter**

Use title `LangChain 1.x Agent Runtime 与 LangGraph 分工`, description focused on `create_agent`, graph runtime, persistence, and selection boundaries; tags include LangChain, LangGraph, Agent, Middleware.

- [ ] **Step 2: Explain the runtime boundary**

Cover the standard agent loop, `create_agent` as the v1 entry point, LangGraph as execution/runtime foundation, state, nodes, edges, checkpoints, thread IDs, persistence, and recovery.

- [ ] **Step 3: Add a minimal safe tool example**

Show installation commands and a Python example using a model name supplied through `MODEL_NAME`, an API key supplied through the provider's environment variable, and a pure local calculator/tool with no external side effect.

- [ ] **Step 4: Add selection guidance**

Include a comparison table for LangChain, direct LangGraph, and ordinary deterministic Python; explicitly avoid using an agent when a fixed workflow is sufficient.

- [ ] **Step 5: Add failure boundaries and checklist**

Cover model/tool loop termination, tool argument validation, timeouts, idempotency, persistent checkpointers, observability, and dependency pinning.

- [ ] **Step 6: Add official references and source note**

Reference official LangChain v1 release/migration, agents, and LangGraph persistence pages. End with `本文根据早期个人笔记重新整理，并结合当前官方文档进行了校对。`

- [ ] **Step 7: Run targeted test**

Run: `pnpm test:docs`

Expected: only the middleware document remains missing.

- [ ] **Step 8: Commit**

```bash
git add src/content/posts/langchain-agent-runtime.md
git commit -m "docs: explain LangChain agent runtime architecture"
```

### Task 3: Write middleware and HITL article

**Files:**
- Create: `src/content/posts/langchain-middleware-hitl.md`
- Test: `tests/yuque-agent-docs.test.mjs`

**Interfaces:**
- Consumes: LangChain middleware/HITL docs and LangGraph interrupts/persistence docs.
- Produces: `ai-llm` document order 40.

- [ ] **Step 1: Add Frontmatter**

Use title `LangChain Middleware 与人在环 Agent`, description focused on middleware hooks, message governance, routing, approval, and recovery.

- [ ] **Step 2: Explain middleware hooks**

Describe `before_agent`, `before_model`, `wrap_model_call`, `wrap_tool_call`, `after_model`, and `after_agent` by responsibility rather than copying the API reference.

- [ ] **Step 3: Cover context governance**

Explain trimming, summarization, selective tool exposure, PII/secret handling, dynamic model routing, and cost budgets. State that model routing is a policy decision and requires metrics.

- [ ] **Step 4: Add safe HITL example**

Use `HumanInTheLoopMiddleware`, `InMemorySaver`, a local `stage_change` tool that only appends a proposed change to an in-memory list, `thread_id`, and `approve`/`edit`/`reject` decisions. Do not use real email, SQL, transfers, or file deletion.

- [ ] **Step 5: Explain interrupt rules**

State that interrupted nodes may restart from the beginning, pre-interrupt side effects must be idempotent, payloads must be serializable, interrupts must not be swallowed by broad `try/except`, and production requires a durable checkpointer.

- [ ] **Step 6: Add security boundary and checklist**

Clarify that approval is not authorization, audit, tenancy isolation, or idempotency. Include a production checklist.

- [ ] **Step 7: Add official references and source note**

Reference official middleware, HITL, interrupts, and persistence pages; add the standard source note.

- [ ] **Step 8: Run GREEN verification**

Run: `pnpm test:docs`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/content/posts/langchain-middleware-hitl.md
git commit -m "docs: add LangChain middleware and HITL guide"
```

### Task 4: Verify and open AI PR

**Files:**
- Review: all files changed on `docs/yuque-agent-python-batch`.

**Interfaces:**
- Produces: draft PR targeting `main`.

- [ ] **Step 1: Run quality checks**

Run:

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

Search the two Markdown files for private IPv4 ranges, `api_key=`, `password=`, `secret`, `token=`, Yuque URLs, and provider response IDs. Expected: no literal secrets or private endpoints.

- [ ] **Step 3: Open draft PR**

Title: `docs: add LangChain agent engineering series`

Body must summarize the two articles, safety cleanup, source verification, and CI commands.
