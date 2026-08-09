import type { FoundReference } from "../types";

export interface EditTally {
	rewritten: number;
	skipped: number;
}

/** Builds the text that replaces a reference. Kept injectable so it stays testable. */
export type Replacer = (reference: FoundReference) => string;

/**
 * Splice replacements into a note body using the cached offsets.
 *
 * Edits are applied back to front so an earlier offset is never invalidated by a
 * later one, and every edit is checked against the text actually present before
 * it is applied. Anything that no longer matches is skipped rather than guessed.
 */
export function applyBodyEdits(
	data: string,
	references: FoundReference[],
	replacer: Replacer,
): EditTally & { text: string } {
	const ordered = [...references].sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
	let text = data;
	let rewritten = 0;
	let skipped = 0;

	for (const reference of ordered) {
		const { start, end } = reference;
		if (start === undefined || end === undefined) {
			skipped += 1;
			continue;
		}
		if (text.slice(start, end) !== reference.original) {
			skipped += 1;
			continue;
		}
		text = text.slice(0, start) + replacer(reference) + text.slice(end);
		rewritten += 1;
	}

	return { text, rewritten, skipped };
}

export type PropertyEdit = { keep: boolean; value: string };

/**
 * Apply `transform` to the string at a dotted property path such as `projects.0`,
 * dropping the entry when the transform asks not to keep it. Returns whether
 * anything changed.
 */
export function editProperty(
	data: Record<string, unknown>,
	key: string,
	transform: (value: string) => PropertyEdit,
): boolean {
	const segments = key.split(".");
	let container: unknown = data;

	for (const segment of segments.slice(0, -1)) {
		if (Array.isArray(container)) container = (container as unknown[])[Number(segment)];
		else if (isRecord(container)) container = container[segment];
		else return false;
	}

	const last = segments[segments.length - 1];
	if (last === undefined) return false;

	if (Array.isArray(container)) {
		const list = container as unknown[];
		const index = Number(last);
		const current = list[index];
		if (typeof current !== "string") return false;
		const edit = transform(current);
		if (edit.value === current && edit.keep) return false;
		if (edit.keep) list[index] = edit.value;
		else list.splice(index, 1);
		return true;
	}

	if (isRecord(container)) {
		const current = container[last];
		if (typeof current !== "string") return false;
		const edit = transform(current);
		if (edit.value === current && edit.keep) return false;
		if (edit.keep) container[last] = edit.value;
		else delete container[last];
		return true;
	}

	return false;
}

/** Sort dotted property paths, comparing numeric segments as numbers. */
export function compareKeys(a: string, b: string): number {
	const left = a.split(".");
	const right = b.split(".");
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const x = left[i] ?? "";
		const y = right[i] ?? "";
		if (x === y) continue;
		const nx = Number(x);
		const ny = Number(y);
		if (Number.isInteger(nx) && Number.isInteger(ny)) return nx - ny;
		return x < y ? -1 : 1;
	}
	return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
