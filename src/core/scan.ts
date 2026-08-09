import { App, TFile, getLinkpath, parseLinktext } from "obsidian";
import type { CachedMetadata, Reference, ReferenceCache } from "obsidian";
import type { FoundReference, ReferenceKind, ReferencingNote } from "../types";
import { UnlinkOnDeleteSettings, excludedFolderList, isExcluded } from "../settings";
import { isExternalLink, linkpathMatches } from "./match";

/**
 * Find every reference in the vault that pointed at one of the deleted files.
 *
 * This runs against the metadata cache rather than the disk, so it is cheap even
 * on a large vault. A reference is only reported when it no longer resolves to a
 * live file, which is what keeps a same-named note elsewhere in the vault from
 * being rewritten by accident.
 */
export function findReferences(
	app: App,
	deleted: TFile[],
	settings: UnlinkOnDeleteSettings,
): ReferencingNote[] {
	if (deleted.length === 0) return [];

	const deletedPaths = new Set(deleted.map((file) => file.path.toLowerCase()));
	const excluded = excludedFolderList(settings);
	const results: ReferencingNote[] = [];

	for (const note of app.vault.getMarkdownFiles()) {
		if (deletedPaths.has(note.path.toLowerCase())) continue;
		if (isExcluded(note.path, excluded)) continue;

		const cache = app.metadataCache.getFileCache(note);
		if (!cache) continue;

		const references = collectFromCache(app, cache, note.path, deleted, deletedPaths, settings);
		if (references.length > 0) results.push({ file: note, references });
	}

	return results;
}

function collectFromCache(
	app: App,
	cache: CachedMetadata,
	sourcePath: string,
	deleted: TFile[],
	deletedPaths: Set<string>,
	settings: UnlinkOnDeleteSettings,
): FoundReference[] {
	const found: FoundReference[] = [];

	const consider = (ref: Reference, kind: ReferenceKind, cacheItem?: ReferenceCache) => {
		const target = matchedTarget(app, ref.link, sourcePath, deleted, deletedPaths);
		if (!target) return;
		found.push({
			kind,
			original: ref.original,
			link: ref.link,
			displayText: displayTextOf(ref),
			targetPath: target.path,
			start: cacheItem?.position.start.offset,
			end: cacheItem?.position.end.offset,
			key: kind === "frontmatter" ? (ref as { key?: string }).key : undefined,
		});
	};

	for (const link of cache.links ?? []) {
		const kind: ReferenceKind = link.original.startsWith("[[") ? "wikilink" : "markdown";
		if (kind === "markdown" && !settings.handleMarkdownLinks) continue;
		consider(link, kind, link);
	}

	if (settings.handleEmbeds) {
		for (const embed of cache.embeds ?? []) consider(embed, "embed", embed);
	}

	if (settings.handleFrontmatter) {
		for (const link of cache.frontmatterLinks ?? []) consider(link, "frontmatter");
	}

	return found;
}

/** The text Obsidian was rendering for a reference, used as the unlinked replacement. */
function displayTextOf(ref: Reference): string {
	if (ref.displayText && ref.displayText.length > 0) return ref.displayText;
	const { path, subpath } = parseLinktext(ref.link);
	const tail = path.split("/").pop() ?? path;
	const cleaned = tail.replace(/\.md$/i, "");
	return cleaned.length > 0 ? cleaned : subpath.replace(/^#+/, "");
}

/**
 * Which deleted file a link written in `sourcePath` referred to, or null.
 * Links that still resolve to a live file are always left alone.
 */
function matchedTarget(
	app: App,
	linktext: string,
	sourcePath: string,
	deleted: TFile[],
	deletedPaths: Set<string>,
): TFile | null {
	if (isExternalLink(linktext)) return null;

	const linkpath = getLinkpath(linktext);
	if (linkpath.length === 0) return null;

	const dest = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
	if (dest) {
		// The cache can lag a beat behind the delete event, so a hit on a file we
		// know is gone still counts. Anything else is a live file: leave it be.
		return deletedPaths.has(dest.path.toLowerCase()) ? dest : null;
	}

	return deleted.find((file) => linkpathMatches(linkpath, file)) ?? null;
}
