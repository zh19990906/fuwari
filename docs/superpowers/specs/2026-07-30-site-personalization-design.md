# Site Personalization Design

## Goal

Replace the remaining upstream demo identity with Henson's personal identity, publish a concise project-focused About page, and prevent incorrect author or upstream placeholder text from returning.

## Scope

- Set the site title to `Henson's Blog`.
- Set the site subtitle and profile bio to `无名小卒的博客记录`.
- Set the profile name to `Henson`.
- Use the authenticated GitHub avatar URL for the profile image.
- Replace every visible upstream GitHub link with `https://github.com/zh19990906`.
- Remove demo Twitter and Steam profile links.
- Replace the demo About page with a personal introduction and project navigation for:
  - `zh19990906/gesture-boss-game`
  - `zh19990906/mcp-gateway`
  - `zh19990906/fuwari`
- Keep the statement that the blog is based on the upstream Fuwari project when describing the blog repository.
- Add an automated text scan that rejects `Lorem Ipsum`, the upstream profile URL, the demo About sentence, and incorrect author markers in published posts.

## Author Model

The post license card and profile card both consume `profileConfig.name`. The canonical author value is therefore `Henson` in `src/config.ts`; individual posts do not receive duplicate author fields.

The regression test scans `src/config.ts`, `src/content/spec/about.md`, and all Markdown files under `src/content/posts/`. It must distinguish legitimate attribution such as a source citation from obsolete site identity. The upstream project name may appear in the About page only in the explicit attribution sentence.

## About Page Structure

1. `关于我` introduction.
2. `关注方向` covering Python, AI/LLM, computer vision, containers, and engineering deployment.
3. `主要项目` with one short explanation and one `::github` card for each selected repository.
4. A link to the GitHub profile.

## Non-goals

- No custom avatar asset is added to the repository.
- No social platforms other than GitHub are invented.
- No individual Markdown `author` field is introduced.
- No homepage layout or theme styling is changed.

## Validation

- A Node test verifies the required values and scans for forbidden placeholders.
- Existing UI-language tests and documentation tests continue to pass.
- Astro Check and production builds pass on Node.js 22 and 23.
- Biome reports no new issues.
