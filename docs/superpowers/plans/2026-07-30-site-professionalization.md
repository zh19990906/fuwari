# Site Professionalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add brand assets, complete SEO metadata, provide a custom 404 page, and expose a real Git-history activity page and sidebar card while fixing the documentation-series grid alignment.

**Architecture:** Keep Git parsing and aggregation in a pure TypeScript core module, with a thin build-time adapter responsible only for running `git log` and returning an unavailable fallback. Astro pages and components consume one cached `ActivitySummary`; SEO metadata is normalized in the root layout so canonical, social tags, and JSON-LD share the same values.

**Tech Stack:** Astro 5, TypeScript, Node.js built-in test runner, Git, Tailwind CSS, pnpm, GitHub Actions.

## Global Constraints

- Activity data comes only from Git history reachable from the checked-out `HEAD` of `zh19990906/fuwari`.
- Dates and counters use `Asia/Shanghai`.
- The detail view covers at most 200 commits from the latest 180 days; the heatmap covers exactly 90 calendar days.
- No GitHub API, analytics service, chart dependency, fabricated counts, contributor email, branch name, or full commit body is exposed.
- Git failure must not fail the Astro build; render `暂无活动数据 / Activity data unavailable` instead.
- All URLs must remain compatible with `site: https://zh19990906.github.io` and `base: /fuwari`.
- New interface copy must support the existing runtime Chinese/English switch; commit messages remain untranslated.
- The documentation index remains one column on mobile and two columns from `md`; cards in the same row stretch to equal height and the count badge must align independently of description wrapping.
- No new runtime dependency is added.

---

### Task 1: Documentation grid regression

**Files:**
- Modify: `src/pages/docs/index.astro`
- Create: `tests/site-professionalization.test.mjs`

**Interfaces:**
- Consumes: `getDocsGroupSummaries()` output.
- Produces: equal-height document cards whose title/count row remains aligned even when descriptions wrap.

- [ ] **Step 1: Write the failing structural test**

Assert that the docs index uses `items-stretch`, each anchor uses `h-full`, and its inner wrapper uses a two-row layout with the title/count in the first row and description in the second row.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/site-professionalization.test.mjs`
Expected: FAIL because the current cards are plain block links with a single wrapping flex row.

- [ ] **Step 3: Implement the minimal layout change**

Use an equal-height grid and card markup equivalent to:

```astro
<div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
  <a class="btn-card ... h-full grid grid-rows-[auto_1fr]">
    <div class="flex items-start justify-between gap-4">...</div>
    <p class="mt-2 ...">...</p>
  </a>
</div>
```

- [ ] **Step 4: Re-run the structural test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/docs/index.astro tests/site-professionalization.test.mjs
git commit -m "fix: align documentation series cards"
```

### Task 2: Activity core with TDD

**Files:**
- Create: `src/utils/activity-core.ts`
- Create: `tests/activity-core.test.mjs`
- Modify: `tests/tsconfig.json`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `parseGitLog(raw: string): ActivityCommit[]`
  - `cleanActivityTitle(subject: string, body: string): string`
  - `classifyActivity(subject: string, isMerge: boolean): ActivityKind`
  - `buildActivitySummary(commits: ActivityCommit[], now: Date): ActivitySummary`
  - exported `ActivityKind`, `ActivityCommit`, `ActivitySummary` types.

- [ ] **Step 1: Write failing parser and title tests**

Use records separated by `\x1e` and fields by `\x1f`; include a multiline merge body and assert generic `Merge pull request #6 ...` uses the first meaningful body line.

- [ ] **Step 2: Verify RED**

Run: `pnpm test:activity`
Expected: FAIL because `activity-core.ts` does not exist.

- [ ] **Step 3: Implement parser, merge detection, title cleanup, and prefix classification**

Recognize `content`, `feat`, `fix`, `docs`, `test`, `chore`, `release`, and fallback `other`; a commit with more than one parent is a merge and therefore `release`.

- [ ] **Step 4: Add failing Shanghai boundary, counters, heatmap, ordering, and cap tests**

Use a fixed `now` and commits around `16:00:00Z` to prove Shanghai calendar grouping. Assert 90 heatmap entries, today plus preceding six days, newest-first ordering, and a 200-entry cap.

- [ ] **Step 5: Implement summary generation**

Use `Intl.DateTimeFormat` with `timeZone: "Asia/Shanghai"` for date/time keys. Fill zero-count heatmap days and set `available: true` when history exists.

- [ ] **Step 6: Run all activity tests**

Expected: PASS with no warnings.

- [ ] **Step 7: Commit**

```bash
git add src/utils/activity-core.ts tests/activity-core.test.mjs tests/tsconfig.json package.json
git commit -m "feat: add git activity core"
```

### Task 3: Git adapter and unavailable fallback

**Files:**
- Create: `src/utils/activity-utils.ts`
- Modify: `tests/activity-core.test.mjs`

**Interfaces:**
- Consumes: `parseGitLog()` and `buildActivitySummary()`.
- Produces: `getActivitySummary(): Promise<ActivitySummary>` with one cached build-time result.

- [ ] **Step 1: Add a failing adapter fallback test**

Expose a small injectable `loadActivitySummary(runGit, now)` helper and assert a throwing runner returns `available: false`, empty arrays, zero counters, `timezone: "Asia/Shanghai"`, and a generated timestamp.

- [ ] **Step 2: Verify RED**

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement the adapter**

Run:

```bash
git log HEAD --since=180.days --date=iso-strict --pretty=format:%H%x1f%P%x1f%cI%x1f%s%x1f%b%x1e
```

Use `execFile` rather than a shell, set a finite buffer, and catch all failures into the unavailable summary.

- [ ] **Step 4: Re-run activity tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/activity-utils.ts tests/activity-core.test.mjs
git commit -m "feat: load build activity from git history"
```

### Task 4: Activity UI and navigation

**Files:**
- Create: `src/components/widget/ActivityCard.astro`
- Create: `src/pages/activity/index.astro`
- Modify: `src/components/widget/SideBar.astro`
- Modify: `src/i18n/ui-language-labels.ts`
- Modify: `src/types/config.ts`
- Modify: `src/constants/link-presets.ts`
- Modify: `src/config.ts`
- Modify: `src/content/spec/about.md`
- Modify: `tests/ui-language.test.mjs`
- Modify: `tests/site-professionalization.test.mjs`

**Interfaces:**
- Consumes: `getActivitySummary()`.
- Produces: `/activity/`, sidebar summary card, nav preset `Activity`, and runtime labels.

- [ ] **Step 1: Add failing label and route structure tests**

Assert Chinese/English labels for activity, counters, latest update, unavailable copy, heatmap, recent records, and 404 navigation. Assert the activity page/card files exist and use `getActivitySummary()`.

- [ ] **Step 2: Verify RED**

Run: `pnpm test:ui-language && node --test tests/site-professionalization.test.mjs`
Expected: FAIL for missing labels and files.

- [ ] **Step 3: Add navigation and labels**

Add `LinkPreset.Activity`, map it to `/activity/`, insert it between Docs and About, and extend both runtime label dictionaries without translating commit titles.

- [ ] **Step 4: Implement the sidebar card**

Place `ActivityCard` immediately below `Profile`; render three counters, latest title, and `/activity/` link. Render unavailable copy when needed.

- [ ] **Step 5: Implement `/activity/`**

Render summary counters, a 90-day accessible CSS grid, and commits grouped by Shanghai date. Link each short hash to `https://github.com/zh19990906/fuwari/commit/<hash>`.

- [ ] **Step 6: Add the About link and run focused tests**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/widget/ActivityCard.astro src/pages/activity/index.astro src/components/widget/SideBar.astro src/i18n/ui-language-labels.ts src/types/config.ts src/constants/link-presets.ts src/config.ts src/content/spec/about.md tests/ui-language.test.mjs tests/site-professionalization.test.mjs
git commit -m "feat: add development activity pages"
```

### Task 5: Brand assets and SEO metadata

**Files:**
- Create: `public/favicon.svg`
- Create: `public/apple-touch-icon.png`
- Create: `public/og-default.png`
- Modify: `src/config.ts`
- Modify: `src/layouts/Layout.astro`
- Modify: `src/layouts/MainGridLayout.astro`
- Modify: `src/pages/posts/[...slug].astro`
- Modify: `tests/site-professionalization.test.mjs`

**Interfaces:**
- `Layout.astro` accepts `socialImage?: string`, `published?: Date`, and `updated?: Date` in addition to existing props.
- `MainGridLayout.astro` passes the same metadata through.

- [ ] **Step 1: Add failing asset and metadata tests**

Assert all three assets exist; config references `/favicon.svg`; root layout emits canonical, `og:image`, dimensions, `twitter:image`, article times, and one JSON-LD script derived from normalized values.

- [ ] **Step 2: Verify RED**

Expected: FAIL for missing files and metadata.

- [ ] **Step 3: Create restrained brand assets**

Create an SVG `H` monogram and rasterize matching 180×180 and 1200×630 PNG assets. Keep the share image text exactly `Henson's Blog` and `无名小卒的博客记录`.

- [ ] **Step 4: Normalize canonical and social URLs in `Layout.astro`**

Strip query/hash from the current URL, preserve Astro base, resolve local social images to absolute URLs, and use the same normalized object for meta tags and JSON-LD.

- [ ] **Step 5: Pass article metadata from the post route**

Pass cover, published, and updated values through `MainGridLayout`; remove the duplicate post-local JSON-LD so there is one source of truth.

- [ ] **Step 6: Re-run focused tests and Astro Check**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/favicon.svg public/apple-touch-icon.png public/og-default.png src/config.ts src/layouts/Layout.astro src/layouts/MainGridLayout.astro src/pages/posts/[...slug].astro tests/site-professionalization.test.mjs
git commit -m "feat: add brand assets and seo metadata"
```

### Task 6: Robots, 404, and full-history workflows

**Files:**
- Create: `src/pages/robots.txt.ts`
- Create: `src/pages/404.astro`
- Modify: `.github/workflows/build.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `tests/site-professionalization.test.mjs`

**Interfaces:**
- Produces a base-aware `/robots.txt`, a no-JavaScript-useful 404 page, and complete Git history in validation/deploy builds.

- [ ] **Step 1: Add failing route/workflow tests**

Assert robots uses `Astro.site`/base-derived sitemap, 404 links to home/docs/archive/activity, and both workflows set `fetch-depth: 0` on checkout.

- [ ] **Step 2: Verify RED**

Expected: FAIL.

- [ ] **Step 3: Implement routes**

Use normal layouts and runtime language labels for visible 404 copy. Robots must return `text/plain; charset=utf-8`.

- [ ] **Step 4: Update both workflows**

Add:

```yaml
with:
  fetch-depth: 0
```

under each checkout used before an Astro render or validation.

- [ ] **Step 5: Re-run focused tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/robots.txt.ts src/pages/404.astro .github/workflows/build.yml .github/workflows/deploy.yml tests/site-professionalization.test.mjs
git commit -m "feat: complete site discovery and activity builds"
```

### Task 7: Full verification and draft PR

**Files:**
- Modify only files required by verification findings.

- [ ] **Step 1: Run the complete test suite**

```bash
pnpm test:ui-language
pnpm test:docs
pnpm test:activity
node --test tests/site-professionalization.test.mjs
pnpm astro check
pnpm astro build
pnpm exec biome check .
```

Expected: all commands exit 0.

- [ ] **Step 2: Inspect generated output**

Confirm `dist/activity/index.html`, `dist/404.html`, `dist/robots.txt`, sitemap and RSS links use `/fuwari/`, and activity HTML contains real reachable commit hashes when `.git` is available.

- [ ] **Step 3: Open a draft pull request**

Use title `feat: professionalize site and add activity log`. Include scope, data-source guarantees, grid fix, SEO changes, and Node 22/23 verification.

- [ ] **Step 4: Verify GitHub Actions**

Require Code quality and Build and Check to pass on the final head SHA before reporting completion.
