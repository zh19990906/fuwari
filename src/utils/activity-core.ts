export const ACTIVITY_TIMEZONE = "Asia/Shanghai" as const;

export type ActivityKind =
	| "content"
	| "feature"
	| "fix"
	| "docs"
	| "test"
	| "chore"
	| "release"
	| "other";

export interface ActivityCommit {
	hash: string;
	parents: string[];
	committedAt: string;
	subject: string;
	body: string;
	displayTitle: string;
	kind: ActivityKind;
	isMerge: boolean;
	dateKey: string;
}

export interface ActivitySummary {
	available: boolean;
	generatedAt: string;
	timezone: typeof ACTIVITY_TIMEZONE;
	todayCommits: number;
	todayReleases: number;
	last7DaysCommits: number;
	lastUpdatedAt?: string;
	heatmap: Array<{ date: string; count: number }>;
	commits: ActivityCommit[];
}

export type ActivityGitRunner = () => Promise<string>;

const genericPullRequestMerge = /^Merge pull request #\d+(?:\s+from\s+.+)?$/i;

function formatShanghaiDateKey(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: ACTIVITY_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const values = Object.fromEntries(
		parts.map((part) => [part.type, part.value]),
	);
	return `${values.year}-${values.month}-${values.day}`;
}

export function isActivitySummaryFresh(
	generatedAt: Date | string,
	now = new Date(),
): boolean {
	const generatedDate =
		generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
	if (
		Number.isNaN(generatedDate.getTime()) ||
		Number.isNaN(now.getTime())
	) {
		return false;
	}
	return formatShanghaiDateKey(generatedDate) === formatShanghaiDateKey(now);
}

function shiftDateKey(dateKey: string, days: number): string {
	const date = new Date(`${dateKey}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function unavailableActivitySummary(now: Date): ActivitySummary {
	return {
		available: false,
		generatedAt: now.toISOString(),
		timezone: ACTIVITY_TIMEZONE,
		todayCommits: 0,
		todayReleases: 0,
		last7DaysCommits: 0,
		heatmap: [],
		commits: [],
	};
}

export function cleanActivityTitle(subject: string, body: string): string {
	const normalizedSubject = subject.trim();
	if (!genericPullRequestMerge.test(normalizedSubject))
		return normalizedSubject;
	const firstMeaningfulBodyLine = body
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean);
	return firstMeaningfulBodyLine || normalizedSubject;
}

export function classifyActivity(
	subject: string,
	isMerge: boolean,
): ActivityKind {
	if (isMerge) return "release";
	const prefix = subject
		.trim()
		.match(/^([a-z-]+)(?:\([^)]*\))?:/i)?.[1]
		?.toLowerCase();
	switch (prefix) {
		case "content":
			return "content";
		case "feat":
		case "feature":
			return "feature";
		case "fix":
		case "bugfix":
			return "fix";
		case "docs":
		case "doc":
			return "docs";
		case "test":
		case "tests":
			return "test";
		case "chore":
		case "style":
		case "refactor":
		case "build":
		case "ci":
			return "chore";
		case "release":
			return "release";
		default:
			return "other";
	}
}

export function parseGitLog(raw: string): ActivityCommit[] {
	if (!raw.trim()) return [];
	return raw
		.split("\x1e")
		.map((record) => record.trim())
		.filter(Boolean)
		.map((record) => {
			const [
				hash = "",
				parentsText = "",
				committedAt = "",
				subject = "",
				...bodyParts
			] = record.split("\x1f");
			const body = bodyParts.join("\x1f");
			const parents = parentsText.trim() ? parentsText.trim().split(/\s+/) : [];
			const isMerge = parents.length > 1;
			return {
				hash: hash.trim(),
				parents,
				committedAt: committedAt.trim(),
				subject: subject.trim(),
				body,
				displayTitle: cleanActivityTitle(subject, body),
				kind: classifyActivity(subject, isMerge),
				isMerge,
				dateKey: formatShanghaiDateKey(committedAt),
			};
		});
}

export function buildActivitySummary(
	commits: ActivityCommit[],
	now = new Date(),
): ActivitySummary {
	const sorted = [...commits].sort(
		(left, right) =>
			new Date(right.committedAt).getTime() -
			new Date(left.committedAt).getTime(),
	);
	const todayKey = formatShanghaiDateKey(now);
	const last7DayKeys = new Set(
		Array.from({ length: 7 }, (_, index) => shiftDateKey(todayKey, -index)),
	);
	const countsByDate = new Map<string, number>();
	for (const commit of sorted) {
		countsByDate.set(
			commit.dateKey,
			(countsByDate.get(commit.dateKey) || 0) + 1,
		);
	}
	const heatmap = Array.from({ length: 90 }, (_, index) => {
		const date = shiftDateKey(todayKey, index - 89);
		return { date, count: countsByDate.get(date) || 0 };
	});

	return {
		available: true,
		generatedAt: now.toISOString(),
		timezone: ACTIVITY_TIMEZONE,
		todayCommits: sorted.filter((commit) => commit.dateKey === todayKey).length,
		todayReleases: sorted.filter(
			(commit) => commit.dateKey === todayKey && commit.isMerge,
		).length,
		last7DaysCommits: sorted.filter((commit) =>
			last7DayKeys.has(commit.dateKey),
		).length,
		lastUpdatedAt: sorted[0]?.committedAt,
		heatmap,
		commits: sorted.slice(0, 200),
	};
}

export async function loadActivitySummary(
	runGit: ActivityGitRunner,
	now = new Date(),
): Promise<ActivitySummary> {
	try {
		return buildActivitySummary(parseGitLog(await runGit()), now);
	} catch {
		return unavailableActivitySummary(now);
	}
}
