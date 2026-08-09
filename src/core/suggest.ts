// Type-only, so the ranking below stays runnable outside Obsidian for tests.
import type { App, TFile } from "obsidian";

/** A note offered as a replacement, with the reason it was offered. */
export interface Candidate {
	file: TFile;
	score: number;
	reason: string;
}

/** The facts about a note that ranking depends on, without needing a vault. */
export interface CandidateInfo {
	path: string;
	basename: string;
	aliases: string[];
}

/** The facts about the deleted file that ranking compares against. */
export interface DeletedInfo {
	path: string;
	basename: string;
	folder: string;
}

/** How many suggestions to put in front of the user before they start typing. */
const MAX_SUGGESTIONS = 30;

/**
 * Rank plausible replacements for a deleted note.
 *
 * These are *suggestions for a person to choose from*, never applied on their
 * own. That is the whole reason a fuzzy signal like name similarity is allowed
 * here at all: a wrong guess costs one glance, not a silently wrong link.
 */
export function suggestReplacements(app: App, deleted: TFile): Candidate[] {
	const info: DeletedInfo = {
		path: deleted.path,
		basename: deleted.basename,
		folder: deleted.parent?.path ?? "",
	};

	const candidates: Candidate[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (file.path === deleted.path) continue;
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		const scored = scoreCandidate(
			{ path: file.path, basename: file.basename, aliases: readAliases(frontmatter) },
			info,
		);
		if (scored) candidates.push({ file, ...scored });
	}

	candidates.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
	return candidates.slice(0, MAX_SUGGESTIONS);
}

/**
 * Score one candidate against the deleted note. Returns null when there is no
 * reason at all to suggest it.
 *
 * Kept free of Obsidian types so the ranking can be tested directly.
 */
export function scoreCandidate(
	candidate: CandidateInfo,
	deleted: DeletedInfo,
): { score: number; reason: string } | null {
	const name = deleted.basename.toLowerCase();
	const sameFolder = folderOf(candidate.path) === deleted.folder;

	// Strongest signal. Obsidian writes alias links as [[Real Name|alias]], so a
	// note claiming the deleted name as an alias is usually the note that
	// absorbed it.
	if (candidate.aliases.some((alias) => alias.toLowerCase() === name)) {
		return { score: 100, reason: "lists the deleted name as an alias" };
	}

	if (candidate.basename.toLowerCase() === name) {
		return { score: 80, reason: "same name in another folder" };
	}

	const similarity = tokenSimilarity(candidate.basename, deleted.basename);
	if (similarity > 0.3) {
		return {
			score: Math.round(60 * similarity) + (sameFolder ? 10 : 0),
			reason: sameFolder ? "similar name, same folder" : "similar name",
		};
	}

	if (sameFolder && similarity > 0) {
		return { score: 10, reason: "same folder" };
	}

	return null;
}

/** Jaccard overlap of the word sets of two note names. */
export function tokenSimilarity(a: string, b: string): number {
	const left = tokenize(a);
	const right = tokenize(b);
	if (left.size === 0 || right.size === 0) return 0;

	let shared = 0;
	for (const token of left) if (right.has(token)) shared += 1;
	const union = left.size + right.size - shared;
	return union === 0 ? 0 : shared / union;
}

function tokenize(name: string): Set<string> {
	return new Set(
		name
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length > 1),
	);
}

function folderOf(path: string): string {
	const cut = path.lastIndexOf("/");
	return cut === -1 ? "" : path.slice(0, cut);
}

/** Frontmatter aliases come as a string, a list, or not at all. */
export function readAliases(frontmatter: unknown): string[] {
	if (typeof frontmatter !== "object" || frontmatter === null) return [];
	const raw = (frontmatter as Record<string, unknown>).aliases ?? (frontmatter as Record<string, unknown>).alias;
	if (typeof raw === "string") return [raw];
	if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === "string");
	return [];
}
