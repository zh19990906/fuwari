# Documentation Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight YOLO/Docker-style document series, ordered sections, document index/group pages, a contextual article sidebar, and group-scoped previous/next navigation without changing existing article URLs.

**Architecture:** Keep documents inside the existing Astro `posts` collection. Put deterministic validation/sorting/navigation in a pure TypeScript core, adapt Astro collection entries in a separate utility, and render the resulting model through new `/docs/` pages and an optional sidebar context passed through the existing layout.

**Tech Stack:** Astro 5 content collections and static routes, TypeScript 5.9, Astro components, Node built-in test runner, existing Tailwind classes, existing runtime bilingual UI.

## Global Constraints

- Existing document article URLs remain `/posts/<slug>/`.
- Normal posts require no frontmatter changes.
- Documentation sections are one level deep only.
- Group titles, descriptions, section labels and document titles are content and must not be runtime-translated.
- Documents remain in home/archive/category/tag/search behavior.
- Invalid document metadata and duplicate group slugs fail the build with an actionable slug.
- Do not add dependencies.

---

## File Structure

- `src/config/docs.ts`: document group metadata.
- `src/utils/docs-core.ts`: pure validation, ordering, grouping and navigation.
- `src/utils/docs-utils.ts`: Astro collection adapter.
- `src/pages/docs/index.astro`: document group index.
- `src/pages/docs/[group].astro`: one group landing page.
- `src/components/widget/DocsSidebar.astro`: contextual group navigation.
- Existing schema/config/layout/post files: minimal integration only.
- `tests/docs-core.test.mjs`: pure behavioral tests.

### Task 1: Documentation data model and pure core

**Files:**
- Create: `src/config/docs.ts`
- Create: `src/utils/docs-core.ts`
- Create: `tests/docs-core.test.mjs`
- Modify: `tests/tsconfig.json`
- Modify: `package.json`

**Interfaces:**
- Produces `DocGroupConfig`, `DocEntryLike`, `DocSection`, `DocNavigation`.
- Produces `validateDocsConfiguration(groups, entries)`, `sortDocEntries(entries)`, `groupDocsBySection(entries)`, and `getDocNavigation(entries, currentSlug)`.

- [ ] **Step 1: Write failing core tests**

Cover group ordering, exclusion of normal posts, section/order/title/slug sorting, missing group, unknown group, duplicate configured group slug and group-bounded previous/next.

```js
assert.deepEqual(sortDocEntries(entries).map((entry) => entry.slug), [
  "install",
  "train",
  "deploy",
]);
assert.throws(
  () => validateDocsConfiguration(groups, [{ slug: "bad", contentType: "docs" }]),
  /bad.*docGroup/,
);
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `pnpm test:docs`

Expected: compilation or module resolution failure because `docs-core.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure core**

Use these stable shapes:

```ts
export type DocGroupConfig = {
  slug: string;
  title: string;
  description?: string;
  order: number;
};

export type DocEntryLike = {
  slug: string;
  title: string;
  contentType?: "post" | "docs";
  docGroup?: string;
  docSection?: string;
  docOrder?: number;
};
```

Rules:
- validate duplicate group slugs first;
- validate every `contentType: "docs"` entry has a known group;
- filter normal posts from all document helpers;
- sort section names alphabetically, but render the empty section last;
- sort entries by `docOrder ?? Number.MAX_SAFE_INTEGER`, then title, then slug;
- previous is the prior item in ascending documentation order, next is the following item.

- [ ] **Step 4: Run core tests and verify GREEN**

Run: `pnpm test:docs`

Expected: all documentation core tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config/docs.ts src/utils/docs-core.ts tests/docs-core.test.mjs tests/tsconfig.json package.json
git commit -m "feat(docs): add documentation series core"
```

### Task 2: Astro schema, adapter and routes

**Files:**
- Modify: `src/content.config.ts`
- Create: `src/utils/docs-utils.ts`
- Modify: `src/utils/url-utils.ts`
- Create: `src/pages/docs/index.astro`
- Create: `src/pages/docs/[group].astro`

**Interfaces:**
- Consumes pure core from Task 1.
- Produces `getDocsGroupSummaries()`, `getDocsForGroup(groupSlug)`, `getDocsContextForEntry(entry)` and `getDocsGroupUrl(slug)`.

- [ ] **Step 1: Extend the Astro content schema**

Add:

```ts
contentType: z.enum(["post", "docs"]).optional().default("post"),
docGroup: z.string().optional(),
docSection: z.string().optional(),
docOrder: z.number().int().optional(),
```

- [ ] **Step 2: Implement the Astro adapter**

Load visible posts with the same production draft rule as `content-utils.ts`, map entries to `DocEntryLike`, run validation, and expose group summaries/sections/navigation while retaining the original Astro entry.

- [ ] **Step 3: Add stable docs URLs**

```ts
export function getDocsUrl(): string {
  return url("/docs/");
}

export function getDocsGroupUrl(group: string): string {
  return url(`/docs/${encodeURIComponent(group.trim())}/`);
}
```

- [ ] **Step 4: Create `/docs/`**

Render only configured groups with at least zero documents as Fuwari card links. Each card includes title, description and count. Use `MainGridLayout`; no client framework.

- [ ] **Step 5: Create `/docs/[group]/` static paths**

`getStaticPaths()` must use configured group slugs only. Render group title/description and one-level sections; links point to `getPostUrlBySlug(entry.slug)`.

- [ ] **Step 6: Run Astro validation**

Run: `pnpm check && pnpm build`

Expected: both succeed and generated output contains `/docs/index.html`, `/docs/yolo/index.html`, and `/docs/docker/index.html`.

- [ ] **Step 7: Commit**

```bash
git add src/content.config.ts src/utils/docs-utils.ts src/utils/url-utils.ts src/pages/docs
git commit -m "feat(docs): add documentation index and group pages"
```

### Task 3: Bilingual navigation entry

**Files:**
- Modify: `src/i18n/ui-language-labels.ts`
- Modify: `src/types/config.ts`
- Modify: `src/constants/link-presets.ts`
- Modify: `src/config.ts`

**Interfaces:**
- Produces `LinkPreset.Docs` and runtime labels `ui.docs`, `ui.documentation`, `ui.backToDocs`.

- [ ] **Step 1: Add runtime bilingual labels**

Chinese: `文档`, `文档系列`, `返回文档`.
English: `Docs`, `Documentation`, `Back to docs`.

- [ ] **Step 2: Add `LinkPreset.Docs`**

Use the Chinese label as the no-JavaScript default and `UiLabelKey.docs` as the runtime key. Point to `/docs/`.

- [ ] **Step 3: Add Docs to default navigation**

Place `LinkPreset.Docs` after Archive and before About.

- [ ] **Step 4: Run UI language and type checks**

Run: `pnpm test:ui-language && pnpm check`

Expected: both pass; runtime translation tables contain every `UiLabelKey`.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/ui-language-labels.ts src/types/config.ts src/constants/link-presets.ts src/config.ts
git commit -m "feat(docs): add bilingual documentation navigation"
```

### Task 4: Contextual document sidebar and group navigation

**Files:**
- Create: `src/components/widget/DocsSidebar.astro`
- Modify: `src/components/widget/SideBar.astro`
- Modify: `src/layouts/MainGridLayout.astro`
- Modify: `src/pages/posts/[...slug].astro`

**Interfaces:**
- Consumes `DocsArticleContext` from `docs-utils.ts`.
- `MainGridLayout` accepts optional `docsContext`.
- `SideBar` accepts optional `docsContext` and replaces Categories/Tags with DocsSidebar only for documents.

- [ ] **Step 1: Build the server-rendered document sidebar**

Render group title linking to `/docs/<group>/`, then section headings and ordered document links. Highlight `currentSlug` with primary background/text and `aria-current="page"`.

- [ ] **Step 2: Thread optional context through layout/sidebar**

Normal pages pass no context and remain unchanged. Document pages render Profile plus DocsSidebar in the sticky area.

- [ ] **Step 3: Override previous/next only for documents**

In the post route:

```ts
const docsContext = await getDocsContextForEntry(entry);
const nextSlug = docsContext?.navigation.previous?.slug ?? entry.data.nextSlug;
const prevSlug = docsContext?.navigation.next?.slug ?? entry.data.prevSlug;
```

Preserve the existing visual direction semantics: the left card points to the previous item in documentation order and the right card to the next item. Use explicit local names rather than mutating `entry.data`.

- [ ] **Step 4: Run all checks**

Run:

```bash
pnpm test:docs
pnpm test:ui-language
pnpm check
pnpm build
```

Expected: all pass; normal posts retain Categories/Tags and document posts render DocsSidebar.

- [ ] **Step 5: Commit**

```bash
git add src/components/widget/DocsSidebar.astro src/components/widget/SideBar.astro src/layouts/MainGridLayout.astro src/pages/posts/[...slug].astro
git commit -m "feat(docs): add contextual document navigation"
```

### Task 5: Author guidance and CI integration

**Files:**
- Modify: `.github/workflows/build.yml`
- Create: `docs/docs-series.md`

**Interfaces:**
- Documents how to add groups and frontmatter.
- Ensures documentation tests run before Astro Check in supported Node jobs.

- [ ] **Step 1: Add author documentation**

Include exact examples for YOLO and Docker group configuration and document frontmatter:

```yaml
contentType: docs
docGroup: yolo
docSection: 快速开始
docOrder: 10
```

Explain that the file remains under `src/content/posts` and its URL remains `/posts/<slug>/`.

- [ ] **Step 2: Add `pnpm test:docs` to Build and Check**

Run it beside the existing UI-language tests before `pnpm check`.

- [ ] **Step 3: Run final verification**

Verify the PR commit with:

```bash
pnpm test:docs
pnpm test:ui-language
pnpm check
pnpm build
biome ci ./src
```

Expected: all commands pass.

- [ ] **Step 4: Open draft PR**

Title: `feat: add lightweight documentation series`

Body must summarize stable URLs, new frontmatter, `/docs/` routes, contextual sidebar, group-scoped navigation, and CI results.
