import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function read(relativePath) {
	return readFile(path.join(root, relativePath), "utf8");
}

test("documentation series cards keep equal heights and stable title alignment", async () => {
	const page = await read("src/pages/docs/index.astro");
	assert.match(page, /grid-cols-1 md:grid-cols-2[^\n"]*items-stretch/);
	assert.match(
		page,
		/btn-card[^\n"]*h-full[^\n"]*grid[^\n"]*grid-rows-\[auto_1fr\]/,
	);
	assert.match(page, /flex items-start justify-between gap-4/);
	assert.match(page, /data-doc-group-description/);
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
	assert.match(config, /LinkPreset\.Docs,[\s\S]*LinkPreset\.Activity,[\s\S]*LinkPreset\.About/);
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
