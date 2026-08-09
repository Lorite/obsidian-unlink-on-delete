import { App, ButtonComponent, Modal, Setting, TFile } from "obsidian";
import type { CleanupDecision, ReferencingNote, RepointChoices } from "../types";
import { UnlinkOnDeleteSettings } from "../settings";
import { suggestReplacements } from "../core/suggest";
import { NotePickerModal } from "./note-picker";

/** How many notes to list before collapsing the rest into a summary line. */
const MAX_LISTED = 40;

/**
 * Ask before touching anyone's notes.
 *
 * Beyond confirming, this is where a deleted file's links can be pointed at a
 * different note instead of being unlinked, one deleted file at a time.
 */
export class ConfirmCleanupModal extends Modal {
	private resolve: ((decision: CleanupDecision) => void) | null = null;
	private confirmed = false;
	private repoints: RepointChoices = new Map();

	constructor(
		app: App,
		private deleted: TFile[],
		private notes: ReferencingNote[],
		private settings: UnlinkOnDeleteSettings,
	) {
		super(app);
	}

	openAndAwait(): Promise<CleanupDecision> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const only = this.deleted.length === 1 ? this.deleted[0] : undefined;
		this.setTitle(only ? `"${only.basename}" deleted` : `${this.deleted.length} files deleted`);
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		const total = this.notes.reduce((sum, note) => sum + note.references.length, 0);
		contentEl.createEl("p", {
			text: `${countLabel(total, "link", "links")} in ${countLabel(
				this.notes.length,
				"note",
				"notes",
			)} now point nowhere:`,
		});

		const list = contentEl.createEl("ul", { cls: "unlink-on-delete-list" });
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

		if (this.settings.offerRepoint) this.renderRepointRows(contentEl);

		contentEl.createEl("p", { cls: "unlink-on-delete-hint", text: this.hintText() });

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		new ButtonComponent(buttons)
			.setButtonText(this.confirmLabel())
			.setCta()
			.onClick(() => {
				this.confirmed = true;
				this.close();
			});
		new ButtonComponent(buttons).setButtonText("Leave them").onClick(() => this.close());
	}

	private renderRepointRows(contentEl: HTMLElement): void {
		new Setting(contentEl).setName("Point the links somewhere else instead").setHeading();

		for (const file of this.deleted) {
			const chosen = this.repoints.get(file.path);
			const setting = new Setting(contentEl)
				.setName(file.basename)
				.setDesc(chosen ? `Links will point at ${chosen.path}` : "Links will be cleaned up");

			setting.addButton((button) =>
				button.setButtonText(chosen ? "Change…" : "Repoint to…").onClick(() => {
					new NotePickerModal(this.app, file.basename, suggestReplacements(this.app, file), (picked) => {
						this.repoints.set(file.path, picked);
						this.render();
					}).open();
				}),
			);

			if (chosen) {
				setting.addExtraButton((button) =>
					button
						.setIcon("x")
						.setTooltip("Clean up instead")
						.onClick(() => {
							this.repoints.delete(file.path);
							this.render();
						}),
				);
			}
		}
	}

	private confirmLabel(): string {
		if (this.repoints.size > 0) return "Apply";
		return this.settings.mode === "strike" ? "Strike them through" : "Unlink them";
	}

	private hintText(): string {
		const tail = " This edits your notes and cannot be undone with Ctrl+Z.";
		if (this.repoints.size > 0) {
			return `Links to the notes above are repointed, the rest are cleaned up.${tail}`;
		}
		return this.settings.mode === "strike"
			? `Each link becomes struck-through text with today's date.${tail}`
			: `Each link becomes plain text, keeping what it displayed.${tail}`;
	}

	onClose(): void {
		this.contentEl.empty();
		const repoints: RepointChoices = this.confirmed ? this.repoints : new Map<string, TFile>();
		this.resolve?.({ confirmed: this.confirmed, repoints });
		this.resolve = null;
	}
}

function countLabel(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}
