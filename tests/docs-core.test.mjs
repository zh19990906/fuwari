import assert from "node:assert/strict";
import test from "node:test";
import {
	getDocNavigation,
	groupDocsBySection,
	sortDocEntries,
	sortDocGroups,
	validateDocsConfiguration,
} from "../.test-dist/src/utils/docs-core.js";
import "./content-migration.test.mjs";
import "./engineering-docs.test.mjs";
import "./frp-doc.test.mjs";
import "./yolo-crowdhuman-doc.test.mjs";
import "./yuque-agent-docs.test.mjs";
import "./yuque-python-service-docs.test.mjs";

const groups = [
	{ slug: "docker", title: "Docker", order: 20 },
	{ slug: "yolo", title: "YOLO", order: 10 },
];

const entries = [
	{
		slug: "deploy",
		title: "TensorRT 部署",
		contentType: "docs",
		docGroup: "yolo",
		docSection: "部署",
		docOrder: 10,
	},
	{
		slug: "train",
		title: "开始训练",
		contentType: "docs",
		docGroup: "yolo",
		docSection: "快速开始",
		docOrder: 20,
	},
	{
		slug: "install",
		title: "环境搭建",
		contentType: "docs",
		docGroup: "yolo",
		docSection: "快速开始",
		docOrder: 10,
	},
	{
		slug: "compose",
		title: "Compose",
		contentType: "docs",
		docGroup: "docker",
		docSection: "",
		docOrder: 10,
	},
	{
		slug: "blog-post",
		title: "普通文章",
		contentType: "post",
	},
];

test("sorts configured groups by order", () => {
	assert.deepEqual(
		sortDocGroups(groups).map((group) => group.slug),
		["yolo", "docker"],
	);
});

test("excludes normal posts and sorts documents by section and order", () => {
	const yoloDocs = entries.filter((entry) => entry.docGroup === "yolo");
	assert.deepEqual(
		sortDocEntries(yoloDocs).map((entry) => entry.slug),
		["deploy", "install", "train"],
	);
	assert.equal(
		sortDocEntries(entries).some((entry) => entry.slug === "blog-post"),
		false,
	);
});

test("groups documents into named sections and puts the empty section last", () => {
	const sections = groupDocsBySection(entries);
	assert.deepEqual(
		sections.map((section) => section.name),
		["部署", "快速开始", ""],
	);
	assert.deepEqual(
		sections[1].entries.map((entry) => entry.slug),
		["install", "train"],
	);
});

test("rejects missing and unknown document groups with the entry slug", () => {
	assert.throws(
		() =>
			validateDocsConfiguration(groups, [
				{ slug: "missing", title: "Missing", contentType: "docs" },
			]),
		/missing.*docGroup/i,
	);
	assert.throws(
		() =>
			validateDocsConfiguration(groups, [
				{
					slug: "unknown",
					title: "Unknown",
					contentType: "docs",
					docGroup: "kubernetes",
				},
			]),
		/unknown.*kubernetes/i,
	);
});

test("rejects duplicate configured group slugs", () => {
	assert.throws(
		() =>
			validateDocsConfiguration(
				[
					{ slug: "yolo", title: "YOLO", order: 10 },
					{ slug: "yolo", title: "YOLO 2", order: 20 },
				],
				[],
			),
		/duplicate.*yolo/i,
	);
});

test("keeps previous and next navigation inside the supplied group", () => {
	const yoloDocs = entries.filter((entry) => entry.docGroup === "yolo");
	const navigation = getDocNavigation(yoloDocs, "install");
	assert.equal(navigation.previous?.slug, "deploy");
	assert.equal(navigation.next?.slug, "train");
	assert.equal(navigation.previous?.docGroup, "yolo");
	assert.equal(navigation.next?.docGroup, "yolo");
});
