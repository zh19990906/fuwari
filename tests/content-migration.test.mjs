import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const expectedDocs = {
	"linux-inode-troubleshooting.md": ["linux", "磁盘与文件系统", "50"],
	"linux-mount-cifs-share.md": ["linux", "文件系统与挂载", "60"],
	"docker-engine-api-security.md": ["docker", "安全与远程管理", "50"],
	"docker-private-registry.md": ["docker", "镜像仓库", "60"],
	"python-thread-pool.md": ["python", "并发编程", "50"],
	"python-scheduling-and-datetime.md": ["python", "实用技巧", "60"],
	"postgresql-python-access.md": ["postgresql", "应用接入", "50"],
	"nginx-reverse-proxy.md": ["nginx", "反向代理", "10"],
	"nginx-acme-https.md": ["nginx", "HTTPS 与安全", "20"],
	"nginx-load-balancing.md": ["nginx", "负载均衡", "30"],
	"nlp-and-llm-foundations.md": ["ai-llm", "基础概念", "10"],
	"attention-and-transformer.md": ["ai-llm", "模型架构", "20"],
};

async function readRequiredFile(filename) {
	try {
		return await readFile(path.join(root, "src/content/posts", filename), "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") {
			assert.fail(`Missing required migrated document: ${filename}`);
		}
		throw error;
	}
}

for (const [filename, [group, section, order]] of Object.entries(
	expectedDocs,
)) {
	test(`${filename} follows documentation metadata and safety rules`, async () => {
		const content = await readRequiredFile(filename);
		assert.match(content, /^---\n[\s\S]*?\n---/);
		assert.match(content, /contentType: docs/);
		assert.match(content, new RegExp(`docGroup: ${group}`));
		assert.match(content, new RegExp(`docSection: ${section}`));
		assert.match(content, new RegExp(`docOrder: ${order}`));
		assert.match(content, /updated: 2026-07-30/);
		assert.match(content, /本文根据早期个人笔记重新整理/);
		assert.doesNotMatch(content, /www\.yuque\.com|> 更新:|> 原文:/);
		assert.doesNotMatch(content, /<font\b|<\/font>/i);
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
}

test("documentation groups register nginx and ai-llm", async () => {
	const config = await readFile(path.join(root, "src/config/docs.ts"), "utf8");
	assert.match(config, /slug: "nginx"[\s\S]*?order: 60/);
	assert.match(config, /slug: "ai-llm"[\s\S]*?order: 70/);
});
