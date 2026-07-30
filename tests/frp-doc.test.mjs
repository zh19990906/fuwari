import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const articlePath = path.join(
	root,
	"src/content/posts/frp-cross-platform-tunnel.md",
);

async function readArticle() {
	try {
		return await readFile(articlePath, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") {
			assert.fail("Missing required FRP cross-platform guide");
		}
		throw error;
	}
}

test("FRP guide follows documentation metadata", async () => {
	const content = await readArticle();

	assert.match(content, /^---\n[\s\S]*?\n---/);
	assert.match(content, /contentType: docs/);
	assert.match(content, /docGroup: linux/);
	assert.match(content, /docSection: 网络与远程访问/);
	assert.match(content, /docOrder: 70/);
	assert.match(content, /updated: 2026-07-30/);
	assert.doesNotMatch(content, /^author:/m);
});

test("FRP guide covers current cross-platform deployment", async () => {
	const content = await readArticle();
	const required = [
		"FRP_VERSION=0.69.0",
		"frps.toml",
		"frpc.toml",
		'auth.tokenSource.type = "file"',
		"auth.tokenSource.file.path",
		"transport.tls.force = true",
		"transport.tls.enable = true",
		"allowPorts",
		"maxPortsPerClient",
		"frps verify",
		"frpc verify",
		"systemctl enable --now frps",
		"systemctl enable --now frpc",
		"New-ScheduledTaskAction",
		"Register-ScheduledTask",
		'type = "tcp"',
		'type = "http"',
		"customDomains",
		"proxy_set_header Host $host",
		"生产环境检查清单",
	];

	for (const phrase of required) {
		assert.ok(content.includes(phrase), `Missing required FRP topic: ${phrase}`);
	}
});

test("FRP guide keeps credentials and management surfaces private", async () => {
	const content = await readArticle();

	assert.match(content, /webServer\.addr = "127\.0\.0\.1"/);
	assert.doesNotMatch(content, /webServer\.addr = "0\.0\.0\.0"/);
	assert.doesNotMatch(content, /^auth\.token\s*=/m);
	assert.doesNotMatch(content, /webServer\.password = "(?:admin|123456|password)"/i);
	assert.doesNotMatch(content, /screen\s+-S|\bnohup\b/i);
	assert.doesNotMatch(
		content,
		/(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}/,
	);
	assert.doesNotMatch(content, /upload:\/\/|private-user-images\.githubusercontent\.com/);
});

test("FRP guide attributes sources without copying export artifacts", async () => {
	const content = await readArticle();

	assert.match(content, /github\.com\/fatedier\/frp/);
	assert.match(content, /gofrp\.org\/en\/docs/);
	assert.match(content, /learn\.microsoft\.com/);
	assert.match(content, /github\.com\/CNFlyCat\/UsefulTutorials/);
	assert.match(content, /本文参考了 CNFlyCat/);
	assert.doesNotMatch(content, /www\.yuque\.com|> 更新:|> 原文:/);
	assert.doesNotMatch(content, /<font\b|<\/font>|:::info|:::color/i);
});
