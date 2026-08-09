import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildRankingContext,
	isFolderImplied,
	isTooCommon,
	readAliases,
	readTags,
	scoreCandidate,
	sharedTags,
	tagWeight,
	tokenSimilarity,
} from "../src/core/suggest.ts";
import type { CandidateInfo, DeletedInfo, RankingContext } from "../src/core/suggest.ts";

const deleted: DeletedInfo = {
	path: "media/research/Old Paper.md",
	basename: "Old Paper",
	folder: "media/research",
	tags: ["#robotics", "#slam"],
};

function candidate(path: string, aliases: string[] = [], tags: string[] = []): CandidateInfo {
	const basename = (path.split("/").pop() ?? path).replace(/\.md$/, "");
	return { path, basename, aliases, tags };
}

/** A vault where nothing is common, so every shared tag counts for something. */
function contextOf(infos: CandidateInfo[], linkedFrom: string[] = []): RankingContext {
	return buildRankingContext(infos, new Set(linkedFrom));
}

const noContext = contextOf([]);

describe("scoreCandidate", () => {
	it("ranks an alias match highest", () => {
		const result = scoreCandidate(candidate("notes/Merged.md", ["Old Paper"]), deleted, noContext);
		assert.ok((result?.score ?? 0) >= 100);
		assert.match(result?.reason ?? "", /alias/);
	});

	it("matches an alias case insensitively", () => {
		const result = scoreCandidate(candidate("notes/Merged.md", ["old paper"]), deleted, noContext);
		assert.ok((result?.score ?? 0) >= 100);
	});

	it("ranks the same name in another folder next", () => {
		const result = scoreCandidate(candidate("archive/Old Paper.md"), deleted, noContext);
		assert.equal(result?.score, 80);
		assert.match(result?.reason ?? "", /another folder/);
	});

	it("suggests an unrelated name purely on shared tags", () => {
		const vault = [
			candidate("notes/Totally Different.md", [], ["#robotics", "#slam"]),
			...Array.from({ length: 20 }, (_, i) => candidate(`notes/n${i}.md`, [], ["#other"])),
		];
		const result = scoreCandidate(
			candidate("notes/Totally Different.md", [], ["#robotics", "#slam"]),
			deleted,
			contextOf(vault),
		);
		assert.ok(result);
		assert.match(result.reason, /shares #robotics, #slam/);
	});

	it("is barely moved by a tag that nearly every note carries", () => {
		// #note on 9 of 10 notes: log2(10/9) is close to zero, so it cannot on its
		// own push an unrelated note over the threshold.
		const vault = Array.from({ length: 9 }, (_, i) => candidate(`personal/n${i}.md`, [], ["#note"]));
		vault.push(candidate("personal/rare.md", [], ["#rare"]));
		const result = scoreCandidate(
			candidate("personal/Grocery list.md", [], ["#note"]),
			{ ...deleted, tags: ["#note"] },
			contextOf(vault),
		);
		assert.equal(result, null);
	});

	it("suggests a note that shares one genuinely rare tag", () => {
		const vault = Array.from({ length: 40 }, (_, i) => candidate(`notes/n${i}.md`, [], ["#note"]));
		vault.push(candidate("notes/Successor.md", [], ["#rare"]));
		const result = scoreCandidate(
			candidate("notes/Successor.md", [], ["#rare"]),
			{ ...deleted, tags: ["#rare"] },
			contextOf(vault),
		);
		assert.ok(result);
		assert.match(result.reason, /shares #rare/);
	});

	it("ignores a tag that the shared folder implies anyway", () => {
		// The path-mirrored-into-tags convention: every note of the folder carries
		// it, so sharing it says nothing beyond already sharing the folder. The tag
		// is rare vault-wide, so only the folder rule can be suppressing it.
		const vault = Array.from({ length: 5 }, (_, i) =>
			candidate(`media/research/n${i}.md`, [], ["#research"]),
		);
		vault.push(...Array.from({ length: 200 }, (_, i) => candidate(`other/n${i}.md`)));
		const result = scoreCandidate(
			candidate("media/research/Unrelated Thing.md", [], ["#research"]),
			{ ...deleted, tags: ["#research"] },
			contextOf(vault),
		);
		assert.equal(result, null);
	});

	it("still counts that tag for a note outside the folder", () => {
		// Checked through sharedTags rather than the score, because whether one
		// shared tag alone clears the threshold is a separate question.
		const vault = Array.from({ length: 5 }, (_, i) =>
			candidate(`media/research/n${i}.md`, [], ["#research"]),
		);
		vault.push(...Array.from({ length: 200 }, (_, i) => candidate(`other/n${i}.md`)));
		const context = contextOf(vault);
		assert.deepEqual(
			sharedTags(["#research"], ["#research"], "media/research", false, context),
			["#research"],
		);
		assert.deepEqual(sharedTags(["#research"], ["#research"], "media/research", true, context), []);
	});

	it("adds up signals rather than taking only the strongest", () => {
		const vault = [
			candidate("notes/Old Paper Revised.md", [], ["#robotics", "#slam"]),
			...Array.from({ length: 20 }, (_, i) => candidate(`notes/n${i}.md`, [], ["#other"])),
		];
		const nameOnly = scoreCandidate(candidate("notes/Old Paper Revised.md"), deleted, contextOf(vault));
		const nameAndTags = scoreCandidate(
			candidate("notes/Old Paper Revised.md", [], ["#robotics", "#slam"]),
			deleted,
			contextOf(vault),
		);
		assert.ok(nameOnly);
		assert.ok(nameAndTags);
		assert.ok(nameAndTags.score > nameOnly.score);
		assert.match(nameAndTags.reason, /similar name, shares/);
	});

	it("credits a note the deleted one linked to", () => {
		const result = scoreCandidate(
			candidate("notes/Successor.md"),
			deleted,
			contextOf([], ["notes/Successor.md"]),
		);
		assert.ok(result);
		assert.match(result.reason, /linked to it/);
	});

	it("refuses to suggest an unrelated note", () => {
		assert.equal(scoreCandidate(candidate("personal/Grocery list.md"), deleted, noContext), null);
	});

	it("does not suggest a note on the same folder alone", () => {
		assert.equal(
			scoreCandidate(candidate("media/research/Unrelated Thing.md"), deleted, noContext),
			null,
		);
	});

	it("does not confuse a dated note name with the daily note of that date", () => {
		const dated: DeletedInfo = {
			path: "ai_chats/notes/2026-07-29 Broken links scan.md",
			basename: "2026-07-29 Broken links scan",
			folder: "ai_chats/notes",
			tags: [],
		};
		assert.equal(scoreCandidate(candidate("diary/daily/2026-07-29.md"), dated, noContext), null);
	});
});

describe("sharedTags", () => {
	it("finds the overlap, ignoring case and order", () => {
		assert.deepEqual(
			sharedTags(["#SLAM", "#other"], ["#slam"], "media/research", false, noContext),
			["#slam"],
		);
	});
});

describe("isTooCommon", () => {
	it("gates a tag carried by a large share of the vault", () => {
		const vault = Array.from({ length: 20 }, (_, i) => candidate(`n${i}.md`, [], ["#everywhere"]));
		vault.push(candidate("rare.md", [], ["#rare"]));
		const context = buildRankingContext(vault);
		assert.equal(isTooCommon("#everywhere", context), true);
		assert.equal(isTooCommon("#rare", context), false);
	});
});

describe("tagWeight", () => {
	it("gives a rare tag more weight than a widespread one", () => {
		const vault = [
			candidate("a.md", [], ["#rare"]),
			...Array.from({ length: 30 }, (_, i) => candidate(`n${i}.md`, [], ["#everywhere"])),
		];
		const context = buildRankingContext(vault);
		assert.ok(tagWeight("#rare", context) > tagWeight("#everywhere", context));
	});

	it("is zero for a tag on every note", () => {
		const vault = Array.from({ length: 4 }, (_, i) => candidate(`n${i}.md`, [], ["#all"]));
		assert.equal(tagWeight("#all", buildRankingContext(vault)), 0);
	});
});

describe("isFolderImplied", () => {
	it("flags a tag the whole folder carries", () => {
		const vault = Array.from({ length: 5 }, (_, i) => candidate(`work/n${i}.md`, [], ["#work"]));
		assert.equal(isFolderImplied("#work", "work", buildRankingContext(vault)), true);
	});

	it("leaves a tag only some of the folder carries", () => {
		const vault = [
			candidate("work/a.md", [], ["#special"]),
			...Array.from({ length: 4 }, (_, i) => candidate(`work/n${i}.md`, [], ["#work"])),
		];
		assert.equal(isFolderImplied("#special", "work", buildRankingContext(vault)), false);
	});

	it("never fires for a folder holding a single note", () => {
		const vault = [candidate("solo/a.md", [], ["#tag"])];
		assert.equal(isFolderImplied("#tag", "solo", buildRankingContext(vault)), false);
	});
});

describe("readTags", () => {
	it("reads frontmatter tags as a list", () => {
		assert.deepEqual(readTags({ frontmatter: { tags: ["robotics", "slam"] } }), [
			"#robotics",
			"#slam",
		]);
	});

	it("reads a comma-separated frontmatter string", () => {
		assert.deepEqual(readTags({ frontmatter: { tags: "robotics, slam" } }), ["#robotics", "#slam"]);
	});

	it("reads inline body tags", () => {
		assert.deepEqual(readTags({ tags: [{ tag: "#robotics" }] }), ["#robotics"]);
	});

	it("merges both, normalising the hash", () => {
		const tags = readTags({ frontmatter: { tags: ["#robotics"] }, tags: [{ tag: "slam" }] });
		assert.deepEqual(tags, ["#robotics", "#slam"]);
	});

	it("survives missing or malformed metadata", () => {
		assert.deepEqual(readTags(null), []);
		assert.deepEqual(readTags({}), []);
		assert.deepEqual(readTags({ frontmatter: { tags: [3, null] } }), []);
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
