import { Notice, Plugin, TAbstractFile, TFile, TFolder, debounce } from "obsidian";
import { DEFAULT_SETTINGS, UnlinkOnDeleteSettings } from "./settings";
import { findReferences } from "./core/scan";
import { rewriteReferences } from "./core/rewrite";
import { ConfirmCleanupModal } from "./ui/confirm-modal";
import { UnlinkOnDeleteSettingTab } from "./ui/settings-tab";

/**
 * Deletions arrive one file at a time. Waiting a moment lets a multi-file delete
 * settle into a single pass, and gives the metadata cache time to catch up.
 */
const BATCH_DELAY_MS = 400;

export default class UnlinkOnDeletePlugin extends Plugin {
	settings: UnlinkOnDeleteSettings = DEFAULT_SETTINGS;

	private queue = new Map<string, TFile>();
	private running = false;

	private flush = debounce(() => void this.processQueue(), BATCH_DELAY_MS, true);

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new UnlinkOnDeleteSettingTab(this.app, this));

		// Registered inside onLayoutReady so the initial vault index does not look
		// like a burst of deletions on startup.
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.vault.on("delete", (file) => this.enqueue(file)));
		});
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<UnlinkOnDeleteSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private enqueue(file: TAbstractFile): void {
		if (!this.settings.enabled) return;

		for (const deleted of collectFiles(file)) {
			this.queue.set(deleted.path, deleted);
		}
		if (this.queue.size > 0) this.flush();
	}

	private async processQueue(): Promise<void> {
		if (this.running) {
			// Another batch is mid-flight. Come back once it is done.
			this.flush();
			return;
		}
		const deleted = [...this.queue.values()];
		this.queue.clear();
		if (deleted.length === 0) return;

		this.running = true;
		try {
			const notes = findReferences(this.app, deleted, this.settings);
			if (notes.length === 0) return;

			if (this.settings.confirmBeforeRewriting) {
				const modal = new ConfirmCleanupModal(this.app, deleted, notes, this.settings);
				if (!(await modal.openAndAwait())) return;
			}

			const result = await rewriteReferences(this.app, notes, this.settings);
			announce(result.notesChanged, result.referencesRewritten, result.referencesSkipped);
		} catch (error) {
			console.error("Unlink on delete: cleanup failed", error);
			new Notice("Unlink on delete: cleanup failed, see the developer console.");
		} finally {
			this.running = false;
		}
	}
}

/** Expand a deleted folder into the files it contained. */
function collectFiles(file: TAbstractFile): TFile[] {
	if (file instanceof TFile) return [file];
	if (file instanceof TFolder) return file.children.flatMap(collectFiles);
	return [];
}

function announce(notes: number, rewritten: number, skipped: number): void {
	if (rewritten === 0 && skipped === 0) return;
	const noun = rewritten === 1 ? "link" : "links";
	const where = notes === 1 ? "note" : "notes";
	const tail = skipped > 0 ? `, ${skipped} left alone` : "";
	new Notice(`Unlink on delete: cleaned ${rewritten} ${noun} in ${notes} ${where}${tail}.`);
}
