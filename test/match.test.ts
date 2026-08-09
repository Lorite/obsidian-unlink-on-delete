import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExternalLink, linkpathMatches } from "../src/core/match.ts";

const target = { path: "media/research/Old Paper.md", name: "Old Paper.md", basename: "Old Paper" };

describe("linkpathMatches", () => {
	it("matches a bare name", () => {
		assert.equal(linkpathMatches("Old Paper", target), true);
		assert.equal(linkpathMatches("Old Paper.md", target), true);
	});

	it("matches case insensitively", () => {
		assert.equal(linkpathMatches("old paper", target), true);
	});

	it("matches a full path", () => {
		assert.equal(linkpathMatches("media/research/Old Paper", target), true);
		assert.equal(linkpathMatches("media/research/Old Paper.md", target), true);
		assert.equal(linkpathMatches("./media/research/Old Paper", target), true);
		assert.equal(linkpathMatches("/media/research/Old Paper", target), true);
	});

	it("refuses a path that points at a different folder", () => {
		assert.equal(linkpathMatches("archive/Old Paper", target), false);
	});

	it("refuses a different note", () => {
		assert.equal(linkpathMatches("New Paper", target), false);
		assert.equal(linkpathMatches("Old Paper Notes", target), false);
	});

	it("decodes percent-encoded markdown link paths", () => {
		assert.equal(linkpathMatches("Old%20Paper.md", target), true);
		assert.equal(linkpathMatches("media/research/Old%20Paper.md", target), true);
	});

	it("survives a malformed percent escape", () => {
		assert.equal(linkpathMatches("Old%2Paper", target), false);
	});

	it("ignores an empty linkpath", () => {
		assert.equal(linkpathMatches("", target), false);
	});

	it("matches an attachment by its full name", () => {
		const image = { path: "assets/diagram.png", name: "diagram.png", basename: "diagram" };
		assert.equal(linkpathMatches("diagram.png", image), true);
		assert.equal(linkpathMatches("assets/diagram.png", image), true);
	});
});

describe("isExternalLink", () => {
	it("spots protocol links", () => {
		assert.equal(isExternalLink("https://example.com"), true);
		assert.equal(isExternalLink("obsidian://open?vault=x"), true);
		assert.equal(isExternalLink("mailto:a@example.com"), true);
	});

	it("leaves vault paths alone", () => {
		assert.equal(isExternalLink("Old Paper"), false);
		assert.equal(isExternalLink("media/research/Old Paper.md"), false);
	});
});
