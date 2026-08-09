import { App, Notice, TFile } from "obsidian";
import type { RepointChoices } from "../types";
import { UnlinkOnDeleteSettings } from "../settings";
import { findReferences } from "./scan";
import { rewriteReferences } from "./rewrite";
import { ConfirmCleanupModal } from "../ui/confirm-modal";
import { announce } from "../ui/notice";

/**
 * Delete a file only once its link cleanup has been confirmed.
 *
 * Obsidian's own delete cannot be intercepted: `vault.on("delete")` fires after
 * the file is already gone, and there is no cancellable pre-delete hook. So this
 * owns the whole sequence instead, and the file survives untouched if the dialog
 * is dismissed.
 *
 * Scanning first also means the file's own tags and links are still there to
 * rank replacement notes with, rather than a best-effort cache of them.
 */
export async function deleteWithCleanup(
	app: App,
	file: TFile,
	settings: UnlinkOnDeleteSettings,
	onSelfDelete: (path: string) => void,
): Promise<void> {
	const notes = settings.enabled ? findReferences(app, [file], settings) : [];
	let repoints: RepointChoices = new Map();

	if (notes.length > 0) {
		const caches = new Map([[file.path, app.metadataCache.getFileCache(file)]]);
		const modal = new ConfirmCleanupModal(app, [file], notes, settings, caches, true);
		const decision = await modal.openAndAwait();
		// Dismissed, so nothing is deleted and nothing is rewritten.
		if (!decision.confirmed) return;
		repoints = decision.repoints;
	}

	// Tell the vault listener to keep its hands off: this one is already handled.
	onSelfDelete(file.path);
	try {
		await app.fileManager.trashFile(file);
	} catch (error) {
		console.error(`Unlink on delete: could not delete ${file.path}`, error);
		new Notice(`Unlink on delete: could not delete ${file.path}`);
		return;
	}

	if (notes.length === 0) {
		new Notice(`Unlink on delete: deleted "${file.basename}", nothing linked to it.`);
		return;
	}

	announce(await rewriteReferences(app, notes, settings, repoints));
}
