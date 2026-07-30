import assert from "node:assert/strict";
import test from "node:test";
import {
	buildActivitySummary,
	classifyActivity,
	cleanActivityTitle,
	parseGitLog,
} from "../.test-dist/src/utils/activity-core.js";
import { loadActivitySummary } from "../.test-dist/src/utils/activity-utils.js";

const record = ({ hash, parents = "parent", at, subject, body = "" }) =>
	[hash, parents, at, subject, body].join("\x1f");

test("parses git records and cleans generic merge titles", () => {
	const raw = [
		record({
			hash: "a".repeat(40),
			parents: "p1 p2",
			at: "2026-07-30T01:00:00Z",
			subject: "Merge pull request #6 from zh19990906/feature",
			body: "\ncontent: publish activity log\n\nextra detail",
		}),
		record({
			hash: "b".repeat(40),
			at: "2026-07-29T12:00:00Z",
			subject: "feat: add activity page",
		}),
	].join("\x1e");

	const commits = parseGitLog(raw);
	assert.equal(commits.length, 2);
	assert.equal(commits[0].displayTitle, "content: publish activity log");
	assert.equal(commits[0].kind, "release");
	assert.equal(commits[0].isMerge, true);
	assert.equal(commits[0].dateKey, "2026-07-30");
	assert.equal(commits[1].kind, "feature");
});

test("preserves meaningful merge subjects and classifies prefixes", () => {
	assert.equal(
		cleanActivityTitle("Merge branch 'main' into release", "ignored"),
		"Merge branch 'main' into release",
	);
	assert.equal(classifyActivity("content: add docs", false), "content");
	assert.equal(classifyActivity("docs: update guide", false), "docs");
	assert.equal(classifyActivity("fix: repair link", false), "fix");
	assert.equal(classifyActivity("test: cover parser", false), "test");
	assert.equal(classifyActivity("chore: format", false), "chore");
	assert.equal(classifyActivity("miscellaneous", false), "other");
	assert.equal(classifyActivity("anything", true), "release");
});

test("groups counters by Asia Shanghai calendar boundaries", () => {
	const commits = parseGitLog(
		[
			record({
				hash: "1".repeat(40),
				at: "2026-07-30T02:00:00Z",
				subject: "feat: today",
			}),
			record({
				hash: "2".repeat(40),
				parents: "p1 p2",
				at: "2026-07-29T16:01:00Z",
				subject: "Merge pull request #5",
				body: "release: today",
			}),
			record({
				hash: "3".repeat(40),
				at: "2026-07-29T15:59:00Z",
				subject: "fix: yesterday",
			}),
			record({
				hash: "4".repeat(40),
				at: "2026-07-24T02:00:00Z",
				subject: "docs: seventh day",
			}),
			record({
				hash: "5".repeat(40),
				at: "2026-07-23T02:00:00Z",
				subject: "docs: outside range",
			}),
		].join("\x1e"),
	);

	const summary = buildActivitySummary(
		commits,
		new Date("2026-07-30T03:00:00Z"),
	);
	assert.equal(summary.available, true);
	assert.equal(summary.timezone, "Asia/Shanghai");
	assert.equal(summary.todayCommits, 2);
	assert.equal(summary.todayReleases, 1);
	assert.equal(summary.last7DaysCommits, 4);
	assert.equal(summary.lastUpdatedAt, "2026-07-30T02:00:00Z");
	assert.equal(summary.heatmap.length, 90);
	assert.deepEqual(summary.heatmap.at(-1), { date: "2026-07-30", count: 2 });
});

test("sorts newest first and limits the detailed timeline to 200 commits", () => {
	const commits = Array.from({ length: 205 }, (_, index) => ({
		hash: index.toString(16).padStart(40, "0"),
		parents: ["parent"],
		committedAt: new Date(Date.UTC(2026, 6, 30, 0, 0, index)).toISOString(),
		subject: `chore: ${index}`,
		body: "",
		displayTitle: `chore: ${index}`,
		kind: "chore",
		isMerge: false,
		dateKey: "2026-07-30",
	}));
	const summary = buildActivitySummary(
		commits,
		new Date("2026-07-30T03:00:00Z"),
	);
	assert.equal(summary.commits.length, 200);
	assert.equal(summary.commits[0].displayTitle, "chore: 204");
	assert.equal(summary.commits.at(-1).displayTitle, "chore: 5");
});

test("returns an explicit unavailable summary when git history cannot be read", async () => {
	const now = new Date("2026-07-30T03:00:00Z");
	const summary = await loadActivitySummary(async () => {
		throw new Error("git unavailable");
	}, now);
	assert.equal(summary.available, false);
	assert.equal(summary.timezone, "Asia/Shanghai");
	assert.equal(summary.generatedAt, now.toISOString());
	assert.equal(summary.todayCommits, 0);
	assert.equal(summary.todayReleases, 0);
	assert.equal(summary.last7DaysCommits, 0);
	assert.deepEqual(summary.heatmap, []);
	assert.deepEqual(summary.commits, []);
});
