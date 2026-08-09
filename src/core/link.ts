import type { FoundReference } from "../types";

/**
 * The heading or block part of a reference, starting with `#`, or an empty
 * string. `[[Foo#Results|bar]]` keeps pointing at `#Results` after a repoint.
 */
export function subpathOf(reference: FoundReference): string {
	const hash = reference.link.indexOf("#");
	return hash === -1 ? "" : reference.link.slice(hash);
}

/**
 * The alias the author actually wrote, or undefined when the reference just
 * displayed the file name.
 *
 * This is what decides whether a repointed link keeps its display text. A link
 * written as `[[Old Paper]]` should become `[[New Paper]]`, not
 * `[[New Paper|Old Paper]]`, which would keep showing the name of a note that
 * no longer exists. A link written as `[[Old Paper|that paper]]` keeps
 * "that paper", because the author chose those words.
 */
export function explicitAliasOf(reference: FoundReference): string | undefined {
	if (reference.kind === "embed") return undefined;
	// A markdown link always carries its own text: [that paper](Old%20Paper.md)
	if (reference.kind === "markdown") return reference.displayText || undefined;
	// A wikilink only has an alias if the author piped one in.
	const inner = reference.original.replace(/^!?\[\[/, "").replace(/\]\]$/, "");
	if (!inner.includes("|")) return undefined;
	return reference.displayText || undefined;
}
