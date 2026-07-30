export type DocGroupConfig = {
	slug: string;
	title: string;
	description?: string;
	order: number;
};

export type DocEntryLike = {
	slug: string;
	title: string;
	contentType?: "post" | "docs";
	docGroup?: string;
	docSection?: string;
	docOrder?: number;
};

export type DocSection<T extends DocEntryLike = DocEntryLike> = {
	name: string;
	entries: T[];
};

export type DocNavigation<T extends DocEntryLike = DocEntryLike> = {
	previous?: T;
	next?: T;
};

const CHINESE_COLLATOR = new Intl.Collator("zh-CN");

function normalizeValue(value?: string): string {
	return value?.trim() ?? "";
}

function compareText(left: string, right: string): number {
	return CHINESE_COLLATOR.compare(left, right);
}

function compareSections(left: string, right: string): number {
	if (left === right) return 0;
	if (!left) return 1;
	if (!right) return -1;
	return compareText(left, right);
}

function compareDocEntries<T extends DocEntryLike>(left: T, right: T): number {
	const sectionResult = compareSections(
		normalizeValue(left.docSection),
		normalizeValue(right.docSection),
	);
	if (sectionResult !== 0) return sectionResult;

	const orderResult =
		(left.docOrder ?? Number.MAX_SAFE_INTEGER) -
		(right.docOrder ?? Number.MAX_SAFE_INTEGER);
	if (orderResult !== 0) return orderResult;

	const titleResult = compareText(left.title, right.title);
	if (titleResult !== 0) return titleResult;
	return compareText(left.slug, right.slug);
}

export function sortDocGroups(groups: DocGroupConfig[]): DocGroupConfig[] {
	return [...groups].sort((left, right) => {
		const orderResult = left.order - right.order;
		if (orderResult !== 0) return orderResult;
		const titleResult = compareText(left.title, right.title);
		if (titleResult !== 0) return titleResult;
		return compareText(left.slug, right.slug);
	});
}

export function sortDocEntries<T extends DocEntryLike>(entries: T[]): T[] {
	return entries
		.filter((entry) => entry.contentType === "docs")
		.sort(compareDocEntries);
}

export function groupDocsBySection<T extends DocEntryLike>(
	entries: T[],
): DocSection<T>[] {
	const sections = new Map<string, T[]>();
	for (const entry of sortDocEntries(entries)) {
		const sectionName = normalizeValue(entry.docSection);
		const sectionEntries = sections.get(sectionName) ?? [];
		sectionEntries.push(entry);
		sections.set(sectionName, sectionEntries);
	}

	return [...sections.entries()]
		.sort(([left], [right]) => compareSections(left, right))
		.map(([name, sectionEntries]) => ({ name, entries: sectionEntries }));
}

export function getDocNavigation<T extends DocEntryLike>(
	entries: T[],
	currentSlug: string,
): DocNavigation<T> {
	const sortedEntries = sortDocEntries(entries);
	const currentIndex = sortedEntries.findIndex(
		(entry) => entry.slug === currentSlug,
	);
	if (currentIndex < 0) return {};

	return {
		previous: sortedEntries[currentIndex - 1],
		next: sortedEntries[currentIndex + 1],
	};
}

export function validateDocsConfiguration(
	groups: DocGroupConfig[],
	entries: DocEntryLike[],
): void {
	const groupSlugs = new Set<string>();
	for (const group of groups) {
		const slug = normalizeValue(group.slug);
		if (groupSlugs.has(slug)) {
			throw new Error(`Duplicate documentation group slug: ${slug}`);
		}
		groupSlugs.add(slug);
	}

	for (const entry of entries) {
		if (entry.contentType !== "docs") continue;
		const groupSlug = normalizeValue(entry.docGroup);
		if (!groupSlug) {
			throw new Error(`Documentation entry ${entry.slug} is missing docGroup`);
		}
		if (!groupSlugs.has(groupSlug)) {
			throw new Error(
				`Documentation entry ${entry.slug} references unknown group ${groupSlug}`,
			);
		}
	}
}
