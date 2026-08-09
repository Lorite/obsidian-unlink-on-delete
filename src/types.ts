import type { TFile } from "obsidian";

/** Where a reference lives, which decides how it can be rewritten. */
export type ReferenceKind = "wikilink" | "embed" | "markdown" | "frontmatter";

/** A single reference in a note that pointed at a file that has just been deleted. */
export interface FoundReference {
	kind: ReferenceKind;
	/** The reference exactly as written in the note, for example `[[Foo|bar]]`. */
	original: string;
	/** The text Obsidian was displaying for the reference. */
	displayText: string;
	/** Offset of the first character of `original` in the note. Absent for frontmatter. */
	start?: number;
	/** Offset just past the last character of `original`. Absent for frontmatter. */
	end?: number;
	/** Frontmatter property path such as `projects.0`. Only set for frontmatter references. */
	key?: string;
}

/** One note that needs rewriting, with every reference found in it. */
export interface ReferencingNote {
	file: TFile;
	references: FoundReference[];
}

/** What happened during a rewrite pass. */
export interface RewriteResult {
	notesChanged: number;
	referencesRewritten: number;
	referencesSkipped: number;
}
