import { App, ButtonComponent, Modal, TFile } from "obsidian";
import type { ReferencingNote } from "../types";
import { UnlinkOnDeleteSettings } from "../settings";

/** How many notes to list before collapsing the rest into a summary line. */
const MAX_LISTED = 40;

/**
 * Ask before touching anyone's notes. Resolves true when the user confirms.
 */
export class ConfirmCleanupModal extends Modal {
	private resolve: ((confirmed: boolean) => void) | null = null;
	private confirmed = false;

	constructor(
		app: App,
		private deleted: TFile[],
		private notes: ReferencingNote[],
		private settings: UnlinkOnDeleteSettings,
	) {
		super(app);
	}

	openAndAwait(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const total = this.notes.reduce((sum, note) => sum + note.references.length, 0);
		const only = this.deleted.length === 1 ? this.deleted[0] : undefined;
		const deletedLabel = only ? `"${only.basename}"` : `${this.deleted.length} files`;

		this.setTitle(`${deletedLabel} deleted`);

		this.contentEl.createEl("p", {
			text: `${countLabel(total, "link", "links")} in ${countLabel(
				this.notes.length,
				"note",
				"notes",
			)} now point nowhere:`,
		});

		const list = this.contentEl.createEl("ul", { cls: "unlink-on-delete-list" });
		for (const note of this.notes.slice(0, MAX_LISTED)) {
			const item = list.createEl("li");
			item.createSpan({ cls: "unlink-on-delete-path", text: note.file.path });
			item.createSpan({
				cls: "unlink-on-delete-count",
				text: ` (${note.references.length})`,
			});
		}
		if (this.notes.length > MAX_LISTED) {
			list.createEl("li", { text: `and ${this.notes.length - MAX_LISTED} more…` });
		}

		this.contentEl.createEl("p", {
			cls: "unlink-on-delete-hint",
			text:
				this.settings.mode === "strike"
					? "Each link becomes struck-through text with today's date. This edits your notes and cannot be undone with Ctrl+Z."
					: "Each link becomes plain text, keeping what it displayed. This edits your notes and cannot be undone with Ctrl+Z.",
		});

		const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
		new ButtonComponent(buttons)
			.setButtonText(this.settings.mode === "strike" ? "Strike them through" : "Unlink them")
			.setCta()
			.onClick(() => {
				this.confirmed = true;
				this.close();
			});
		new ButtonComponent(buttons).setButtonText("Leave them").onClick(() => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolve?.(this.confirmed);
		this.resolve = null;
	}
}

function countLabel(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}
