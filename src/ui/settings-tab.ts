import { App, PluginSettingTab, Setting, moment } from "obsidian";
import type UnlinkOnDeletePlugin from "../main";
import type { FrontmatterAction, RewriteMode } from "../settings";

export class UnlinkOnDeleteSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: UnlinkOnDeletePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Clean up links on delete")
			.setDesc("Rewrite links to a file as soon as that file is deleted.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Ask before rewriting")
			.setDesc("Show the affected notes and wait for confirmation. Turn off to rewrite silently.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.confirmBeforeRewriting).onChange(async (value) => {
					this.plugin.settings.confirmBeforeRewriting = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Rewriting").setHeading();

		new Setting(containerEl)
			.setName("What to leave behind")
			.setDesc("How a link is rewritten once its target is gone.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("unlink", "Plain text, keeping what the link displayed")
					.addOption("strike", "Struck through, with the date it was removed")
					.setValue(this.plugin.settings.mode)
					.onChange(async (value) => {
						this.plugin.settings.mode = value as RewriteMode;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (this.plugin.settings.mode === "strike") {
			new Setting(containerEl)
				.setName("Date format")
				.setDesc(
					`Moment.js format for the date in the note. Today looks like: ${moment().format(
						this.plugin.settings.dateFormat || "YYYY-MM-DD",
					)}`,
				)
				.addText((text) =>
					text
						.setPlaceholder("YYYY-MM-DD")
						.setValue(this.plugin.settings.dateFormat)
						.onChange(async (value) => {
							this.plugin.settings.dateFormat = value || "YYYY-MM-DD";
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(containerEl).setName("What to include").setHeading();

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Inline wikilinks are always cleaned up. These control everything else.",
		});

		new Setting(containerEl)
			.setName("Embeds")
			.setDesc("Embedded notes, images and attachments, written with a leading exclamation mark.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.handleEmbeds).onChange(async (value) => {
					this.plugin.settings.handleEmbeds = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Markdown links")
			.setDesc("The other link style, written with parentheses instead of brackets.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.handleMarkdownLinks).onChange(async (value) => {
					this.plugin.settings.handleMarkdownLinks = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Properties")
			.setDesc("Links stored in frontmatter, such as a related or project property.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.handleFrontmatter).onChange(async (value) => {
					this.plugin.settings.handleFrontmatter = value;
					await this.plugin.saveSettings();
					this.display();
				}),
			);

		if (this.plugin.settings.handleFrontmatter) {
			new Setting(containerEl)
				.setName("What to do with a property")
				.setDesc(
					"Properties are always left as plain text rather than markup, so the strikethrough option does not apply to them.",
				)
				.addDropdown((dropdown) =>
					dropdown
						.addOption("unlink", "Keep the text without the brackets")
						.addOption("remove", "Drop the value from the property")
						.setValue(this.plugin.settings.frontmatterAction)
						.onChange(async (value) => {
							this.plugin.settings.frontmatterAction = value as FrontmatterAction;
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(containerEl).setName("Exclusions").setHeading();

		new Setting(containerEl)
			.setName("Folders to never rewrite")
			.setDesc("One folder path per line. Notes inside them are listed but left untouched.")
			.addTextArea((text) =>
				text
					.setPlaceholder("templates\narchive")
					.setValue(this.plugin.settings.excludedFolders)
					.onChange(async (value) => {
						this.plugin.settings.excludedFolders = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
