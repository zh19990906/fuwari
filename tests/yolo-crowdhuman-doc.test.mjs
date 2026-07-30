import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const filename = "yolo26-head-detection-crowdhuman.md";

test("CrowdHuman head-count project follows the YOLO documentation rules", async () => {
	let content;
	try {
		content = await readFile(path.join(root, "src/content/posts", filename), "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") {
			assert.fail(`Missing YOLO project document: ${filename}`);
		}
		throw error;
	}

	assert.match(content, /^---\n[\s\S]*?\n---/);
	assert.match(content, /title: YOLO26 人头检测与人数统计：CrowdHuman 清洗、训练和对比/);
	assert.match(content, /contentType: docs/);
	assert.match(content, /docGroup: yolo/);
	assert.match(content, /docSection: 项目实战/);
	assert.match(content, /docOrder: 110/);
	assert.match(content, /updated: 2026-07-30/);
	assert.doesNotMatch(content, /^author:/m);
	assert.doesNotMatch(
		content,
		/(?:api[_-]?key|secret[_-]?key|access[_-]?key|password)\s*=\s*["'][^$<{][^"']+/i,
	);
	assert.doesNotMatch(
		content,
		/(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}/,
	);
});
