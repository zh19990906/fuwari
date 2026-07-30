# Lightweight Documentation Series Design

**Date:** 2026-07-30

## Goal

Add a lightweight documentation area to the existing Fuwari blog so related notes such as YOLO and Docker can be organized into ordered series without replacing the blog system.

## Selected Approach

Use the existing `posts` Astro content collection and Markdown files, plus a centralized document-group configuration.

This approach was selected over:

1. repeating group metadata in every Markdown file, which is easy to make inconsistent;
2. creating a separate Astro `docs` collection, which would require a larger migration and duplicate more routing/layout code.

Existing article URLs remain stable in this release.

## Content Model

The posts schema gains four fields:

```yaml
contentType: docs
docGroup: yolo
docSection: 快速开始
docOrder: 10
```

```ts
contentType: "post" | "docs" // default: "post"
docGroup?: string
docSection?: string
docOrder?: number
```

Rules:

- Normal posts require no changes.
- A document uses `contentType: docs` and must provide a configured `docGroup`.
- `docSection` is one level only and defaults to an unsectioned group shown after named sections.
- `docOrder` sorts ascending and defaults to a large value.
- Equal order values are resolved by title, then slug, for deterministic output.
- Document articles keep `/posts/<slug>/` URLs in this phase.

## Group Configuration

Create `src/config/docs.ts`:

```ts
export const docsGroups = [
  {
    slug: "yolo",
    title: "YOLO",
    description: "目标检测、训练与部署笔记",
    order: 10,
  },
  {
    slug: "docker",
    title: "Docker",
    description: "容器、镜像与 Compose 使用笔记",
    order: 20,
  },
];
```

Each group contains:

- `slug`: stable identifier used by routes and frontmatter;
- `title`: display name;
- `description`: optional index summary;
- `order`: group display order.

Duplicate group slugs, missing document groups and unknown document groups fail the build with an error containing the affected slug. Invalid documents are never silently omitted.

## Routes

### `/docs/`

Shows configured groups as cards with title, description, document count and group link.

### `/docs/[group]/`

Shows the group title and description, then documents grouped by `docSection` and ordered by `docOrder`.

Document links point to their existing `/posts/<slug>/` pages. Only configured groups generate static paths, so unknown groups resolve to the site's normal 404 page.

## Document Article Experience

For `contentType: docs` articles:

- the existing article body, metadata and table of contents remain unchanged;
- the sticky sidebar displays the active group's sections and documents;
- the current document is highlighted;
- previous/next navigation is calculated only within the current group;
- document titles, section labels and article content are treated as content and are not translated by the UI-language switch.

Normal posts keep the existing category/tag sidebar and global chronological previous/next behavior.

## Blog and Search Behavior

In the first release:

- documents remain visible in the home feed and archive;
- documents remain searchable through Pagefind;
- document categories and tags continue to work;
- `/docs/` is an additional structured view, not a replacement feed.

A future setting may optionally hide documents from the blog feed.

## Components

### `src/config/docs.ts`

Owns group display metadata.

### `src/utils/docs-core.ts`

Pure, testable functions for validation, sorting, section grouping and previous/next selection.

### `src/utils/docs-utils.ts`

Loads Astro content entries and adapts them to the pure core.

### `src/pages/docs/index.astro`

Renders the group index.

### `src/pages/docs/[group].astro`

Renders one ordered group page.

### `src/components/widget/DocsSidebar.astro`

Renders contextual navigation for document articles.

### Existing article and layout components

The post route passes optional document context to the layout/sidebar and passes group-scoped previous/next data to the existing navigation component. Normal posts follow the unchanged path.

## Navigation and Bilingual UI

Add a built-in `DocsLink` preset pointing to `/docs/` and include it in the default navbar configuration.

Page-UI labels use the existing runtime bilingual mechanism:

- Chinese: `文档`, `文档系列`, `返回文档`;
- English: `Docs`, `Documentation`, `Back to docs`.

Group titles, descriptions, section labels and document titles are user content and remain unchanged when the UI language switches.

## Testing

Add focused tests for the pure documentation core:

- normal posts are excluded;
- configured groups follow group order;
- documents follow section/order/title/slug ordering;
- missing and unknown groups fail validation;
- duplicate group slugs fail validation;
- previous/next navigation never crosses a group boundary.

CI must pass:

- documentation core tests;
- existing UI-language tests;
- Biome;
- Astro Check on supported Node versions;
- production builds on supported Node versions.

## Out of Scope

- nested sections deeper than one level;
- versioned documentation;
- AI article translation;
- moving articles to `/docs/<group>/<slug>/`;
- a separate `docs` content collection;
- drag-and-drop administration;
- automatic icons or cover images.

## Success Criteria

1. YOLO and Docker can be defined as document groups.
2. Markdown posts can opt into a group, section and order.
3. `/docs/` and `/docs/yolo/` render correctly.
4. Document pages show an ordered group sidebar.
5. Previous/next navigation stays inside the document group.
6. Existing normal posts, URLs, categories, tags, search and bilingual UI remain compatible.
7. All tests, checks and production builds pass.
