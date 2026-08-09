// Type-only, so the ranking below stays runnable outside Obsidian for tests.
import type { App, CachedMetadata, TFile } from "obsidian";

/** A note offered as a replacement, with the reasons it was offered. */
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
	tags: string[];
}

/** The facts about the deleted file that ranking compares against. */
export interface DeletedInfo {
	path: string;
	basename: string;
	folder: string;
	tags: string[];
}

/** Vault-wide facts that stop common tags from drowning out real signal. */
export interface RankingContext {
	/** How many notes carry each tag, lowercased. */
	tagFrequency: Map<string, number>;
	/** How many notes carry each tag within each folder. */
	folderTagFrequency: Map<string, Map<string, number>>;
	/** How many notes each folder holds. */
	folderSize: Map<string, number>;
	noteCount: number;
	/** Paths the deleted note linked out to. */
	linkedFrom: Set<string>;
}

/** How many suggestions to put in front of the user before they start typing. */
const MAX_SUGGESTIONS = 30;

/**
 * A tag carried by nearly every note of a folder is implied by the folder, so
 * it says nothing extra about two notes that already share that folder. Vaults
 * that mirror their folder tree into tags would otherwise score every sibling
 * note identically.
 */
const FOLDER_IMPLIED_SHARE = 0.8;

/**
 * A tag on more than this share of the vault is a filing convention, not a
 * statement about one note. Vaults that mirror their folder tree into tags
 * would otherwise score thousands of notes as vaguely related to everything.
 */
const TAG_RARITY_GATE = 0.05;

/** Scales a shared tag's rarity into points. */
const TAG_WEIGHT = 3;

/** Most a note can earn from tags alone, however many it shares. */
const MAX_TAG_SCORE = 40;

/** Below this, a note is not worth putting in front of anyone. */
const MIN_SCORE = 15;

/**
 * Rank plausible replacements for a deleted note.
 *
 * These are *suggestions for a person to choose from*, never applied on their
 * own. That is the whole reason fuzzy signals like name and tag overlap are
 * allowed here at all: a wrong guess costs one glance, not a silently wrong
 * link.
 */
export function suggestReplacements(
	app: App,
	deleted: TFile,
	prevCache: CachedMetadata | null,
): Candidate[] {
	const files = app.vault.getMarkdownFiles();
	const infos = new Map<string, CandidateInfo>();
	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		infos.set(file.path, {
			path: file.path,
			basename: file.basename,
			aliases: readAliases(cache?.frontmatter),
			tags: readTags(cache),
		});
	}

	const info: DeletedInfo = {
		path: deleted.path,
		basename: deleted.basename,
		folder: deleted.parent?.path ?? "",
		tags: readTags(prevCache),
	};

	const context = buildRankingContext(
		[...infos.values()],
		outgoingLinksOf(app, deleted, prevCache),
	);

	const candidates: Candidate[] = [];
	for (const file of files) {
		if (file.path === deleted.path) continue;
		const candidateInfo = infos.get(file.path);
		if (!candidateInfo) continue;
		const scored = scoreCandidate(candidateInfo, info, context);
		if (scored) candidates.push({ file, ...scored });
	}

	candidates.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
	return candidates.slice(0, MAX_SUGGESTIONS);
}

/**
 * Score one candidate against the deleted note, accumulating every signal that
 * fires. Returns null when nothing worth showing came up.
 *
 * Kept free of Obsidian types so the ranking can be tested directly.
 */
export function scoreCandidate(
	candidate: CandidateInfo,
	deleted: DeletedInfo,
	context: RankingContext,
): { score: number; reason: string } | null {
	const name = deleted.basename.toLowerCase();
	const reasons: string[] = [];
	let score = 0;

	// Strongest signal. Obsidian writes alias links as [[Real Name|alias]], so a
	// note claiming the deleted name as an alias is usually the note that
	// absorbed it.
	if (candidate.aliases.some((alias) => alias.toLowerCase() === name)) {
		score += 100;
		reasons.push("lists the deleted name as an alias");
	} else if (candidate.basename.toLowerCase() === name) {
		score += 80;
		reasons.push("same name in another folder");
	} else {
		const similarity = tokenSimilarity(candidate.basename, deleted.basename);
		if (similarity > 0.3) {
			score += Math.round(50 * similarity);
			reasons.push("similar name");
		}
	}

	const sameFolder = folderOf(candidate.path) === deleted.folder;
	const shared = sharedTags(candidate.tags, deleted.tags, deleted.folder, sameFolder, context);
	if (shared.length > 0) {
		const weight = shared.reduce((sum, tag) => sum + tagWeight(tag, context), 0);
		score += Math.min(MAX_TAG_SCORE, Math.round(TAG_WEIGHT * weight));
		reasons.push(`shares ${describeTags(shared)}`);
	}

	if (context.linkedFrom.has(candidate.path)) {
		score += 25;
		reasons.push("the deleted note linked to it");
	}

	if (sameFolder) {
		score += 10;
		reasons.push("same folder");
	}

	if (score < MIN_SCORE || reasons.length === 0) return null;
	return { score, reason: reasons.join(", ") };
}

/**
 * Tags both notes carry that actually say something.
 *
 * A tag is dropped when the two notes already share a folder and that folder
 * implies the tag anyway, which is what happens in vaults that mirror their
 * folder tree into tags.
 */
export function sharedTags(
	candidateTags: string[],
	deletedTags: string[],
	deletedFolder: string,
	sameFolder: boolean,
	context: RankingContext,
): string[] {
	const mine = new Set(candidateTags.map((tag) => tag.toLowerCase()));
	const shared: string[] = [];

	for (const tag of new Set(deletedTags.map((tag) => tag.toLowerCase()))) {
		if (!mine.has(tag)) continue;
		if (isTooCommon(tag, context)) continue;
		if (sameFolder && isFolderImplied(tag, deletedFolder, context)) continue;
		shared.push(tag);
	}
	return shared.sort();
}

/** Whether a tag is so widespread that it is filing, not meaning. */
export function isTooCommon(tag: string, context: RankingContext): boolean {
	if (context.noteCount <= 0) return false;
	const seen = context.tagFrequency.get(tag.toLowerCase()) ?? 0;
	return seen > context.noteCount * TAG_RARITY_GATE;
}

/** How much a shared tag is worth: rarer across the vault means more. */
export function tagWeight(tag: string, context: RankingContext): number {
	const seen = context.tagFrequency.get(tag.toLowerCase()) ?? 1;
	if (context.noteCount <= 0 || seen <= 0) return 0;
	return Math.max(0, Math.log2(context.noteCount / seen));
}

/** Whether a folder's notes carry this tag so uniformly that it adds nothing. */
export function isFolderImplied(tag: string, folder: string, context: RankingContext): boolean {
	const size = context.folderSize.get(folder) ?? 0;
	if (size < 2) return false;
	const seen = context.folderTagFrequency.get(folder)?.get(tag.toLowerCase()) ?? 0;
	return seen >= size * FOLDER_IMPLIED_SHARE;
}

/** Count how tags are spread across the vault and within each folder. */
export function buildRankingContext(
	infos: CandidateInfo[],
	linkedFrom: Set<string> = new Set(),
): RankingContext {
	const tagFrequency = new Map<string, number>();
	const folderTagFrequency = new Map<string, Map<string, number>>();
	const folderSize = new Map<string, number>();

	for (const info of infos) {
		const folder = folderOf(info.path);
		folderSize.set(folder, (folderSize.get(folder) ?? 0) + 1);
		const perFolder = folderTagFrequency.get(folder) ?? new Map<string, number>();
		folderTagFrequency.set(folder, perFolder);

		for (const tag of new Set(info.tags.map((tag) => tag.toLowerCase()))) {
			tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
			perFolder.set(tag, (perFolder.get(tag) ?? 0) + 1);
		}
	}

	return { tagFrequency, folderTagFrequency, folderSize, noteCount: infos.length, linkedFrom };
}

function describeTags(tags: string[]): string {
	const shown = tags.slice(0, 3).join(", ");
	const extra = tags.length - 3;
	return extra > 0 ? `${shown} and ${extra} more` : shown;
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
			// Pure numbers make dated note names look alike: "2026-07-29 Scan"
			// would otherwise match the daily note "2026-07-29".
			.filter((token) => token.length > 1 && !/^\d+$/.test(token)),
	);
}

function folderOf(path: string): string {
	const cut = path.lastIndexOf("/");
	return cut === -1 ? "" : path.slice(0, cut);
}

/** Where the deleted note pointed. A merge target is often already linked. */
function outgoingLinksOf(app: App, deleted: TFile, prevCache: CachedMetadata | null): Set<string> {
	const paths = new Set<string>();
	if (!prevCache) return paths;

	for (const link of [...(prevCache.links ?? []), ...(prevCache.frontmatterLinks ?? [])]) {
		const linkpath = link.link.split("#")[0];
		if (!linkpath) continue;
		const dest = app.metadataCache.getFirstLinkpathDest(linkpath, deleted.path);
		if (dest) paths.add(dest.path);
	}
	return paths;
}

/** Frontmatter aliases come as a string, a list, or not at all. */
export function readAliases(frontmatter: unknown): string[] {
	return readStringField(frontmatter, ["aliases", "alias"]);
}

/**
 * Every tag on a note, from the frontmatter and from the body, normalised to a
 * single leading `#`.
 */
export function readTags(cache: unknown): string[] {
	if (typeof cache !== "object" || cache === null) return [];
	const record = cache as Record<string, unknown>;

	const fromFrontmatter = readStringField(record.frontmatter, ["tags", "tag"]);
	const inline: string[] = [];
	if (Array.isArray(record.tags)) {
		for (const entry of record.tags) {
			if (typeof entry === "object" && entry !== null) {
				const tag = (entry as Record<string, unknown>).tag;
				if (typeof tag === "string") inline.push(tag);
			}
		}
	}

	return [...fromFrontmatter, ...inline]
		.map((tag) => `#${tag.trim().replace(/^#+/, "")}`)
		.filter((tag) => tag.length > 1);
}

/** Read a frontmatter field that may be a string, a list, or absent. */
function readStringField(frontmatter: unknown, names: string[]): string[] {
	if (typeof frontmatter !== "object" || frontmatter === null) return [];
	const record = frontmatter as Record<string, unknown>;

	for (const name of names) {
		const raw = record[name];
		if (typeof raw === "string") {
			// Obsidian accepts a comma-separated string here as well as a list.
			return raw
				.split(",")
				.map((item) => item.trim())
				.filter((item) => item.length > 0);
		}
		if (Array.isArray(raw)) {
			return raw.filter((item): item is string => typeof item === "string");
		}
	}
	return [];
}
