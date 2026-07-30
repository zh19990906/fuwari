# Site Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all visible demo identity with Henson's identity, publish a project-focused About page, and add regression coverage for author and placeholder text.

**Architecture:** Keep `src/config.ts` as the single source of truth for site title, author name, bio, avatar, and profile links. Keep About content in `src/content/spec/about.md`. Add a filesystem-based Node test that validates the canonical values and scans published Markdown for obsolete author markers without adding a new runtime dependency.

**Tech Stack:** Astro 5, TypeScript, Markdown directives, Node.js built-in test runner, pnpm, GitHub Actions.

## Global Constraints

- Canonical author name is exactly `Henson`.
- Profile bio and site subtitle are exactly `无名小卒的博客记录`.
- Public GitHub profile is `https://github.com/zh19990906`.
- Project navigation contains only `gesture-boss-game`, `mcp-gateway`, and `fuwari`.
- The About page must attribute the blog theme to upstream Fuwari rather than claiming full originality.
- Do not add per-post `author` fields.
- Do not invent Twitter, Steam, email, or other social links.

---

### Task 1: Add personalization regression coverage

**Files:**
- Create: `tests/site-personalization.test.mjs`
- Modify: `package.json:7-20`
- Modify: `.github/workflows/build.yml:42-49`

**Interfaces:**
- Consumes: UTF-8 text files from `src/config.ts`, `src/content/spec/about.md`, and `src/content/posts/`.
- Produces: `pnpm test:site-personalization`, a zero-dependency Node test command used by CI.

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function listMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listMarkdownFiles(target)));
    if (entry.isFile() && /\.mdx?$/.test(entry.name)) files.push(target);
  }
  return files;
}

test("site identity uses Henson's profile", async () => {
  const config = await readFile(path.join(root, "src/config.ts"), "utf8");
  assert.match(config, /title: "Henson's Blog"/);
  assert.match(config, /subtitle: "无名小卒的博客记录"/);
  assert.match(config, /name: "Henson"/);
  assert.match(config, /bio: "无名小卒的博客记录"/);
  assert.match(config, /https:\/\/github\.com\/zh19990906/);
  assert.doesNotMatch(config, /Lorem Ipsum|saicaca\/fuwari|twitter\.com|store\.steampowered\.com/);
});

test("about page links only the selected representative projects", async () => {
  const about = await readFile(path.join(root, "src/content/spec/about.md"), "utf8");
  for (const repo of ["gesture-boss-game", "mcp-gateway", "fuwari"]) {
    assert.match(about, new RegExp(`::github\\{repo="zh19990906/${repo}"\\}`));
  }
  assert.doesNotMatch(about, /This is the demo site|Lorem Ipsum/);
  assert.match(about, /基于开源主题.*Fuwari/);
});

test("published posts contain no obsolete author identity", async () => {
  const files = await listMarkdownFiles(path.join(root, "src/content/posts"));
  for (const file of files) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /author:\s*["']?Lorem Ipsum/i, file);
    assert.doesNotMatch(content, /@Author\s*[:：]\s*(?!Henson\b)\S+/i, file);
  }
});
```

- [ ] **Step 2: Add the command and CI step**

Add to `package.json` scripts:

```json
"test:site-personalization": "node --test tests/site-personalization.test.mjs"
```

Add after documentation tests in `.github/workflows/build.yml`:

```yaml
- name: Run site personalization tests
  run: pnpm test:site-personalization
```

- [ ] **Step 3: Run the test to verify RED**

Run: `pnpm test:site-personalization`

Expected: FAIL because `src/config.ts` and `src/content/spec/about.md` still contain demo values.

- [ ] **Step 4: Commit the failing test**

```bash
git add tests/site-personalization.test.mjs package.json .github/workflows/build.yml
git commit -m "test: guard site identity and author values"
```

### Task 2: Replace site identity and social links

**Files:**
- Modify: `src/config.ts:12-68`

**Interfaces:**
- Consumes: existing `SiteConfig`, `NavBarConfig`, and `ProfileConfig` shapes.
- Produces: canonical visible author and site identity consumed by profile cards, license cards, navigation, and metadata.

- [ ] **Step 1: Replace the site and profile configuration**

Use these exact values:

```ts
export const siteConfig: SiteConfig = {
  title: "Henson's Blog",
  subtitle: "无名小卒的博客记录",
  lang: "zh_CN",
  // preserve all remaining existing settings
};
```

Replace the navigation GitHub entry with:

```ts
{
  name: "GitHub",
  url: "https://github.com/zh19990906",
  external: true,
}
```

Replace the profile block with:

```ts
export const profileConfig: ProfileConfig = {
  avatar: "https://avatars.githubusercontent.com/u/59323683?v=4",
  name: "Henson",
  bio: "无名小卒的博客记录",
  links: [
    {
      name: "GitHub",
      icon: "fa6-brands:github",
      url: "https://github.com/zh19990906",
    },
  ],
};
```

- [ ] **Step 2: Run the focused test**

Run: `pnpm test:site-personalization`

Expected: the identity test passes; the About page test still fails.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "chore: personalize site identity"
```

### Task 3: Replace the About page with project navigation

**Files:**
- Modify: `src/content/spec/about.md:1-11`

**Interfaces:**
- Consumes: existing `::github{repo="owner/name"}` Markdown directive.
- Produces: a personal introduction and three repository cards.

- [ ] **Step 1: Replace the About content**

```markdown
# 关于我

你好，我是 **Henson**。这里用于整理开发实践、部署经验和学习过程中的技术笔记。

目前主要关注 Python、AI / LLM、计算机视觉、容器化和工程部署。这个站点既是博客，也是便于持续维护和检索的个人文档库。

## 主要项目

### 手势 Boss 战

基于 PySide6 与 Ultralytics YOLO 的本地桌面应用，将摄像头或视频中的稳定手势映射为 Boss 战技能，支持单屏、双屏和展示模式。

::github{repo="zh19990906/gesture-boss-game"}

### MCP Gateway

将 MCP stdio 服务转换为 SSE 接口，并提供多个 MCP 服务的启动、停止与统一转发能力。

::github{repo="zh19990906/mcp-gateway"}

### Henson's Blog

当前博客与文档站项目，基于开源主题 [Fuwari](https://github.com/saicaca/fuwari) 进行二次开发，增加了中英文界面切换、文档系列和个人知识库内容。

::github{repo="zh19990906/fuwari"}

## 更多内容

更多代码与实验项目可以在 [GitHub 主页](https://github.com/zh19990906) 查看。
```

- [ ] **Step 2: Run focused tests**

Run: `pnpm test:site-personalization`

Expected: PASS.

- [ ] **Step 3: Run existing tests and checks**

Run:

```bash
pnpm test:ui-language
pnpm test:docs
pnpm astro check
pnpm astro build
pnpm biome check src tests package.json .github/workflows/build.yml
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/content/spec/about.md
git commit -m "content: replace demo about page"
```

### Task 4: Open and verify the personalization PR

**Files:**
- No repository file changes unless CI reports a specific defect.

**Interfaces:**
- Produces: draft PR from `chore/personalize-site` to `main`.

- [ ] **Step 1: Open a draft PR**

Title: `chore: personalize site identity and about page`

- [ ] **Step 2: Verify GitHub Actions**

Required successful jobs:

- Code quality
- Astro Check for Node.js 22
- Astro Check for Node.js 23
- Astro Build for Node.js 22
- Astro Build for Node.js 23

- [ ] **Step 3: Update the PR body with the exact verification results**

Do not mark the PR ready or merge it automatically.
