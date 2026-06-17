/**
 * Template engine — a deliberately minimal, logic-light renderer.
 *
 * Supported syntax:
 *   {{ key }}     value, HTML-escaped
 *   {{{ key }}}   value, raw (for URLs and markdown)
 *   {{#if key}}…{{/if}}   conditional inclusion
 *
 * Keys use dotted paths (e.g. `repo.name`, `org.website`). This is the one
 * piece of Mustache we reimplement in-house to avoid a runtime dependency.
 */

const MAX_VALUE_LENGTH = 1000;

/**
 * Resolve a dotted path against a context object.
 *
 * @param {Record<string, unknown>} context
 * @param {string} path
 * @returns {unknown}
 */
function lookup(context, path) {
	return path.split(".").reduce((acc, key) => {
		if (acc != null && typeof acc === "object" && key in acc) {
			return /** @type {Record<string, unknown>} */ (acc)[key];
		}
		return undefined;
	}, /** @type {unknown} */ (context));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isTruthy(value) {
	if (Array.isArray(value)) return value.length > 0;
	return Boolean(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stringify(value) {
	if (value == null) return "";
	if (Array.isArray(value)) return value.join(", ");
	return String(value);
}

/**
 * Strip HTML comment sequences and clamp length. Marker integrity depends on
 * comments only ever coming from the template author, never interpolated data.
 *
 * @param {string} value
 * @param {number} [maxLength]
 * @returns {string}
 */
export function sanitize(value, maxLength = MAX_VALUE_LENGTH) {
	const stripped = value.replace(/<!--[\s\S]*?-->/g, "").replace(/<!--|-->/g, "");
	return stripped.length > maxLength ? stripped.slice(0, maxLength) : stripped;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Render a template string against a context.
 *
 * @param {string} template
 * @param {Record<string, unknown>} context
 * @param {{ maxLength?: number }} [options]
 * @returns {string}
 */
export function render(template, context, options = {}) {
	const maxLength = options.maxLength ?? MAX_VALUE_LENGTH;

	// 1. Conditionals first so nested interpolation inside them resolves after.
	let output = template.replace(
		/{{#if\s+([\w.]+)\s*}}([\s\S]*?){{\/if}}/g,
		(_match, key, inner) => (isTruthy(lookup(context, key)) ? inner : ""),
	);

	// 2. Raw (triple) — sanitized but not HTML-escaped.
	output = output.replace(/{{{\s*([\w.]+)\s*}}}/g, (_match, key) =>
		sanitize(stringify(lookup(context, key)), maxLength),
	);

	// 3. Escaped (double).
	output = output.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key) =>
		escapeHtml(sanitize(stringify(lookup(context, key)), maxLength)),
	);

	return output;
}
