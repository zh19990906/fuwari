# Runtime UI Bilingual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a URL-preserving Chinese/English runtime switch for Fuwari page UI while leaving all post content unchanged.

**Architecture:** Build pages with Simplified Chinese as the no-JavaScript fallback, mark translatable UI nodes with stable i18n keys, and apply the selected language through one browser runtime. A compact navbar switch persists `zh_CN` or `en` in `localStorage`, updates `<html lang>`, page titles and accessibility attributes, and reapplies after Swup content replacement.

**Tech Stack:** Astro 5, Svelte 5, TypeScript, existing Fuwari translation tables, Node.js built-in test runner.

## Global Constraints

- Page URLs must not change and no `/zh/` or `/en/` routes may be added.
- Default language is `zh_CN`.
- Only page UI is translated; post titles, bodies, descriptions, categories, tags and slugs remain unchanged.
- The storage key is exactly `fuwari-ui-language`.
- Supported runtime UI languages are exactly `zh_CN` and `en`.
- Invalid or unavailable storage falls back to `zh_CN`.
- The site remains fully usable in Chinese when JavaScript is unavailable.
- No new UI framework or runtime translation dependency is added.

---

### Task 1: Runtime language core and tests

**Files:**
- Create: `src/i18n/ui-language-core.ts`
- Create: `src/i18n/ui-language.ts`
- Create: `tests/ui-language.test.ts`
- Create: `tests/tsconfig.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `UiLanguage`, `DEFAULT_UI_LANGUAGE`, `UI_LANGUAGE_STORAGE_KEY`, `normalizeUiLanguage(value)`, `readStoredUiLanguage(storage)`, `writeStoredUiLanguage(storage, language)`, `applyTranslationToRoot(root, language, translations)`, `initializeUiLanguage()` and `selectUiLanguage(language)`.
- Consumes: Existing `en` and `zh_CN` translation objects and `I18nKey` values.

- [ ] **Step 1: Write failing tests for language normalization and storage fallback**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_UI_LANGUAGE,
  normalizeUiLanguage,
  readStoredUiLanguage,
} from "../src/i18n/ui-language-core.js";

test("normalizes only the two supported UI languages", () => {
  assert.equal(normalizeUiLanguage("zh_CN"), "zh_CN");
  assert.equal(normalizeUiLanguage("en"), "en");
  assert.equal(normalizeUiLanguage("ja"), DEFAULT_UI_LANGUAGE);
  assert.equal(normalizeUiLanguage(null), DEFAULT_UI_LANGUAGE);
});

test("falls back to Chinese when storage throws", () => {
  const storage = { getItem() { throw new Error("blocked"); }, setItem() {} };
  assert.equal(readStoredUiLanguage(storage), "zh_CN");
});
```

- [ ] **Step 2: Run the test compiler and verify RED**

Run: `tsc -p tests/tsconfig.json && node --test .test-dist/tests/ui-language.test.js`

Expected: FAIL because `src/i18n/ui-language-core.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure core**

Implement exact constants and pure helpers, using structural `StorageLike`, `LocalizableRoot` and `TranslationTable` interfaces so tests need no browser DOM library at runtime.

- [ ] **Step 4: Add failing tests for text, attribute and switch-state updates**

Use small fake elements implementing `dataset`, `textContent`, `setAttribute()` and `querySelectorAll()`; assert updates for `data-i18n-key`, `data-i18n-aria-label`, `data-i18n-placeholder`, `data-i18n-title` and `data-ui-language-option`.

- [ ] **Step 5: Run tests and verify RED for DOM application**

Run: `tsc -p tests/tsconfig.json && node --test .test-dist/tests/ui-language.test.js`

Expected: FAIL because translation application is not implemented.

- [ ] **Step 6: Implement the browser runtime**

`src/i18n/ui-language.ts` must import both translation tables, update `<html data-ui-language>` and `<html lang>`, persist safely, update marked nodes, set the active switch button, update keyed page titles, install one delegated click handler, install one `MutationObserver`, and reapply on `swup:contentReplaced`, `swup:pageView`, `astro:page-load` and the custom `fuwari:language-change` event.

- [ ] **Step 7: Run unit tests and type compilation**

Run: `pnpm test:ui-language`

Expected: all tests pass with zero failures.

- [ ] **Step 8: Commit**

```bash
git add package.json src/i18n/ui-language-core.ts src/i18n/ui-language.ts tests

git commit -m "feat(i18n): add runtime UI language core"
```

### Task 2: Initial language, translations and switch component

**Files:**
- Create: `src/components/misc/LocalizedText.astro`
- Create: `src/components/LanguageSwitch.astro`
- Modify: `src/config.ts`
- Modify: `src/i18n/i18nKey.ts`
- Modify: `src/i18n/languages/en.ts`
- Modify: `src/i18n/languages/zh_CN.ts`
- Modify: `src/layouts/Layout.astro`

**Interfaces:**
- Consumes: Runtime functions from Task 1.
- Produces: `<LocalizedText key={I18nKey.*} />` and navbar-ready `<LanguageSwitch />`.

- [ ] **Step 1: Add missing control translation keys**

Add exact keys for display settings, navigation menu, search panel, reset to default, light/dark mode, switch to Chinese and switch to English. Both `en` and `zh_CN` tables must contain every new key.

- [ ] **Step 2: Set the build-time fallback language to Simplified Chinese**

Change `siteConfig.lang` from `"en"` to `"zh_CN"` without changing post content configuration.

- [ ] **Step 3: Create the Astro localized-text component**

The component accepts `key: I18nKey`, emits Chinese initial text, and adds `data-i18n-key` for runtime updates.

- [ ] **Step 4: Create the compact `中 / EN` switch**

Render two buttons with `data-ui-language-option="zh_CN"` and `data-ui-language-option="en"`, localized `aria-label` markers, accurate initial `aria-pressed`, keyboard focus styles and no framework dependency.

- [ ] **Step 5: Initialize language before first paint**

In `Layout.astro`, add a minimal inline head script that safely reads `fuwari-ui-language`, sets `data-ui-language`, sets `<html lang>` to `zh-CN` or `en`, and marks stored English as pending until the bundled runtime applies translations. Add global CSS that prevents Chinese text flashing for pending English UI.

- [ ] **Step 6: Start the browser runtime once**

Import and call `initializeUiLanguage()` in the existing layout client script. Keep initialization idempotent with existing Swup lifecycle code.

- [ ] **Step 7: Run checks**

Run: `pnpm test:ui-language && pnpm check`

Expected: both commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/config.ts src/i18n src/components/misc/LocalizedText.astro src/components/LanguageSwitch.astro src/layouts/Layout.astro

git commit -m "feat(i18n): add Chinese English UI switch"
```

### Task 3: Navigation and settings integration

**Files:**
- Modify: `src/types/config.ts`
- Modify: `src/constants/link-presets.ts`
- Modify: `src/components/Navbar.astro`
- Modify: `src/components/widget/NavMenuPanel.astro`
- Modify: `src/components/Search.svelte`
- Modify: `src/components/LightDarkSwitch.svelte`
- Modify: `src/components/widget/DisplaySettings.svelte`

**Interfaces:**
- Adds optional `i18nKey?: I18nKey` to `NavBarLink` for built-in links only.
- Custom user links continue to render their literal `name` unchanged.

- [ ] **Step 1: Preserve translation identity in link presets**

Store each built-in link's `I18nKey` alongside its Chinese fallback name.

- [ ] **Step 2: Add the switch to desktop and mobile navbar controls**

Place `<LanguageSwitch />` near search/theme controls, ensuring it remains usable at all breakpoints.

- [ ] **Step 3: Mark built-in desktop and mobile link labels**

Use `data-i18n-key` only when `i18nKey` exists. Do not mark custom links such as GitHub.

- [ ] **Step 4: Mark search placeholders and control labels**

Both search inputs and the mobile search button must use runtime attribute markers with Chinese initial values.

- [ ] **Step 5: Mark theme and display-setting labels**

Theme choices, display settings, reset, range input and light/dark control accessibility text must switch languages.

- [ ] **Step 6: Run checks**

Run: `pnpm test:ui-language && pnpm check`

Expected: both commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/types/config.ts src/constants/link-presets.ts src/components/Navbar.astro src/components/widget/NavMenuPanel.astro src/components/Search.svelte src/components/LightDarkSwitch.svelte src/components/widget/DisplaySettings.svelte

git commit -m "feat(i18n): localize navigation and settings UI"
```

### Task 4: Pages, metadata and sidebar integration

**Files:**
- Modify: `src/layouts/MainGridLayout.astro`
- Modify: `src/pages/about.astro`
- Modify: `src/pages/archive.astro`
- Modify: `src/pages/posts/[...slug].astro`
- Modify: `src/components/PostMeta.astro`
- Modify: `src/components/PostCard.astro`
- Modify: `src/components/ArchivePanel.svelte`
- Modify: `src/components/misc/License.astro`
- Modify: `src/components/widget/Tags.astro`
- Modify: `src/components/widget/Categories.astro`
- Modify: `src/components/widget/WidgetLayout.astro`
- Modify: `src/utils/content-utils.ts`

**Interfaces:**
- Adds optional `titleKey?: I18nKey` through `MainGridLayout` to `Layout` for archive/about browser titles.
- Adds optional `i18nKey?: I18nKey` to generated category display records only for the uncategorized pseudo-category.

- [ ] **Step 1: Propagate keyed page titles**

About and archive must render Chinese initially and expose their title keys so runtime switching updates `document.title`; post titles remain untouched.

- [ ] **Step 2: Mark post metadata fallback labels**

Localize only word/minute units, uncategorized, no-tags, author, published-at and license labels. Dates, post titles, category names and tag names remain content.

- [ ] **Step 3: Mark archive count labels**

Keep numeric counts and years unchanged while switching singular/plural UI units.

- [ ] **Step 4: Preserve the uncategorized pseudo-category identity**

Return a stable `i18nKey` from `getCategoryList()` so the label switches without changing its `?uncategorized=true` URL.

- [ ] **Step 5: Mark sidebar widget headings and expand text**

Tags, categories and more must switch, while actual tag/category values stay untouched.

- [ ] **Step 6: Run checks and production build**

Run: `pnpm test:ui-language && pnpm check && pnpm build`

Expected: all commands exit 0 and Pagefind generation completes.

- [ ] **Step 7: Commit**

```bash
git add src/layouts/MainGridLayout.astro src/pages src/components/PostMeta.astro src/components/PostCard.astro src/components/ArchivePanel.svelte src/components/misc/License.astro src/components/widget src/utils/content-utils.ts

git commit -m "feat(i18n): localize page UI without translating posts"
```

### Task 5: Final verification

**Files:**
- Review all files changed from `main` to `feat/runtime-ui-bilingual`.

- [ ] **Step 1: Verify translation completeness**

Run a test asserting that every `I18nKey` exists in both `en` and `zh_CN`.

- [ ] **Step 2: Verify formatting and types**

Run: `pnpm format && pnpm check && pnpm type-check`

Expected: all commands exit 0.

- [ ] **Step 3: Verify production output**

Run: `pnpm build`

Expected: Astro build and Pagefind generation exit 0.

- [ ] **Step 4: Review the final diff against constraints**

Confirm no language routes, no post schema changes, no model API key, no article text translation and no new runtime dependency were added.

- [ ] **Step 5: Commit any formatting-only changes**

```bash
git add .
git commit -m "chore: format bilingual UI implementation"
```
