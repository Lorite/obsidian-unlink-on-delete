import { Notice } from "obsidian";
import type { RewriteResult } from "../types";

/** Tell the user what just happened to their notes. */
export function announce(result: RewriteResult): void {
	const { notesChanged, referencesRewritten, referencesSkipped, referencesRepointed } = result;
	if (referencesRewritten === 0 && referencesSkipped === 0) return;

	const cleaned = referencesRewritten - referencesRepointed;
	const parts: string[] = [];
	if (cleaned > 0) parts.push(`cleaned ${cleaned} ${cleaned === 1 ? "link" : "links"}`);
	if (referencesRepointed > 0) parts.push(`repointed ${referencesRepointed}`);
	if (parts.length === 0) parts.push("changed nothing");

	const where = `${notesChanged} ${notesChanged === 1 ? "note" : "notes"}`;
	const tail = referencesSkipped > 0 ? `, ${referencesSkipped} left alone` : "";
	new Notice(`Unlink on delete: ${parts.join(", ")} in ${where}${tail}.`);
}
