import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAliases, scoreCandidate, tokenSimilarity } from "../src/core/suggest.ts";
import type { CandidateInfo, DeletedInfo } from "../src/core/suggest.ts";

const deleted: DeletedInfo = {
	path: "media/research/Old Paper.md",
	basename: "Old Paper",
	folder: "media/research",
};

function candidate(path: string, aliases: string[] = []): CandidateInfo {
	const basename = (path.split("/").pop() ?? path).replace(/\.md$/, "");
	return { path, basename, aliases };
}

describe("scoreCandidate", () => {
	it("ranks an alias match highest", () => {
		const result = scoreCandidate(candidate("media/research/Merged.md", ["Old Paper"]), deleted);
		assert.equal(result?.score, 100);
		assert.match(result?.reason ?? "", /alias/);
	});

	it("matches an alias case insensitively", () => {
		const result = scoreCandidate(candidate("notes/Merged.md", ["old paper"]), deleted);
		assert.equal(result?.score, 100);
	});

	it("ranks the same name in another folder next", () => {
		const result = scoreCandidate(candidate("archive/Old Paper.md"), deleted);
		assert.equal(result?.score, 80);
		assert.match(result?.reason ?? "", /another folder/);
	});

	it("beats a same-name match with an alias match", () => {
		const alias = scoreCandidate(candidate("a/Merged.md", ["Old Paper"]), deleted);
		const same = scoreCandidate(candidate("archive/Old Paper.md"), deleted);
		assert.ok((alias?.score ?? 0) > (same?.score ?? 0));
	});

	it("suggests a similar name, and boosts it when it shares the folder", () => {
		const elsewhere = scoreCandidate(candidate("notes/Old Paper Revised.md"), deleted);
		const sameFolder = scoreCandidate(candidate("media/research/Old Paper Revised.md"), deleted);
		assert.ok(elsewhere);
		assert.ok(sameFolder);
		assert.ok(sameFolder.score > elsewhere.score);
		assert.match(sameFolder.reason, /same folder/);
	});

	it("refuses to suggest an unrelated note", () => {
		assert.equal(scoreCandidate(candidate("personal/Grocery list.md"), deleted), null);
	});

	it("ignores one-letter noise when comparing names", () => {
		assert.equal(scoreCandidate(candidate("personal/A B C.md"), deleted), null);
	});
});

describe("tokenSimilarity", () => {
	it("is 1 for the same words in another order", () => {
		assert.equal(tokenSimilarity("Old Paper", "Paper Old"), 1);
	});

	it("is 0 for nothing in common", () => {
		assert.equal(tokenSimilarity("Old Paper", "Grocery list"), 0);
	});

	it("ignores punctuation and case", () => {
		assert.equal(tokenSimilarity("Old-Paper", "old_paper"), 1);
	});

	it("is 0 when either name has no usable tokens", () => {
		assert.equal(tokenSimilarity("", "Old Paper"), 0);
		assert.equal(tokenSimilarity("a", "Old Paper"), 0);
	});
});

describe("readAliases", () => {
	it("reads a list", () => {
		assert.deepEqual(readAliases({ aliases: ["A", "B"] }), ["A", "B"]);
	});

	it("reads a single string", () => {
		assert.deepEqual(readAliases({ aliases: "A" }), ["A"]);
	});

	it("reads the singular spelling", () => {
		assert.deepEqual(readAliases({ alias: "A" }), ["A"]);
	});

	it("drops non-string entries and missing frontmatter", () => {
		assert.deepEqual(readAliases({ aliases: ["A", 3, null] }), ["A"]);
		assert.deepEqual(readAliases({}), []);
		assert.deepEqual(readAliases(null), []);
		assert.deepEqual(readAliases(undefined), []);
	});
});
