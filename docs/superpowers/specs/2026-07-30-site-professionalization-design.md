# Site Professionalization and Activity Log Design

## Goal

Complete the first professionalization pass for Henson's Blog by adding consistent brand assets, stronger SEO and social metadata, a useful 404 page, and a real development activity log generated from the deployed `fuwari` repository history.

## Scope

This change includes:

- a simple Henson `H` monogram favicon and default sharing image;
- canonical, Open Graph, Twitter Card, article metadata, and JSON-LD output;
- base-path-aware RSS discovery, `robots.txt`, and a custom 404 page;
- a `/activity/` page backed by real Git history;
- a compact activity card below the profile card;
- runtime Chinese and English labels for all new interface text;
- regression tests and full-history checkout in workflows that build the site.

Custom domains, visitor analytics, comments, external-link monitoring, and activity from repositories other than `zh19990906/fuwari` are out of scope.

## Current Deployment Assumption

The canonical production origin remains:

```text
https://zh19990906.github.io/fuwari/
```

All generated URLs must respect Astro's configured `site` and `base`. The design must continue to work when a custom domain is introduced later by changing configuration rather than rewriting page components.

## Brand Assets

Create the following assets:

- `public/favicon.svg`: square `H` monogram using the site's primary hue and a light/dark-safe background;
- `public/apple-touch-icon.png`: 180 × 180 raster version of the same monogram;
- `public/og-default.png`: 1200 × 630 default sharing image containing `Henson's Blog` and `无名小卒的博客记录`.

`siteConfig.favicon` will explicitly use the new favicon instead of falling back to the upstream theme icons. The inactive demo banner path will be replaced with a neutral site-owned asset reference or an empty value so that no `demo-*` identity remains in configuration.

The first version intentionally uses a restrained monogram rather than a complex logo. It must remain readable at 16 × 16 pixels.

## SEO and Social Metadata

### Canonical URL

`src/layouts/Layout.astro` will derive one canonical URL per page from `Astro.site`, the configured base path, and the current pathname. Query strings and fragments are excluded.

Every page will emit:

```html
<link rel="canonical" href="..." />
<meta property="og:url" content="..." />
<meta name="twitter:url" content="..." />
```

### Sharing Image

`Layout.astro` will accept an optional social image. Article pages use their configured cover when present; all other pages use `/og-default.png`. Relative paths are converted to absolute URLs with the Astro site/base configuration.

Every page will emit `og:image`, `og:image:width`, `og:image:height`, and `twitter:image`.

### Article Metadata

For article pages, the layout receives published and updated dates and emits:

- `article:published_time`;
- `article:modified_time` when available;
- `article:author` as `Henson`;
- `og:type=article`.

Non-article pages use `og:type=website`.

### Structured Data

- Global pages emit a `WebSite` JSON-LD object with name, description, canonical URL, author, and GitHub profile.
- Article pages emit a `BlogPosting` JSON-LD object with headline, description, dates, author, image, and canonical URL.

JSON-LD values must be generated from the same normalized metadata used by regular meta tags so the two representations cannot drift.

### RSS and Robots

The existing RSS discovery URL is made base-path-aware. Add `src/pages/robots.txt.ts` with:

```text
User-agent: *
Allow: /
Sitemap: <absolute sitemap URL>
```

The generated sitemap URL must include `/fuwari/` under the current deployment configuration.

## Custom 404 Page

Add `src/pages/404.astro` using the site's normal layout and navigation. It contains:

- a clear `404` heading;
- Chinese-default copy explaining that the page does not exist;
- links back to the home page, documentation index, archive, and activity page;
- runtime English translations for visible interface copy.

The page must not depend on client-side JavaScript to remain useful.

## Activity Data Source

Activity is generated only from the Git history reachable from the checked-out `HEAD` of `zh19990906/fuwari`. It does not call the GitHub API and does not use fabricated counts.

The build adapter runs a machine-readable command equivalent to:

```bash
git log HEAD --since="180 days ago" --date=iso-strict \
  --pretty=format:'%H%x1f%P%x1f%cI%x1f%s%x1f%b%x1e'
```

Workflows that render or validate Astro pages must use `actions/checkout` with `fetch-depth: 0`. This includes the Pages deployment workflow and the Node 22/23 build-and-check workflow.

When `.git` is unavailable, Git is not installed, or history cannot be read, the adapter returns an explicit unavailable state. The site still builds and displays `暂无活动数据 / Activity data unavailable`; it must never invent zero-history statistics while claiming they are complete.

## Activity Core Model

Create pure activity logic separate from Git process execution.

```ts
type ActivityKind = "content" | "feature" | "fix" | "docs" | "test" | "chore" | "release" | "other";

interface ActivityCommit {
  hash: string;
  parents: string[];
  committedAt: string;
  subject: string;
  body: string;
  displayTitle: string;
  kind: ActivityKind;
  isMerge: boolean;
  dateKey: string;
}

interface ActivitySummary {
  available: boolean;
  generatedAt: string;
  timezone: "Asia/Shanghai";
  todayCommits: number;
  todayReleases: number;
  last7DaysCommits: number;
  lastUpdatedAt?: string;
  heatmap: Array<{ date: string; count: number }>;
  commits: ActivityCommit[];
}
```

Rules:

- Dates are grouped in `Asia/Shanghai`, regardless of the build runner timezone.
- `todayCommits` counts all reachable commits whose commit date falls on the current Shanghai calendar day.
- `todayReleases` counts merge commits on the current Shanghai day.
- `last7DaysCommits` covers today and the preceding six Shanghai calendar days.
- The heatmap contains every calendar day in the most recent 90-day window, including zero-count days.
- The detail list includes at most 200 commits from the last 180 days, newest first.
- Merge commits use the first meaningful non-empty body line as the display title when the subject is the generic `Merge pull request #...`; otherwise they use the subject.
- Commit prefixes classify entries: `content`, `feat`, `fix`, `docs`, `test`, `chore`, and common equivalents. Merge commits are classified as `release`.
- Chore, test, and formatting commits remain visible but use a visually muted treatment. Authentic history is preferred over hiding inconvenient records.

## Activity Page

Add `/activity/` with three sections.

### Summary

Display:

- today's commits;
- today's releases;
- commits in the last seven days;
- the latest update time.

The copy must explain that counts come from the deployed `fuwari` repository's reachable Git history.

### Ninety-Day Heatmap

Render a compact, accessible 90-day grid:

- one cell per calendar day;
- five intensity levels derived from daily count;
- zero-count days remain visible;
- each cell has an accessible label containing the date and commit count;
- no external charting dependency is added.

### Timeline

Group the latest commits by Shanghai date. Each row includes time, category, cleaned title, and a short hash linked to the corresponding GitHub commit.

The page displays at most 200 entries. It does not show full commit bodies, branch names, or contributor email addresses.

## Sidebar Activity Card

Add a compact `ActivityCard.astro` directly below `Profile.astro`, before the sticky documentation/category area. It is shown on blog and documentation pages.

The card contains:

- today's commit count;
- seven-day commit count;
- today's release count;
- latest cleaned activity title;
- a link to `/activity/`.

When data is unavailable, the card shows a neutral unavailable message and still links to the activity page.

## Navigation and About Link

Add a top navigation entry for `/activity/` between Docs and About.

Add a small activity link to the About page after the project cards. Do not embed the full timeline in About.

New runtime UI labels include at least:

| Key | Chinese | English |
|---|---|---|
| activity | 动态 | Activity |
| developmentActivity | 开发动态 | Development activity |
| todayCommits | 今日提交 | Commits today |
| todayReleases | 今日上线 | Releases today |
| last7Days | 最近 7 天 | Last 7 days |
| lastUpdated | 最后更新 | Last updated |
| recentActivity | 最近记录 | Recent activity |
| viewAllActivity | 查看完整记录 | View all activity |
| activityUnavailable | 暂无活动数据 | Activity data unavailable |
| backHome | 返回首页 | Back home |

Commit messages and repository content are not translated.

## File Responsibilities

- `src/utils/activity-core.ts`: parse records, normalize Shanghai dates, classify commits, clean merge titles, build summary and heatmap.
- `src/utils/activity-utils.ts`: execute Git, cache one build-time result, convert failures into the unavailable state.
- `src/components/widget/ActivityCard.astro`: compact sidebar rendering.
- `src/pages/activity/index.astro`: summary, heatmap, and timeline page.
- `src/pages/404.astro`: branded not-found page.
- `src/pages/robots.txt.ts`: base-aware robots output.
- `src/layouts/Layout.astro`: canonical, social metadata, article metadata, JSON-LD, favicon, and RSS discovery.
- Existing post layouts/routes: pass article dates and image metadata into `Layout.astro`.
- Existing runtime language dictionaries: add new interface keys only.
- `.github/workflows/build.yml` and `.github/workflows/deploy.yml`: full-history checkout.
- `tests/activity-core.test.mjs`: pure activity behavior.
- `tests/site-professionalization.test.mjs`: required routes, assets, metadata, and workflow regression checks.

## Testing

### Activity Core Tests

Tests must cover:

- record parsing with separators and multiline bodies;
- generic merge title cleanup;
- non-generic merge title preservation;
- commit classification;
- Shanghai date grouping across a UTC day boundary;
- today, release, and seven-day counts;
- a complete 90-day heatmap including zero days;
- newest-first ordering and 200-entry cap;
- unavailable fallback when the adapter cannot read Git.

### Professionalization Regression Tests

Text-level tests verify:

- favicon, Apple icon, and default OG image exist;
- `Layout.astro` emits canonical, OG image, Twitter image, JSON-LD, and base-aware RSS tags;
- `robots.txt.ts`, `/activity/`, and `/404` routes exist;
- the sidebar includes `ActivityCard` after `Profile`;
- both build workflows request full Git history;
- no active site configuration contains `demo-avatar`, `demo-banner`, `Lorem Ipsum`, or the upstream repository as the personal GitHub link.

### Required CI

The final branch must pass:

- activity tests;
- existing documentation and content-safety tests;
- existing site-personalization tests;
- existing UI-language tests;
- Biome;
- Astro Check on Node.js 22 and 23;
- production builds on Node.js 22 and 23.

## Error Handling and Privacy

- Git failures degrade to an unavailable activity state rather than failing the entire site build.
- No Git author email is parsed or rendered.
- Commit bodies are used only to clean generic merge titles and are never displayed in full.
- The feature does not load third-party analytics or runtime GitHub scripts.
- All activity data is rendered statically during the site build.

## Out of Scope

- custom-domain DNS or GitHub Pages domain configuration;
- Cloudflare, Umami, Plausible, or other visitor analytics;
- activity from other public repositories;
- live GitHub API requests in the browser;
- comments, likes, or user accounts;
- automatic external-link checking;
- content freshness warnings and broader documentation health checks.
