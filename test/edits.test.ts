import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyBodyEdits, compareKeys, editProperty } from "../src/core/edits.ts";
import type { FoundReference } from "../src/types.ts";

/** Build a reference positioned at the first occurrence of `original` in `text`. */
function refIn(text: string, original: string, displayText: string): FoundReference {
	const start = text.indexOf(original);
	return { kind: "wikilink", original, displayText, start, end: start + original.length };
}

const unlink: (reference: FoundReference) => string = (reference) => reference.displayText;

describe("applyBodyEdits", () => {
	it("unlinks a single wikilink", () => {
		const text = "See [[Old Paper]] for the numbers.";
		const out = applyBodyEdits(text, [refIn(text, "[[Old Paper]]", "Old Paper")], unlink);
		assert.equal(out.text, "See Old Paper for the numbers.");
		assert.equal(out.rewritten, 1);
		assert.equal(out.skipped, 0);
	});

	it("keeps the alias of a piped link", () => {
		const text = "See [[Old Paper|that paper]] again.";
		const out = applyBodyEdits(text, [refIn(text, "[[Old Paper|that paper]]", "that paper")], unlink);
		assert.equal(out.text, "See that paper again.");
	});

	it("rewrites several links in one note without shifting offsets", () => {
		const text = "[[Old Paper]] and [[Old Paper|it]] and [[Old Paper#Results]].";
		const refs = [
			{ ...refIn(text, "[[Old Paper]]", "Old Paper") },
			{
				kind: "wikilink" as const,
				original: "[[Old Paper|it]]",
				displayText: "it",
				start: text.indexOf("[[Old Paper|it]]"),
				end: text.indexOf("[[Old Paper|it]]") + "[[Old Paper|it]]".length,
			},
			{
				kind: "wikilink" as const,
				original: "[[Old Paper#Results]]",
				displayText: "Old Paper > Results",
				start: text.indexOf("[[Old Paper#Results]]"),
				end: text.indexOf("[[Old Paper#Results]]") + "[[Old Paper#Results]]".length,
			},
		];
		const out = applyBodyEdits(text, refs, unlink);
		assert.equal(out.text, "Old Paper and it and Old Paper > Results.");
		assert.equal(out.rewritten, 3);
	});

	it("applies the strikethrough replacement", () => {
		const text = "See [[Old Paper]].";
		const out = applyBodyEdits(
			text,
			[refIn(text, "[[Old Paper]]", "Old Paper")],
			(reference) => `~~${reference.displayText}~~ (removed 2026-08-09)`,
		);
		assert.equal(out.text, "See ~~Old Paper~~ (removed 2026-08-09).");
	});

	it("skips a reference whose offset no longer matches the file", () => {
		const stale: FoundReference = {
			kind: "wikilink",
			original: "[[Old Paper]]",
			displayText: "Old Paper",
			start: 4,
			end: 17,
		};
		const out = applyBodyEdits("The note was edited since the cache was built.", [stale], unlink);
		assert.equal(out.text, "The note was edited since the cache was built.");
		assert.equal(out.rewritten, 0);
		assert.equal(out.skipped, 1);
	});

	it("skips a reference with no offsets", () => {
		const out = applyBodyEdits("text", [
			{ kind: "frontmatter", original: "[[Old Paper]]", displayText: "Old Paper" },
		], unlink);
		assert.equal(out.skipped, 1);
	});

	it("strips the exclamation mark of an embed along with the brackets", () => {
		const text = "Diagram: ![[diagram.png]]";
		const out = applyBodyEdits(text, [
			{
				kind: "embed",
				original: "![[diagram.png]]",
				displayText: "diagram.png",
				start: text.indexOf("![["),
				end: text.length,
			},
		], unlink);
		assert.equal(out.text, "Diagram: diagram.png");
	});
});

describe("editProperty", () => {
	const keep = (value: string) => ({ keep: true, value: value.replace("[[Old Paper]]", "Old Paper") });
	const drop = () => ({ keep: false, value: "" });

	it("unlinks a plain property", () => {
		const fm: Record<string, unknown> = { related: "[[Old Paper]]" };
		assert.equal(editProperty(fm, "related", keep), true);
		assert.deepEqual(fm, { related: "Old Paper" });
	});

	it("unlinks one entry of a list", () => {
		const fm: Record<string, unknown> = { projects: ["[[Live One]]", "[[Old Paper]]"] };
		assert.equal(editProperty(fm, "projects.1", keep), true);
		assert.deepEqual(fm, { projects: ["[[Live One]]", "Old Paper"] });
	});

	it("removes a list entry when asked to drop it", () => {
		const fm: Record<string, unknown> = { projects: ["[[Live One]]", "[[Old Paper]]"] };
		assert.equal(editProperty(fm, "projects.1", drop), true);
		assert.deepEqual(fm, { projects: ["[[Live One]]"] });
	});

	it("removes a plain property when asked to drop it", () => {
		const fm: Record<string, unknown> = { related: "[[Old Paper]]", status: "open" };
		assert.equal(editProperty(fm, "related", drop), true);
		assert.deepEqual(fm, { status: "open" });
	});

	it("reports no change for a missing or non-string property", () => {
		const fm: Record<string, unknown> = { count: 3, nested: { a: 1 } };
		assert.equal(editProperty(fm, "missing", keep), false);
		assert.equal(editProperty(fm, "count", keep), false);
		assert.equal(editProperty(fm, "nested.b.c", keep), false);
	});
});

describe("compareKeys", () => {
	it("orders numeric segments numerically, not as text", () => {
		const keys = ["projects.10", "projects.2", "projects.1"];
		assert.deepEqual([...keys].sort(compareKeys), ["projects.1", "projects.2", "projects.10"]);
	});

	it("orders plain keys alphabetically", () => {
		assert.deepEqual(["related", "authors"].sort(compareKeys), ["authors", "related"]);
	});
});
