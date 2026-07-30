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
	assert.doesNotMatch(
		config,
		/Lorem Ipsum|saicaca\/fuwari|twitter\.com|store\.steampowered\.com/,
	);
});

test("about page links only the selected representative projects", async () => {
	const about = await readFile(
		path.join(root, "src/content/spec/about.md"),
		"utf8",
	);
	for (const repo of ["gesture-boss-game", "mcp-gateway", "fuwari"]) {
		assert.match(
			about,
			new RegExp(`::github\\{repo="zh19990906/${repo}"\\}`),
		);
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
