# Unlink on Delete

Obsidian updates every link to a note when you **rename** it. When you **delete** it, the links are left behind, pointing nowhere. This plugin closes that gap: delete a file and the links that pointed at it are cleaned up straight away.

```
Before:  See [[Old Paper Note]] for the ATE numbers.
After:   See Old Paper Note for the ATE numbers.
```

## Why not a broken-link scanner

The other plugins in this space sweep the whole vault and strip everything that does not resolve. That is a different job, and it is destructive if you use unresolved links on purpose, as placeholders for notes you have not written yet. Many people do.

This plugin only ever touches links pointing at the file you just deleted, and only after confirming that the link no longer resolves to anything else. A link to a note you never created is never touched.

## Two ways to use it

**Delete first, clean up after.** Delete a file however you normally do. The plugin finds every reference to it and rewrites each one. Deleting a folder covers the files inside it, and deleting several files at once is handled as a single pass.

**Confirm before anything is deleted.** Use **Delete and clean up links** from a file's right-click menu, or the command *Delete current file and clean up links to it*. You see what points at the file, decide what happens to those links, and only then is the file deleted. Dismiss the dialog and nothing happens at all, neither the delete nor the edits.

The second path exists because Obsidian's own delete cannot be intercepted: `vault.on("delete")` fires once the file is already gone, and there is no cancellable pre-delete hook. So rather than pretend, the plugin offers a delete it owns end to end. It also ranks replacement notes better, since the file's own tags and links are still there to compare against instead of a best-effort copy of them.

Either way, it shows you what it is about to do first:

```
"Old Paper Note" deleted

4 links in 3 notes now point nowhere:
  tasks/Solve CLAWAR paper.md  (2)
  media/research/Foo - bar2024.md  (1)
  ai_chats/notes/Reading log.md  (1)

[ Unlink them ]   [ Leave them ]
```

### What it can clean up

| Kind | Example | Default |
| --- | --- | --- |
| Wikilinks | `[[Foo]]`, `[[Foo\|bar]]`, `[[Foo#Heading]]` | always on |
| Embeds | `![[Foo]]`, `![[diagram.png]]` | on |
| Markdown links | `[bar](Foo.md)` | on |
| Properties | `related: "[[Foo]]"`, `projects: ["[[Foo]]"]` | on |

### Pointing the links somewhere else instead

Sometimes a note is deleted because it was merged into another one, or replaced by a rewrite. For that, the dialog also lets you pick a note to **repoint** the links at, per deleted file. `[[Old Paper|that paper]]` becomes `[[New Paper|that paper]]`, keeping the alias you wrote and any `#heading` it pointed at, in whatever link style you have configured.

Candidates are suggested and ranked, with the reason shown next to each:

| Signal | Why it means something |
| --- | --- |
| Lists the deleted name as an alias | Obsidian writes alias links as `[[Real Name\|alias]]`, so a note claiming the old name usually absorbed it |
| Same name in another folder | The note was moved, and Obsidian did not see it as a rename |
| Similar name | Word overlap, ignoring numbers so dated note names do not all look alike |
| Shares tags | Weighted by how rare each tag is, see below |
| The deleted note linked to it | A note merged into another usually pointed at it first |
| Same folder | Weak on its own, never enough to suggest a note by itself |

Tags are read from the deleted note's own metadata, which Obsidian hands back when the file goes.

**Not every shared tag counts.** Two rules keep tag matching meaningful in a real vault:

- A tag on more than 5% of your notes is a filing convention, not a statement about one note, so it is ignored. Without this, a vault where everything is tagged `#work` suggests everything.
- A tag carried by nearly every note of a folder is implied by that folder, so it is ignored between two notes that already share it. This is what stops vaults that mirror their folder tree into tags from scoring every sibling note identically.

Rarer tags are worth more than common ones, so one specific shared tag outweighs three generic ones. The whole vault stays searchable, so a bad suggestion never boxes you in.

**Suggestions are never applied on their own.** That is deliberate: a broken link is loud and stays visible until you fix it, while a link silently repointed at the wrong note looks correct forever. Ranking is only ever used to order a list a person chooses from.

### What it leaves behind

Two options, in settings:

- **Plain text.** `[[Foo]]` becomes `Foo`, and `[[Foo|bar]]` becomes `bar`. The sentence still reads correctly and nothing is lost.
- **Struck through and dated.** `[[Foo]]` becomes `~~Foo~~ (removed 2026-08-09)`, so the note carries a visible record that something was deleted. The date format is configurable.

Properties are always left as plain text, since strikethrough is markup and would only be a literal string in YAML. You can instead have the value dropped from the property entirely.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Clean up links on delete | on | Master switch |
| Ask before rewriting | on | Turn off to rewrite silently with a notice |
| Offer to repoint links | on | Adds the replacement-note picker to the dialog |
| What to leave behind | Plain text | Plain text, or struck through and dated |
| Date format | `YYYY-MM-DD` | Moment.js format, strikethrough mode only |
| Embeds / Markdown links / Properties | on | Which reference kinds to include |
| What to do with a property | Keep the text | Or drop the value from the property |
| Folders to never rewrite | empty | One path per line, for templates and archives |

## Safety

This plugin edits your notes, and those edits are **not** undoable with Ctrl+Z, because they happen in files you do not have open. Before trusting it on a real vault:

- Keep the confirmation dialog on until you are happy with what it does.
- Use version control or Obsidian Sync version history, so a bad pass is recoverable.
- Add `templates` (and anything else you would rather it never touched) to the excluded folders.

Edits are applied through `Vault.process`, so they are atomic and safe on open notes, and each edit is verified against the text on disk before it is applied. Anything that no longer matches is reported as left alone rather than guessed at.

## Installation

Once it is in the community directory: **Settings → Community plugins → Browse**, search for *Unlink on Delete*.

Manually, until then: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/Lorite/obsidian-unlink-on-delete/releases/latest) into `<vault>/.obsidian/plugins/unlink-on-delete/`, then enable it under **Settings → Community plugins**.

## Development

```bash
npm install
npm run dev      # watch build
npm run build    # type-check and production build
npm run lint
```

## License

MIT
