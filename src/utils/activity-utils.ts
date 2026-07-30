import { execFile } from "node:child_process";
import {
	ACTIVITY_TIMEZONE,
	type ActivitySummary,
	buildActivitySummary,
	parseGitLog,
} from "./activity-core";

export type ActivityGitRunner = () => Promise<string>;

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

async function readGitLog(): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			"git",
			[
				"log",
				"HEAD",
				"--since=180 days ago",
				"--date=iso-strict",
				"--pretty=format:%H%x1f%P%x1f%cI%x1f%s%x1f%b%x1e",
			],
			{ encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
			(error, stdout) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stdout);
			},
		);
	});
}

export async function loadActivitySummary(
	runGit: ActivityGitRunner = readGitLog,
	now = new Date(),
): Promise<ActivitySummary> {
	try {
		return buildActivitySummary(parseGitLog(await runGit()), now);
	} catch {
		return unavailableActivitySummary(now);
	}
}

let cachedActivitySummary: Promise<ActivitySummary> | undefined;

export function getActivitySummary(): Promise<ActivitySummary> {
	cachedActivitySummary ??= loadActivitySummary();
	return cachedActivitySummary;
}
