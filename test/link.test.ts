import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explicitAliasOf, subpathOf } from "../src/core/link.ts";
import type { FoundReference, ReferenceKind } from "../src/types.ts";

function ref(
	kind: ReferenceKind,
	original: string,
	link: string,
	displayText: string,
): FoundReference {
	return { kind, original, link, displayText, targetPath: "Old Paper.md" };
}

describe("subpathOf", () => {
	it("finds a heading", () => {
		assert.equal(subpathOf(ref("wikilink", "[[Old Paper#Results]]", "Old Paper#Results", "x")), "#Results");
	});

	it("finds a block id", () => {
		assert.equal(subpathOf(ref("wikilink", "[[Old Paper#^abc123]]", "Old Paper#^abc123", "x")), "#^abc123");
	});

	it("returns empty for a plain link", () => {
		assert.equal(subpathOf(ref("wikilink", "[[Old Paper]]", "Old Paper", "Old Paper")), "");
	});
});

describe("explicitAliasOf", () => {
	it("keeps an alias the author wrote", () => {
		const r = ref("wikilink", "[[Old Paper|that paper]]", "Old Paper", "that paper");
		assert.equal(explicitAliasOf(r), "that paper");
	});

	it("drops the implicit display text of a bare wikilink", () => {
		// [[Old Paper]] must become [[New Paper]], never [[New Paper|Old Paper]],
		// which would keep showing the name of a note that no longer exists.
		const r = ref("wikilink", "[[Old Paper]]", "Old Paper", "Old Paper");
		assert.equal(explicitAliasOf(r), undefined);
	});

	it("keeps an alias on a link that also has a subpath", () => {
		const r = ref("wikilink", "[[Old Paper#Results|the results]]", "Old Paper#Results", "the results");
		assert.equal(explicitAliasOf(r), "the results");
	});

	it("never aliases an embed", () => {
		const r = ref("embed", "![[diagram.png]]", "diagram.png", "diagram.png");
		assert.equal(explicitAliasOf(r), undefined);
	});

	it("always keeps the text of a markdown link", () => {
		const r = ref("markdown", "[that paper](Old%20Paper.md)", "Old Paper.md", "that paper");
		assert.equal(explicitAliasOf(r), "that paper");
	});

	it("treats a piped frontmatter link like a wikilink", () => {
		assert.equal(
			explicitAliasOf(ref("frontmatter", "[[Old Paper|short]]", "Old Paper", "short")),
			"short",
		);
		assert.equal(
			explicitAliasOf(ref("frontmatter", "[[Old Paper]]", "Old Paper", "Old Paper")),
			undefined,
		);
	});
});
