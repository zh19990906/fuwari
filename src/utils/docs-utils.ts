import { type CollectionEntry, getCollection } from "astro:content";
import { docsGroups } from "../config/docs";
import {
	type DocEntryLike,
	type DocGroupConfig,
	type DocNavigation,
	type DocSection,
	getDocNavigation,
	groupDocsBySection,
	sortDocEntries,
	sortDocGroups,
	validateDocsConfiguration,
} from "./docs-core";

export type DocumentationEntry = DocEntryLike & {
	entry: CollectionEntry<"posts">;
	contentType: "docs";
	docGroup: string;
};

export type DocsGroupSummary = {
	group: DocGroupConfig;
	entries: DocumentationEntry[];
	sections: DocSection<DocumentationEntry>[];
	count: number;
};

export type DocsArticleContext = DocsGroupSummary & {
	currentSlug: string;
	navigation: DocNavigation<DocumentationEntry>;
};

async function getVisiblePosts(): Promise<CollectionEntry<"posts">[]> {
	return getCollection("posts", ({ data }) =>
		import.meta.env.PROD ? data.draft !== true : true,
	);
}

function toCoreEntry(entry: CollectionEntry<"posts">): DocEntryLike {
	return {
		slug: entry.slug,
		title: entry.data.title,
		contentType: entry.data.contentType,
		docGroup: entry.data.docGroup?.trim(),
		docSection: entry.data.docSection?.trim(),
		docOrder: entry.data.docOrder,
	};
}

function toDocumentationEntry(
	entry: CollectionEntry<"posts">,
): DocumentationEntry | undefined {
	if (entry.data.contentType !== "docs" || !entry.data.docGroup)
		return undefined;
	return {
		...toCoreEntry(entry),
		entry,
		contentType: "docs",
		docGroup: entry.data.docGroup.trim(),
	};
}

async function loadDocumentationEntries(): Promise<DocumentationEntry[]> {
	const posts = await getVisiblePosts();
	const coreEntries = posts.map(toCoreEntry);
	validateDocsConfiguration(docsGroups, coreEntries);
	return sortDocEntries(
		posts
			.map(toDocumentationEntry)
			.filter((entry): entry is DocumentationEntry => entry !== undefined),
	);
}

export async function getDocsGroupSummaries(): Promise<DocsGroupSummary[]> {
	const entries = await loadDocumentationEntries();
	return sortDocGroups(docsGroups).map((group) => {
		const groupEntries = entries.filter(
			(entry) => entry.docGroup === group.slug,
		);
		return {
			group,
			entries: groupEntries,
			sections: groupDocsBySection(groupEntries),
			count: groupEntries.length,
		};
	});
}

export async function getDocsForGroup(
	groupSlug: string,
): Promise<DocsGroupSummary | undefined> {
	const normalizedSlug = groupSlug.trim();
	return (await getDocsGroupSummaries()).find(
		(summary) => summary.group.slug === normalizedSlug,
	);
}

export async function getDocsContextForEntry(
	entry: CollectionEntry<"posts">,
): Promise<DocsArticleContext | undefined> {
	if (entry.data.contentType !== "docs" || !entry.data.docGroup)
		return undefined;
	const summary = await getDocsForGroup(entry.data.docGroup);
	if (!summary) {
		throw new Error(
			`Documentation entry ${entry.slug} references unknown group ${entry.data.docGroup}`,
		);
	}
	return {
		...summary,
		currentSlug: entry.slug,
		navigation: getDocNavigation(summary.entries, entry.slug),
	};
}
