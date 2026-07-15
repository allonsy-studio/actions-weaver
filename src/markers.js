/**
 * Marker parser — finds paired HTML comment markers in file content and
 * replaces everything between them, leaving the rest of the file untouched.
 *
 * Marker format:
 *   <!-- weaver:block-name:START -->
 *   (managed content)
 *   <!-- weaver:block-name:END -->
 */

/**
 * Matches a marker line. Markers must appear on their own line; leading and
 * trailing whitespace is ignored.
 */
const MARKER_RE = /^[ \t]*<!-- weaver:(?<name>[\w-]+):(?<type>START|END) -->[ \t]*$/gm;

/**
 * @typedef {Object} Marker
 * @property {string} name
 * @property {"START" | "END"} type
 * @property {number} index Offset of the match within the content.
 * @property {number} length Length of the matched marker line.
 */

/**
 * Collect every marker occurrence in the given content.
 *
 * @param {string} content
 * @returns {Marker[]}
 */
export function findMarkers(content) {
	// matchAll keeps the global regex's lastIndex local to this call.
	return [...content.matchAll(MARKER_RE)].map((match) => ({
		name: match.groups.name,
		type: /** @type {"START" | "END"} */ (match.groups.type),
		index: match.index,
		length: match[0].length,
	}));
}

/**
 * @typedef {Object} ApplyResult
 * @property {string} content The (possibly) updated content.
 * @property {string[]} applied Block names that were replaced.
 * @property {string[]} warnings Non-fatal issues (unpaired markers).
 * @property {string[]} errors Fatal issues (duplicate/reversed markers).
 */

/**
 * Replace the content between each known block's START/END markers.
 *
 * Rules (see ADR appendix):
 * - A block is only touched when a rendered value is supplied for its name.
 * - START without END (or vice versa) → warning, block skipped.
 * - Multiple START (or END) markers for one block → error, block skipped.
 * - END before START → warning, block skipped.
 * - Markers themselves are never modified; only the span between them changes.
 *
 * @param {string} content Original file content.
 * @param {Record<string, string>} renderedByName Rendered template per block.
 * @param {string} [notice] Managed-notice line inserted after START.
 * @returns {ApplyResult}
 */
export function applyBlocks(content, renderedByName, notice = "") {
	const markers = findMarkers(content);
	const names = new Set(markers.map((m) => m.name));

	/** @type {string[]} */
	const applied = [];
	/** @type {string[]} */
	const warnings = [];
	/** @type {string[]} */
	const errors = [];

	/** @type {Array<{ from: number, to: number, replacement: string }>} */
	const edits = [];

	for (const name of names) {
		const starts = markers.filter((m) => m.name === name && m.type === "START");
		const ends = markers.filter((m) => m.name === name && m.type === "END");

		if (starts.length > 1 || ends.length > 1) {
			errors.push(`Block "${name}" has duplicate START or END markers; skipping.`);
			continue;
		}
		if (starts.length === 1 && ends.length === 0) {
			warnings.push(`Block "${name}" has a START marker but no END; skipping.`);
			continue;
		}
		if (starts.length === 0 && ends.length === 1) {
			warnings.push(`Block "${name}" has an END marker but no START; skipping.`);
			continue;
		}

		const start = starts[0];
		const end = ends[0];
		if (end.index < start.index) {
			warnings.push(`Block "${name}" has its END marker before its START; skipping.`);
			continue;
		}

		// No rendered template for this block — leave it untouched.
		if (!(name in renderedByName)) continue;

		const from = start.index + start.length;
		const to = end.index;
		// The managed notice renders as visible text below the START marker, per
		// the ADR example, so contributors see it in the rendered README.
		const noticeLine = notice ? `(${notice})\n\n` : "";
		const replacement = `\n${noticeLine}${renderedByName[name]}\n`;

		edits.push({ from, to, replacement });
		applied.push(name);
	}

	// Apply edits from last to first so earlier offsets stay valid.
	edits.sort((a, b) => b.from - a.from);
	let next = content;
	for (const edit of edits) {
		next = next.slice(0, edit.from) + edit.replacement + next.slice(edit.to);
	}

	return { content: next, applied, warnings, errors };
}
