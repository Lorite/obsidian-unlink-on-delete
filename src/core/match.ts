/** The parts of a deleted file that a link could have been written against. */
export interface LinkTarget {
	path: string;
	name: string;
	basename: string;
}

/** Protocol-style links that can never point at a vault file. */
const EXTERNAL_LINK = /^[a-z][a-z0-9+.-]*:/i;

export function isExternalLink(linktext: string): boolean {
	return EXTERNAL_LINK.test(linktext);
}

/**
 * Match a linkpath that no longer resolves against a deleted file, the way
 * Obsidian would have resolved it: a bare name matches on file name, while a
 * link that carries a folder has to match the full path.
 */
export function linkpathMatches(linkpath: string, target: LinkTarget): boolean {
	const candidate = decodePath(linkpath)
		.replace(/^\.\//, "")
		.replace(/^\/+/, "")
		.toLowerCase();
	if (candidate.length === 0) return false;

	const withoutExtension = candidate.replace(/\.md$/i, "");

	if (candidate.includes("/")) {
		const path = target.path.toLowerCase();
		return candidate === path || withoutExtension === path.replace(/\.md$/i, "");
	}

	return (
		candidate === target.name.toLowerCase() ||
		withoutExtension === target.basename.toLowerCase()
	);
}

/** Markdown links store percent-encoded paths, wikilinks do not. */
export function decodePath(path: string): string {
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}
