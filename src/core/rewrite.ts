import { App, Notice, moment } from "obsidian";
import type { FoundReference, ReferencingNote, RewriteResult } from "../types";
import { UnlinkOnDeleteSettings } from "../settings";
import { applyBodyEdits, compareKeys, editProperty } from "./edits";

/**
 * Rewrite every reference that was found, one note at a time.
 *
 * Body edits go through `Vault.process` so they stay atomic even if the note is
 * open, and frontmatter goes through `FileManager.processFrontMatter` so the YAML
 * is reserialised rather than patched by hand.
 */
export async function rewriteReferences(
	app: App,
	notes: ReferencingNote[],
	settings: UnlinkOnDeleteSettings,
): Promise<RewriteResult> {
	const result: RewriteResult = { notesChanged: 0, referencesRewritten: 0, referencesSkipped: 0 };
	const replacer = (reference: FoundReference) => replacementFor(reference, settings);

	for (const note of notes) {
		const body = note.references.filter((reference) => reference.kind !== "frontmatter");
		const frontmatter = note.references.filter((reference) => reference.kind === "frontmatter");
		let touched = false;

		if (body.length > 0) {
			try {
				await app.vault.process(note.file, (data) => {
					const edit = applyBodyEdits(data, body, replacer);
					result.referencesRewritten += edit.rewritten;
					result.referencesSkipped += edit.skipped;
					if (edit.rewritten > 0) touched = true;
					return edit.text;
				});
			} catch (error) {
				console.error(`Unlink on delete: could not rewrite ${note.file.path}`, error);
				new Notice(`Unlink on delete: could not rewrite ${note.file.path}`);
				result.referencesSkipped += body.length;
			}
		}

		if (frontmatter.length > 0) {
			try {
				await app.fileManager.processFrontMatter(note.file, (data: Record<string, unknown>) => {
					const tally = rewriteFrontmatter(data, frontmatter, settings);
					result.referencesRewritten += tally.rewritten;
					result.referencesSkipped += tally.skipped;
					if (tally.rewritten > 0) touched = true;
				});
			} catch (error) {
				console.error(`Unlink on delete: could not rewrite properties of ${note.file.path}`, error);
				new Notice(`Unlink on delete: could not rewrite properties of ${note.file.path}`);
				result.referencesSkipped += frontmatter.length;
			}
		}

		if (touched) result.notesChanged += 1;
	}

	return result;
}

/** Replacement text for a reference in the note body. */
export function replacementFor(
	reference: FoundReference,
	settings: UnlinkOnDeleteSettings,
): string {
	if (settings.mode === "strike") {
		const date = moment().format(settings.dateFormat);
		return `~~${reference.displayText}~~ (removed ${date})`;
	}
	return reference.displayText;
}

function rewriteFrontmatter(
	data: Record<string, unknown>,
	references: FoundReference[],
	settings: UnlinkOnDeleteSettings,
): { rewritten: number; skipped: number } {
	// Descending key order keeps array indices valid while entries are removed.
	const ordered = [...references].sort((a, b) => compareKeys(b.key ?? "", a.key ?? ""));
	let rewritten = 0;
	let skipped = 0;

	for (const reference of ordered) {
		if (!reference.key) {
			skipped += 1;
			continue;
		}
		const changed = editProperty(data, reference.key, (value) => {
			if (!value.includes(reference.original)) return { keep: true, value };
			// Strikethrough is markup, so properties always fall back to plain text.
			const replaced = value.split(reference.original).join(reference.displayText);
			const isWholeValue = replaced.trim() === reference.displayText.trim();
			if (settings.frontmatterAction === "remove" && isWholeValue) {
				return { keep: false, value: replaced };
			}
			return { keep: true, value: replaced };
		});
		if (changed) rewritten += 1;
		else skipped += 1;
	}

	return { rewritten, skipped };
}
