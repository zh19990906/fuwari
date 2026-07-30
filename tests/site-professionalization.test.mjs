import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function read(relativePath) {
	return readFile(path.join(root, relativePath), "utf8");
}

async function exists(relativePath) {
	await access(path.join(root, relativePath));
}

test("documentation series cards keep equal heights and explicit edge alignment", async () => {
	const page = await read("src/pages/docs/index.astro");
	assert.match(page, /grid-cols-1 md:grid-cols-2[^\n"]*items-stretch/);
	assert.match(
		page,
		/btn-card[^\n"]*h-full[^\n"]*grid[^\n"]*grid-rows-\[auto_1fr\]/,
	);
	assert.match(page, /btn-card[^\n"]*text-left/);
	assert.match(page, /btn-card[^\n"]*!justify-stretch/);
	assert.match(page, /flex items-start justify-between gap-4 w-full/);
	assert.match(page, /<h2 class="[^"]*text-left[^"]*"/);
	assert.match(page, /<span class="[^"]*ml-auto[^"]*"/);
	assert.match(page, /data-doc-group-description[^\n>]*class="[^"]*text-left/);
	assert.match(page, /md:col-span-2/);
	assert.match(page, /md:justify-self-center/);
});

test("documentation entries align their number and title group to the left", async () => {
	const page = await read("src/pages/docs/[group].astro");
	assert.match(
		page,
		/btn-card[^\n"]*w-full[^\n"]*!justify-start[^\n"]*text-left/,
	);
	assert.match(
		page,
		/<span class="[^"]*flex-1[^"]*text-left[^"]*">\{document\.title\}<\/span>/,
	);
});

test("activity timeline shows only ten recent commits in aligned full-width columns", async () => {
	const page = await read("src/pages/activity/index.astro");
	assert.match(page, /const recentCommits = summary\.commits\.slice\(0, 10\)/);
	assert.match(page, /recentCommits\.reduce/);
	assert.match(
		page,
		/sm:grid-cols-\[4rem_5rem_minmax\(0,1fr\)_4\.5rem\]/,
	);
	assert.match(page, /btn-card[^\n"]*w-full[^\n"]*!justify-stretch[^\n"]*text-left/);
	assert.match(page, /data-activity-time[^\n>]*class="[^"]*justify-self-start/);
	assert.match(page, /data-activity-kind[^\n>]*class="[^"]*justify-self-start/);
	assert.match(page, /data-activity-title[^\n>]*class="[^"]*justify-self-stretch/);
	assert.match(page, /data-activity-hash[^\n>]*class="[^"]*justify-self-end/);
});

test("activity page and sidebar use the real build-time activity summary", async () => {
	const [page, card, sidebar] = await Promise.all([
		read("src/pages/activity/index.astro"),
		read("src/components/widget/ActivityCard.astro"),
		read("src/components/widget/SideBar.astro"),
	]);
	assert.match(page, /getActivitySummary/);
	assert.match(page, /summary\.heatmap/);
	assert.match(page, /github\.com\/zh19990906\/fuwari\/commit/);
	assert.match(card, /getActivitySummary/);
	assert.match(card, /summary\.todayCommits/);
	assert.match(card, /summary\.last7DaysCommits/);
	assert.match(sidebar, /<ActivityCard/);
});

test("activity navigation and runtime labels are registered", async () => {
	const [types, presets, config, labels, about] = await Promise.all([
		read("src/types/config.ts"),
		read("src/constants/link-presets.ts"),
		read("src/config.ts"),
		read("src/i18n/ui-language-labels.ts"),
		read("src/content/spec/about.md"),
	]);
	assert.match(types, /Activity/);
	assert.match(presets, /\/activity\//);
	assert.match(
		config,
		/LinkPreset\.Docs,[\s\S]*LinkPreset\.Activity,[\s\S]*LinkPreset\.About/,
	);
	for (const text of [
		"开发动态",
		"Development activity",
		"今日提交",
		"Commits today",
		"今日上线",
		"Releases today",
		"最近 7 天",
		"Last 7 days",
		"暂无活动数据",
		"Activity data unavailable",
	]) {
		assert.match(labels, new RegExp(text));
	}
	assert.match(about, /\/activity\//);
});

test("brand assets and explicit favicon configuration exist", async () => {
	await Promise.all([
		exists("public/favicon.svg"),
		exists("public/apple-touch-icon.png"),
		exists("public/og-default.png"),
	]);
	const [config, generator, packageJson] = await Promise.all([
		read("src/config.ts"),
		read("scripts/generate-brand-assets.mjs"),
		read("package.json"),
	]);
	assert.match(config, /favicon:\s*\[[\s\S]*\/favicon\.svg/);
	assert.doesNotMatch(config, /demo-banner/);
	assert.match(generator, /apple-touch-icon\.png/);
	assert.match(generator, /og-default\.png/);
	assert.match(packageJson, /generate:brand-assets/);
});

test("seo head emits normalized canonical social and structured metadata", async () => {
	const [seo, grid, post] = await Promise.all([
		read("src/components/SeoHead.astro"),
		read("src/layouts/MainGridLayout.astro"),
		read("src/pages/posts/[...slug].astro"),
	]);
	assert.match(seo, /rel="canonical"/);
	assert.match(seo, /property="og:image"/);
	assert.match(seo, /property="og:image:width"/);
	assert.match(seo, /name="twitter:image"/);
	assert.match(seo, /property="article:published_time"/);
	assert.match(seo, /property="article:modified_time"/);
	assert.match(seo, /application\/ld\+json/);
	assert.match(seo, /url\("\/rss\.xml"\)/);
	assert.match(grid, /<SeoHead/);
	assert.match(grid, /socialImage/);
	assert.match(grid, /published/);
	assert.match(grid, /updated/);
	assert.match(post, /socialImage=\{entry\.data\.image\}/);
	assert.match(post, /published=\{entry\.data\.published\}/);
	assert.match(post, /updated=\{entry\.data\.updated\}/);
	assert.doesNotMatch(post, /const jsonLd/);
});

test("robots 404 and workflows support the deployed base path and full history", async () => {
	const [robots, notFound, build, deploy] = await Promise.all([
		read("src/pages/robots.txt.ts"),
		read("src/pages/404.astro"),
		read(".github/workflows/build.yml"),
		read(".github/workflows/deploy.yml"),
	]);
	assert.match(robots, /sitemap-index\.xml/);
	assert.match(robots, /text\/plain/);
	for (const route of ["/", "/docs/", "/archive/", "/activity/"]) {
		assert.match(notFound, new RegExp(route.replaceAll("/", "\\/")));
	}
	assert.equal((build.match(/fetch-depth:\s*0/g) || []).length, 2);
	assert.equal((deploy.match(/fetch-depth:\s*0/g) || []).length, 1);
});
