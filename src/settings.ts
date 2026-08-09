/** How a reference to a deleted file is rewritten in the note body. */
export type RewriteMode = "unlink" | "strike";

/** What to do with a reference stored in a frontmatter property. */
export type FrontmatterAction = "unlink" | "remove";

export interface UnlinkOnDeleteSettings {
	/** Master switch. When off, deletions are ignored entirely. */
	enabled: boolean;
	mode: RewriteMode;
	/** Moment.js format used by the strikethrough mode. */
	dateFormat: string;
	confirmBeforeRewriting: boolean;
	/** Offer to point the links at another note instead of cleaning them up. */
	offerRepoint: boolean;
	handleEmbeds: boolean;
	handleMarkdownLinks: boolean;
	handleFrontmatter: boolean;
	frontmatterAction: FrontmatterAction;
	/** One folder path per line. Notes inside these folders are never rewritten. */
	excludedFolders: string;
}

export const DEFAULT_SETTINGS: UnlinkOnDeleteSettings = {
	enabled: true,
	mode: "unlink",
	dateFormat: "YYYY-MM-DD",
	confirmBeforeRewriting: true,
	offerRepoint: true,
	handleEmbeds: true,
	handleMarkdownLinks: true,
	handleFrontmatter: true,
	frontmatterAction: "unlink",
	excludedFolders: "",
};

/** Split the excluded folders setting into normalised, comparable prefixes. */
export function excludedFolderList(settings: UnlinkOnDeleteSettings): string[] {
	return settings.excludedFolders
		.split("\n")
		.map((line) => line.trim().replace(/^\/+|\/+$/g, ""))
		.filter((line) => line.length > 0)
		.map((line) => line.toLowerCase());
}

/** True when a note lives inside one of the excluded folders. */
export function isExcluded(path: string, excluded: string[]): boolean {
	const lower = path.toLowerCase();
	return excluded.some((folder) => lower === folder || lower.startsWith(`${folder}/`));
}
