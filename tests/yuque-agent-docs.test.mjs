import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const expectedDocs = {
	"langchain-agent-runtime.md": {
		group: "ai-llm",
		section: "Agent 工程",
		order: "30",
		required: [
			"create_agent",
			"LangGraph",
			"checkpointer",
			"thread_id",
			"生产环境检查清单",
		],
		references: [
			/docs\.langchain\.com\/oss\/python\/releases\/langchain-v1/,
			/docs\.langchain\.com\/oss\/python\/langgraph\/persistence/,
		],
	},
	"langchain-middleware-hitl.md": {
		group: "ai-llm",
		section: "Agent 工程",
		order: "40",
		required: [
			"HumanInTheLoopMiddleware",
			"InMemorySaver",
			"approve",
			"edit",
			"reject",
			"生产环境检查清单",
		],
		references: [
			/docs\.langchain\.com\/oss\/python\/langchain\/middleware\/overview/,
			/docs\.langchain\.com\/oss\/python\/langgraph\/interrupts/,
		],
	},
};

async function readRequiredFile(filename) {
	try {
		return await readFile(path.join(root, "src/content/posts", filename), "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") {
			assert.fail(`Missing required Agent document: ${filename}`);
		}
		throw error;
	}
}

for (const [filename, config] of Object.entries(expectedDocs)) {
	test(`${filename} follows Agent documentation and safety rules`, async () => {
		const content = await readRequiredFile(filename);
		assert.match(content, /^---\n[\s\S]*?\n---/);
		assert.match(content, /contentType: docs/);
		assert.match(content, new RegExp(`docGroup: ${config.group}`));
		assert.match(content, new RegExp(`docSection: ${config.section}`));
		assert.match(content, new RegExp(`docOrder: ${config.order}`));
		assert.match(content, /updated: 2026-07-30/);
		assert.match(
			content,
			/本文根据早期个人笔记重新整理，并结合当前官方文档进行了校对。/,
		);

		for (const phrase of config.required) {
			assert.match(content, new RegExp(phrase));
		}
		for (const reference of config.references) {
			assert.match(content, reference);
		}

		assert.doesNotMatch(content, /www\.yuque\.com|> 更新:|> 原文:/);
		assert.doesNotMatch(content, /<font\b|<\/font>|:::info|:::color/i);
		assert.doesNotMatch(content, /^author:/m);
		assert.doesNotMatch(content, /minioadmin/i);
		assert.doesNotMatch(
			content,
			/(?:api[_-]?key|secret[_-]?key|access[_-]?key|password|auth\.token)\s*[=:]\s*["'][^$<{][^"']+/i,
		);
		assert.doesNotMatch(
			content,
			/(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}/,
		);
	});
}
