import { App, FuzzySuggestModal, TFile } from "obsidian";
import type { FuzzyMatch } from "obsidian";
import type { Candidate } from "../core/suggest";

/**
 * Pick the note a deleted file's links should point at instead.
 *
 * The ranked suggestions are shown first, with the reason each was suggested,
 * but the whole vault stays searchable so a bad guess never boxes anyone in.
 */
export class NotePickerModal extends FuzzySuggestModal<TFile> {
	private reasons = new Map<string, string>();
	private items: TFile[];

	constructor(
		app: App,
		deletedName: string,
		suggestions: Candidate[],
		private onPick: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder(`Point links from "${deletedName}" at…`);

		for (const candidate of suggestions) {
			this.reasons.set(candidate.file.path, candidate.reason);
		}

		// Suggestions first, in ranked order, then the rest of the vault.
		const ranked = suggestions.map((candidate) => candidate.file);
		const seen = new Set(ranked.map((file) => file.path));
		const rest = this.app.vault
			.getMarkdownFiles()
			.filter((file) => !seen.has(file.path))
			.sort((a, b) => a.path.localeCompare(b.path));
		this.items = [...ranked, ...rest];
	}

	getItems(): TFile[] {
		return this.items;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	renderSuggestion(item: FuzzyMatch<TFile>, el: HTMLElement): void {
		super.renderSuggestion(item, el);
		const reason = this.reasons.get(item.item.path);
		if (reason) {
			el.createDiv({ cls: "unlink-on-delete-reason", text: reason });
		}
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}
