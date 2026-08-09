import { App, PluginSettingTab, Setting, moment } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type UnlinkOnDeletePlugin from "../main";
import type { FrontmatterAction, RewriteMode, UnlinkOnDeleteSettings } from "../settings";

type SettingKey = keyof UnlinkOnDeleteSettings;

export class UnlinkOnDeleteSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: UnlinkOnDeletePlugin,
	) {
		super(app, plugin);
	}

	/**
	 * Declarative definitions, so the settings show up in Obsidian's settings
	 * search on 1.13.0 and later. Older versions fall back to display() below.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Clean up links on delete",
				desc: "Rewrite links to a file as soon as that file is deleted.",
				aliases: ["broken links", "unlink", "dangling"],
				control: { type: "toggle", key: "enabled" satisfies SettingKey },
			},
			{
				name: "Ask before rewriting",
				desc: "Show the affected notes and wait for confirmation. Turn off to rewrite silently.",
				aliases: ["confirm", "dialog", "prompt"],
				control: { type: "toggle", key: "confirmBeforeRewriting" satisfies SettingKey },
			},
			{
				type: "group",
				heading: "Rewriting",
				items: [
					{
						name: "What to leave behind",
						desc: "How a link is rewritten once its target is gone.",
						aliases: ["strikethrough", "plain text", "mode"],
						control: {
							type: "dropdown",
							key: "mode" satisfies SettingKey,
							options: {
								unlink: "Plain text, keeping what the link displayed",
								strike: "Struck through, with the date it was removed",
							},
						},
					},
					{
						name: "Date format",
						desc: "Moment.js format for the date written into the note. Only used by the struck-through option above.",
						aliases: ["moment", "timestamp"],
						control: {
							type: "text",
							key: "dateFormat" satisfies SettingKey,
							placeholder: "YYYY-MM-DD",
							validate: (value: string) =>
								value.trim().length === 0 ? "Enter a date format." : undefined,
						},
					},
				],
			},
			{
				type: "group",
				heading: "What to include",
				items: [
					{
						name: "Embeds",
						desc: "Embedded notes, images and attachments, written with a leading exclamation mark.",
						aliases: ["transclusion", "attachment", "image"],
						control: { type: "toggle", key: "handleEmbeds" satisfies SettingKey },
					},
					{
						name: "Markdown links",
						desc: "The other link style, written with parentheses instead of brackets.",
						aliases: ["inline link"],
						control: { type: "toggle", key: "handleMarkdownLinks" satisfies SettingKey },
					},
					{
						name: "Properties",
						desc: "Links stored in frontmatter, such as a related or project property.",
						aliases: ["frontmatter", "yaml", "metadata"],
						control: { type: "toggle", key: "handleFrontmatter" satisfies SettingKey },
					},
					{
						name: "What to do with a property",
						desc: "Applies when Properties is on. Properties are always left as plain text rather than markup, so the strikethrough option does not apply to them.",
						aliases: ["frontmatter", "yaml"],
						control: {
							type: "dropdown",
							key: "frontmatterAction" satisfies SettingKey,
							options: {
								unlink: "Keep the text without the brackets",
								remove: "Drop the value from the property",
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: "Exclusions",
				items: [
					{
						name: "Folders to never rewrite",
						desc: "One folder path per line. Notes inside them are listed but left untouched.",
						aliases: ["ignore", "exclude", "templates"],
						control: {
							type: "textarea",
							key: "excludedFolders" satisfies SettingKey,
							placeholder: "templates\narchive",
							rows: 4,
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as SettingKey];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		Object.assign(this.plugin.settings, { [key]: value });
		await this.plugin.saveSettings();
	}

	/**
	 * Imperative fallback for Obsidian versions older than 1.13.0, which have no
	 * declarative settings API. Newer versions never call this.
	 */
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
