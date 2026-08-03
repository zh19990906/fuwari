import { execFile } from "node:child_process";
import { type ActivitySummary, loadActivitySummary } from "./activity-core";

async function readGitLog(): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			"git",
			[
				"log",
				"HEAD",
				"--first-parent",
				"--since=180 days ago",
				"--date=iso-strict",
				"--pretty=format:%H%x1f%P%x1f%cI%x1f%s%x1f%b%x1e",
			],
			{ encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
			(error: Error | null, stdout: string) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stdout);
			},
		);
	});
}

let cachedActivitySummary: Promise<ActivitySummary> | undefined;

export function getActivitySummary(): Promise<ActivitySummary> {
	cachedActivitySummary ??= loadActivitySummary(readGitLog);
	return cachedActivitySummary;
}
