import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const postsDir = path.join(root, "src/content/posts");

const expectedDocs = {
	"yolo-gimbal-system-architecture.md": {
		section: "项目总览",
		order: 10,
		required: ["Windows/N100", "NanoPi K2", "ByteTrack", "UDP", "return-center"],
	},
	"yolo-gimbal-windows-vision-host.md": {
		section: "视觉端",
		order: 20,
		required: ["Ultralytics", "ByteTrack", "vision perf", "asyncio.TimeoutError", "YOLO26"],
	},
	"yolo-gimbal-k2-control-service.md": {
		section: "控制端",
		order: 30,
		required: ["tracking", "holding", "return-center", "fault", "Pca9685ServoBackend"],
	},
	"yolo-gimbal-hardware-wiring.md": {
		section: "硬件与总线",
		order: 40,
		required: ["Pin 1", "Pin 3", "Pin 5", "Pin 6", "VCC", "V+", "OE", "共地"],
	},
	"nanopi-k2-enable-header-i2c.md": {
		section: "硬件与总线",
		order: 50,
		required: ["Ubuntu 16.04.7", "Linux 3.14.29", "0x50", "UU", "i2c@c1108500", "fdtput", "DTB"],
	},
	"pca9685-servo-bringup.md": {
		section: "调试验证",
		order: 60,
		required: ["i2cdetect -l", "0x40", "1500", "1475", "1525", "CH0", "CH1"],
	},
	"yolo-gimbal-troubleshooting.md": {
		section: "故障排查",
		order: 70,
		required: ["--", "UU", "HDMI DDC", "VCC", "V+", "立即断电"],
	},
	"yolo-gimbal-deployment-operations.md": {
		section: "部署运维",
		order: 80,
		required: ["backend: pca9685", "i2c_bus", "i2c_address: 0x40", "frequency_hz: 50", "模拟后端"],
	},
};

function frontmatterValue(content, key) {
	const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
	return match?.[1]?.trim();
}

for (const [filename, requirements] of Object.entries(expectedDocs)) {
	test(`${filename} follows YOLO gimbal documentation contract`, async () => {
		const content = await readFile(path.join(postsDir, filename), "utf8");
		assert.match(content, /^---\n[\s\S]*?\n---\n/);
		assert.equal(frontmatterValue(content, "contentType"), "docs");
		assert.equal(frontmatterValue(content, "docGroup"), "yolo-gimbal");
		assert.equal(frontmatterValue(content, "docSection"), requirements.section);
		assert.equal(Number(frontmatterValue(content, "docOrder")), requirements.order);
		assert.equal(frontmatterValue(content, "published"), "2026-08-05");
		assert.equal(frontmatterValue(content, "updated"), "2026-08-05");
		assert.equal(frontmatterValue(content, "draft"), "false");
		assert.doesNotMatch(content, /^author:/m);
		for (const phrase of requirements.required) {
			assert.ok(content.includes(phrase), `${filename} missing ${phrase}`);
		}
		assert.doesNotMatch(
			content,
			/(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}/,
		);
		assert.doesNotMatch(
			content,
			/(?:password|secret|api[_-]?key|access[_-]?key|token)\s*[=:]\s*["'][A-Za-z0-9_\-]{8,}["']/i,
		);
		assert.doesNotMatch(content, /minioadmin|changeme|password123|admin123/i);
		const fenceCount = (content.match(/```/g) ?? []).length;
		assert.equal(fenceCount % 2, 0, `${filename} has unclosed code fence`);
	});
}

test("registers the YOLO gimbal documentation group", async () => {
	const config = await readFile(path.join(root, "src/config/docs.ts"), "utf8");
	assert.match(
		config,
		/slug: "yolo-gimbal"[\s\S]*?title: "YOLO 云台项目"[\s\S]*?order: 90/,
	);
});
