import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const expectedDocs = {
	"python-redis-production.md": {
		section: "数据服务",
		order: "70",
		required: [
			"ConnectionPool.from_url",
			"scan_iter",
			"nx=True",
			"生产环境检查清单",
		],
		references: [/redis\.io\/docs\/latest\/develop\/clients\/redis-py/],
	},
	"python-kafka-reliable-messaging.md": {
		section: "数据服务",
		order: "80",
		required: [
			"confluent_kafka",
			"enable.auto.commit",
			"consumer.commit",
			"producer.flush",
			"生产环境检查清单",
		],
		references: [/docs\.confluent\.io\/kafka-clients\/python/],
	},
	"python-minio-object-storage.md": {
		section: "数据服务",
		order: "90",
		required: [
			"MINIO_ACCESS_KEY",
			"response.release_conn",
			"presigned_get_object",
			"生产环境检查清单",
		],
		references: [/github\.com\/minio\/minio-py/],
	},
	"fastapi-concurrency-background-tasks.md": {
		section: "Web 工程",
		order: "100",
		required: [
			"asyncio.to_thread",
			"BackgroundTasks",
			"lifespan",
			"workers * pool_size",
			"生产环境检查清单",
		],
		references: [
			/fastapi\.tiangolo\.com\/async/,
			/docs\.python\.org\/3\/library\/asyncio/,
		],
	},
};

async function readRequiredFile(filename) {
	try {
		return await readFile(path.join(root, "src/content/posts", filename), "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") {
			assert.fail(`Missing required Python service document: ${filename}`);
		}
		throw error;
	}
}

for (const [filename, config] of Object.entries(expectedDocs)) {
	test(`${filename} follows Python documentation and safety rules`, async () => {
		const content = await readRequiredFile(filename);
		assert.match(content, /^---\n[\s\S]*?\n---/);
		assert.match(content, /contentType: docs/);
		assert.match(content, /docGroup: python/);
		assert.match(content, new RegExp(`docSection: ${config.section}`));
		assert.match(content, new RegExp(`docOrder: ${config.order}`));
		assert.match(content, /updated: 2026-07-30/);
		assert.match(
			content,
			/本文根据早期个人笔记重新整理，并结合当前官方文档进行了校对。/,
		);

		for (const phrase of config.required) {
			assert.match(content, new RegExp(phrase.replace("*", "\\*")));
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

test("Python service guides use unique titles and document order values", async () => {
	const metadata = await Promise.all(
		Object.keys(expectedDocs).map(async (filename) => {
			const content = await readRequiredFile(filename);
			const title = content.match(/^title:\s*(.+)$/m)?.[1]?.trim();
			const order = content.match(/^docOrder:\s*(\d+)$/m)?.[1];
			assert.ok(title, `${filename} must define a title`);
			assert.ok(order, `${filename} must define docOrder`);
			return { title, order };
		}),
	);

	assert.equal(new Set(metadata.map(({ title }) => title)).size, metadata.length);
	assert.equal(new Set(metadata.map(({ order }) => order)).size, metadata.length);
});
