# Lightweight Documentation Series Design

**Date:** 2026-07-30

## Goal

Add a lightweight documentation area to the existing Fuwari blog so related technical notes such as YOLO and Docker can be organized as ordered document series without turning the site into a separate documentation application.

## Approved Direction

The existing blog remains the primary content system. Documentation entries continue to use the current `posts` Astro content collection and Markdown format, but gain optional document metadata. The site adds document group pages, section ordering, a contextual document sidebar, and group-scoped previous/next navigation.

## Approaches Considered

### 1. Frontmatter-only document groups

Every document repeats its group title, description, icon and ordering metadata.

- Advantage: no configuration file.
- Disadvantage: repeated metadata can become inconsistent.

### 2. Shared posts collection plus centralized group configuration — selected

Documents remain in `src/content/posts`, while group-level metadata lives in a small TypeScript configuration file.

- Advantage: minimal migration, stable existing URLs, consistent group metadata.
- Advantage: follows Fuwari's existing configuration style.
- Disadvantage: adding a new group requires editing one config file.

### 3. Separate Astro `docs` collection

Move documentation into `src/content/docs` and create fully separate routes.

- Advantage: clean long-term separation and `/docs/group/article/` URLs.
- Disadvantage: larger migration, duplicated layouts and higher maintenance cost.

The second approach is selected for the first release. A separate collection can be introduced later if the documentation area becomes the site's primary content.

## Content Model

The existing posts schema gains these optional fields:

```yaml
contentType: docs
 docGroup: yolo
 docSection: 快速开始
 docOrder: 10
```

The actual field names are:

```ts
contentType: "post" | "docs" // default: "post"
docGroup?: string             // stable group slug, such as "yolo"
docSection?: string           // one-level section label
docOrder?: number             // ascending order within the group
```

Rules:

- Normal posts require no changes.
- A document must use `contentType: docs` and a configured `docGroup`.
- `docSection` defaults to an unsectioned group rendered after named sections.
- `docOrder` defaults to a large value so explicitly ordered documents appear first.
- Equal orders are resolved by title for deterministic output.
- Documents keep their existing `/posts/<slug>/` article URL in this phase.

## Group Configuration

Create `src/config/docs.ts` containing ordered group definitions:

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

Each group has:

- `slug`: stable identifier used in URLs and frontmatter.
- `title`: display name.
- `description`: optional summary on the docs index.
- `order`: group display order.

Unknown `docGroup` values are excluded from production document navigation and reported during validation.

## Routes and Pages

### `/docs/`

A document index showing configured groups as cards with:

- group title;
- description;
- document count;
- link to the group page.

### `/docs/[group]/`

A group landing page showing:

- group title and description;
- documents grouped by one-level `docSection`;
- documents ordered by `docOrder`;
- direct links to existing `/posts/<slug>/` article pages.

Unknown groups return a generated 404 rather than an empty page.

## Document Article Experience

When an article has `contentType: docs`:

- the normal article body and metadata remain unchanged;
- the sticky sidebar shows the active document group's section list;
- the current document is highlighted;
- previous and next links are calculated only within the current document group;
- article titles, section names and document content are not translated by the UI language switch.

Normal blog posts continue using the current category/tag sidebar and global chronological previous/next behavior.

## Blog and Search Behavior

For the first release:

- documents remain visible in the home feed and archive so existing discovery behavior is not silently changed;
- documents remain included in Pagefind search;
- categories and tags continue to work on documents;
- `/docs/` provides an additional structured view rather than replacing existing blog views.

A later option may add `showDocsInBlogFeed` if separation becomes desirable.

## Components and Boundaries

### `src/config/docs.ts`

Owns group-level display metadata only.

### `src/utils/docs-utils.ts`

Owns document collection, validation, ordering and grouping. It exposes functions such as:

- `getDocsGroups()`;
- `getDocsForGroup(groupSlug)`;
- `getDocsNavigation(groupSlug, currentSlug)`;
- `groupDocsBySection(docs)`.

This isolates document rules from page templates.

### `src/pages/docs/index.astro`

Renders the document group index.

### `src/pages/docs/[group].astro`

Renders a single group's ordered document list.

### `src/components/widget/DocsSidebar.astro`

Renders the current group navigation on document article pages.

### Existing article route

`src/pages/posts/[...slug].astro` detects document metadata and passes the current group/navigation context into the layout. It does not translate or rewrite article content.

## Navigation

Add a built-in `Docs` navigation preset with Chinese and English UI labels:

- Chinese: `文档`
- English: `Docs`

The site owner may include it in `navBarConfig.links`. Existing navigation configuration remains compatible.

## Validation and Error Handling

Build-time validation must detect:

- `contentType: docs` without `docGroup`;
- an unknown `docGroup` not present in `docsGroups`;
- duplicate group slugs;
- duplicate document order values are allowed and resolved by title.

Development builds should emit actionable errors containing the document slug. Production must not silently generate broken group pages.

## Testing

Add focused tests for pure document utilities:

- normal posts are excluded from document group helpers;
- groups follow configured order;
- documents follow section and `docOrder` ordering;
- missing and unknown groups fail validation;
- previous/next navigation does not cross group boundaries;
- equal order values resolve deterministically.

Run the existing UI-language tests, Astro Check, Biome and production build in CI.

## Out of Scope for This Release

- nested sections deeper than one level;
- versioned documentation;
- automatic AI translation;
- moving articles to `/docs/<group>/<slug>/`;
- separate `docs` content collection;
- drag-and-drop content management;
- automatically generated group icons or cover images.

## Success Criteria

The feature is complete when:

1. YOLO and Docker can be defined as document groups.
2. Markdown posts can opt into a group, section and order.
3. `/docs/` and `/docs/yolo/` style pages render correctly.
4. Document article pages show an ordered group sidebar.
5. Previous/next navigation stays inside the document group.
6. Existing normal posts, categories, tags, URLs and bilingual UI remain compatible.
7. Unit tests, Biome, Astro Check and production build pass.
