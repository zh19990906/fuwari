import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function read(relativePath) {
	return readFile(path.join(root, relativePath), "utf8");
}

test("documentation series cards keep equal heights and stable title alignment", async () => {
	const page = await read("src/pages/docs/index.astro");
	assert.match(page, /grid-cols-1 md:grid-cols-2[^\n"]*items-stretch/);
	assert.match(page, /btn-card[^\n"]*h-full[^\n"]*grid[^\n"]*grid-rows-\[auto_1fr\]/);
	assert.match(page, /flex items-start justify-between gap-4/);
	assert.match(page, /data-doc-group-description/);
});
