/**
 * Pure file-rewriting logic for the rename CLI, split out so it can be
 * unit-tested without the interactive prompts or self-deletion in
 * {@link ./rename.js}.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, relative, dirname } from "node:path";

/**
 * Render a single template file: read `src`, apply replacements, and write the
 * result to `dest` (which may be `src` itself). Missing parent directories of
 * `dest` are created, so nested template files (e.g. .github/foo.yml) install
 * correctly. Used to install the templated, action-only files over the
 * repository-specific versions.
 *
 * @param {string} src
 * @param {string} dest
 * @param {Array<[RegExp, string]>} replacements
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {boolean} whether `dest` would change (or did, when not a dry run)
 */
export function renderTemplateFile(src, dest, replacements, { dryRun = false } = {}) {
	const rendered = applyReplacements(readFileSync(src, "utf8"), replacements);
	const changed = !existsSync(dest) || readFileSync(dest, "utf8") !== rendered;
	if (changed && !dryRun) {
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest, rendered);
	}
	return changed;
}

/**
 * Remove the template's own pending changesets so a freshly scaffolded repo
 * starts with a clean release history. Every `.changeset/*.md` file is deleted
 * except `README.md` (the changesets usage guide); `config.json` is left in
 * place. Returns the repo-relative paths that were (or, on a dry run, would be)
 * removed.
 *
 * @param {string} root
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {string[]}
 */
export function clearChangesets(root, { dryRun = false } = {}) {
	const dir = join(root, ".changeset");
	if (!existsSync(dir)) return [];
	const removed = [];
	for (const entry of readdirSync(dir)) {
		if (!entry.endsWith(".md") || entry.toLowerCase() === "readme.md") continue;
		removed.push(join(".changeset", entry));
		if (!dryRun) rmSync(join(dir, entry), { force: true });
	}
	return removed;
}

/** Directories that are never walked when rewriting placeholders. */
export const IGNORE = new Set(["node_modules", ".git", ".yarn", "scripts", "coverage", ".cache"]);

/** File extensions whose contents are scanned for placeholders. */
export const TEXT_EXTS = new Set([".json", ".js", ".mjs", ".cjs", ".ts", ".yml", ".yaml", ".md"]);

/**
 * Recursively collect every file under `dir`, skipping ignored directories.
 *
 * @param {string} dir
 * @param {{ ignore?: Set<string> }} [opts]
 * @returns {string[]}
 */
export function walk(dir, { ignore = IGNORE } = {}) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		if (ignore.has(entry)) continue;
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) out.push(...walk(full, { ignore }));
		else out.push(full);
	}
	return out;
}

/**
 * Build the regex matching a `{{ TOKEN }}` placeholder, tolerant of the inner
 * whitespace (so `{{TOKEN}}` and `{{ TOKEN }}` both match).
 *
 * @param {string} token
 * @returns {RegExp}
 */
export function placeholder(token) {
	return new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "g");
}

/**
 * Build the scalar placeholder → value replacement pairs.
 *
 * `owner` is the repo namespace (org or user) used in github.com/OWNER URLs;
 * `author` is the person who created the project (their GitHub handle); and
 * `authorEmail` is their commit email (used in the package.json author field).
 *
 * @param {{ name: string, description: string, owner: string, author: string, authorEmail: string }} values
 * @returns {Array<[RegExp, string]>}
 */
export function buildReplacements({ name, description, owner, author, authorEmail }) {
	return [
		[placeholder("ACTION_NAME"), name.trim()],
		[placeholder("ACTION_DESCRIPTION"), description.trim()],
		[placeholder("ACTION_AUTHOR_EMAIL"), authorEmail.trim()],
		[placeholder("ACTION_AUTHOR"), author.trim()],
		[placeholder("OWNER"), owner.trim()],
	];
}

/** The standard token input every action ships with. */
const TOKEN_INPUT = {
	name: "token",
	description: "GITHUB_TOKEN for the repository.",
	required: false,
	default: "${{ github.token }}",
};

/** Double-quote a YAML scalar, escaping backslashes and quotes. */
function yamlString(value) {
	return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Render one action.yml input entry (4-space indented under `inputs:`).
 *
 * @param {{ name: string, description: string, required?: boolean, default?: string }} input
 * @returns {string}
 */
export function renderActionInput({ name, description, required = false, default: def }) {
	const lines = [`    ${name}:`, `        description: ${yamlString(description)}`, `        required: ${Boolean(required)}`];
	if (def !== undefined && def !== "") lines.push(`        default: ${yamlString(def)}`);
	return lines.join("\n");
}

/**
 * Render one action.yml output entry (4-space indented under `outputs:`).
 *
 * @param {{ name: string, description: string }} output
 * @returns {string}
 */
export function renderActionOutput({ name, description }) {
	return [`    ${name}:`, `        description: ${yamlString(description)}`].join("\n");
}

/**
 * Render the action.yml `inputs:`/`outputs:` block. The standard `token` input
 * is always present; the `outputs:` section is omitted when there are none.
 *
 * @param {{ inputs?: object[], outputs?: object[] }} [vars]
 * @returns {string}
 */
export function renderActionIo({ inputs = [], outputs = [] } = {}) {
	const sections = [["inputs:", renderActionInput(TOKEN_INPUT), ...inputs.map(renderActionInput)].join("\n")];
	if (outputs.length) sections.push(["outputs:", ...outputs.map(renderActionOutput)].join("\n"));
	return sections.join("\n\n");
}

/** Backtick-wrap a markdown cell value, or em-dash when empty. */
function mdValue(value) {
	return value === undefined || value === "" ? "—" : `\`${value}\``;
}

/**
 * Render the README inputs table (including the standard `token` input).
 *
 * @param {object[]} [inputs]
 * @returns {string}
 */
export function renderInputsTable(inputs = []) {
	const rows = [TOKEN_INPUT, ...inputs].map(
		(i) => `| \`${i.name}\` | ${i.required ? "yes" : "no"} | ${mdValue(i.default)} | ${i.description} |`,
	);
	return ["| Name | Required | Default | Description |", "| ---- | -------- | ------- | ----------- |", ...rows].join("\n");
}

/**
 * Render the README outputs table, or a note when there are none.
 *
 * @param {object[]} [outputs]
 * @returns {string}
 */
export function renderOutputsTable(outputs = []) {
	if (!outputs.length) return "_This action defines no outputs._";
	const rows = outputs.map((o) => `| \`${o.name}\` | ${o.description} |`);
	return ["| Name | Description |", "| ---- | ----------- |", ...rows].join("\n");
}

/**
 * Render the `with:` block for the README usage example. Empty when the action
 * has no user inputs (the standard `token` input is omitted — it defaults).
 *
 * @param {object[]} [inputs]
 * @returns {string}
 */
export function renderUsageWith(inputs = []) {
	if (!inputs.length) return "";
	const lines = inputs.map((i) => `      ${i.name}: ${i.default ?? ""}`.trimEnd());
	return ["", "  with:", ...lines].join("\n");
}

/**
 * Build the dynamic, generated-content replacements (action.yml IO + README
 * tables/usage). Applied after {@link buildReplacements} so generated content
 * isn't re-scanned for scalar placeholders.
 *
 * @param {{ inputs?: object[], outputs?: object[] }} [vars]
 * @returns {Array<[RegExp, string]>}
 */
export function buildContentReplacements({ inputs = [], outputs = [] } = {}) {
	return [
		[placeholder("ACTION_IO"), renderActionIo({ inputs, outputs })],
		[placeholder("ACTION_INPUTS_TABLE"), renderInputsTable(inputs)],
		[placeholder("ACTION_OUTPUTS_TABLE"), renderOutputsTable(outputs)],
		[placeholder("ACTION_USAGE"), renderUsageWith(inputs)],
	];
}

/**
 * Apply every replacement to a single string.
 *
 * @param {string} content
 * @param {Array<[RegExp, string]>} replacements
 * @returns {string}
 */
export function applyReplacements(content, replacements) {
	let out = content;
	for (const [pattern, value] of replacements) out = out.replace(pattern, value);
	return out;
}

/**
 * Rewrite every text file under `root`, returning the repo-relative paths of
 * the files that actually changed.
 *
 * When `dryRun` is set, no files are written but the list of paths that would
 * change is still returned.
 *
 * @param {string} root
 * @param {Array<[RegExp, string]>} replacements
 * @param {{ textExts?: Set<string>, ignore?: Set<string>, dryRun?: boolean }} [opts]
 * @returns {string[]}
 */
export function renameFiles(root, replacements, { textExts = TEXT_EXTS, ignore = IGNORE, dryRun = false } = {}) {
	const updated = [];
	for (const file of walk(root, { ignore })) {
		const ext = file.slice(file.lastIndexOf("."));
		if (!textExts.has(ext)) continue;
		const before = readFileSync(file, "utf8");
		const after = applyReplacements(before, replacements);
		if (after !== before) {
			if (!dryRun) writeFileSync(file, after);
			updated.push(relative(root, file));
		}
	}
	return updated;
}

/**
 * Extract the owner/org from a git remote URL — handles both SSH
 * (git@github.com:OWNER/repo.git) and HTTPS (https://github.com/OWNER/repo).
 *
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
export function parseRemoteOwner(url) {
	return url?.match(/[:/]([^/]+)\/[^/]+?(?:\.git)?$/)?.[1]?.toLowerCase();
}

/**
 * Extract the owner from the first remote `url = ...` line in `.git/config` text.
 *
 * @param {string | undefined} configText
 * @returns {string | undefined}
 */
export function parseGitConfigOwner(configText) {
	return parseRemoteOwner(configText?.match(/url\s*=\s*(.+)/)?.[1]?.trim());
}

/**
 * Extract a GitHub handle from a noreply commit email, covering both the modern
 * ({id}+{login}@users.noreply.github.com) and legacy ({login}@…) forms.
 *
 * @param {string | undefined} email
 * @returns {string | undefined}
 */
export function parseNoreplyHandle(email) {
	return email?.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i)?.[1]?.toLowerCase();
}

/**
 * Extract the logged-in user from the GitHub CLI's hosts.yml contents.
 *
 * @param {string | undefined} hostsYaml
 * @returns {string | undefined}
 */
export function parseGhUser(hostsYaml) {
	return hostsYaml?.match(/^\s*user:\s*(\S+)/m)?.[1]?.toLowerCase();
}
