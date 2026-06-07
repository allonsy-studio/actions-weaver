#!/usr/bin/env node
/**
 * One-shot rename CLI for repos generated from this template.
 *
 * Usage: yarn rename --name my-action --description "What it does" --owner my-org --author octocat
 *
 * Any missing value is collected interactively, along with the action's input
 * and output variables. Replaces the {{ ACTION_NAME }} / {{ ACTION_DESCRIPTION }} /
 * {{ ACTION_AUTHOR }} / {{ ACTION_AUTHOR_EMAIL }} / {{ OWNER }} placeholders and
 * generates the action.yml inputs/outputs and README tables across the repo,
 * installs every templated action file from scripts/template/ (package.json,
 * jest.config.js, README.md, ...) over the repository-specific versions, and
 * removes the entire scripts/ directory.
 *
 * Pass --dry-run to walk through the prompts and print what would change
 * without writing, installing, or removing anything.
 */

import { rmSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { Command } from "commander";
import { intro, outro, text, confirm, isCancel, cancel, spinner } from "@clack/prompts";

import {
	buildReplacements,
	buildContentReplacements,
	renameFiles,
	renderTemplateFile,
	clearChangesets,
	walk,
	parseGitConfigOwner,
	parseNoreplyHandle,
	parseGhUser,
} from "./rename.core.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(here, "..");

/** Read a file, returning undefined instead of throwing when it's absent. */
function readMaybe(path) {
	if (existsSync(path)) {
		return readFileSync(path, "utf8");
	}
	return undefined;
}

/** Run a command, returning its trimmed stdout or undefined on any failure. */
function execMaybe(command) {
	try {
		return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
	} catch {
		return undefined;
	}
}

/** The repo namespace (org or user) for github.com/OWNER URLs, from the origin remote. */
function detectOwner(root) {
	return parseGitConfigOwner(readMaybe(join(root, ".git", "config"))) ?? detectHandle(root);
}

/**
 * The GitHub handle of the person running the tool, most-confident source first:
 *   1. GITHUB_ACTOR        — definitive inside GitHub Actions
 *   2. gh CLI's hosts.yml  — the logged-in identity, read without a subprocess
 *   3. `gh api user`       — the live authenticated identity (subprocess)
 *   4. noreply commit email — parsed from `git config user.email`
 *   5. origin remote owner — last resort (may be an org, not the person)
 *
 * @param {string} root
 * @returns {string | undefined}
 */
function detectHandle(root) {
	return (
		process.env.GITHUB_ACTOR?.toLowerCase() ||
		parseGhUser(readMaybe(join(homedir(), ".config", "gh", "hosts.yml"))) ||
		execMaybe("gh api user --jq .login")?.toLowerCase() ||
		parseNoreplyHandle(execMaybe("git config user.email")) ||
		parseGitConfigOwner(readMaybe(join(root, ".git", "config"))) ||
		undefined
	);
}

/** Bail out cleanly when the user aborts a prompt. */
function ensure(value) {
	if (isCancel(value)) {
		cancel("Rename cancelled.");
		process.exit(0);
	}
	return value;
}

const validName = (value) =>
	/^[a-zA-Z][\w-]*$/.test(value?.trim() ?? "") ? undefined : "Use a letter followed by letters, numbers, _ or -.";
const validRequired = (value) => (value?.trim() ? undefined : "This field is required.");

/** Prompt for a repeated list of action inputs (name/description/required/default). */
async function collectInputs() {
	const inputs = [];
	let more = ensure(await confirm({ message: "Define an input variable?", initialValue: false }));
	while (more) {
		const name = ensure(await text({ message: "Input name", placeholder: "my-input", validate: validName }));
		const description = ensure(
			await text({ message: "Input description", placeholder: "What it controls", validate: validRequired }),
		);
		const required = ensure(await confirm({ message: "Is this input required?", initialValue: false }));
		const def = required
			? undefined
			: ensure(await text({ message: "Default value (optional)", placeholder: "", defaultValue: "" }));
		inputs.push({ name: name.trim(), description: description.trim(), required, default: def?.trim() || undefined });
		more = ensure(await confirm({ message: "Define another input?", initialValue: false }));
	}
	return inputs;
}

/** Prompt for a repeated list of action outputs (name/description). */
async function collectOutputs() {
	const outputs = [];
	let more = ensure(await confirm({ message: "Define an output variable?", initialValue: false }));
	while (more) {
		const name = ensure(await text({ message: "Output name", placeholder: "my-output", validate: validName }));
		const description = ensure(
			await text({ message: "Output description", placeholder: "What it returns", validate: validRequired }),
		);
		outputs.push({ name: name.trim(), description: description.trim() });
		more = ensure(await confirm({ message: "Define another output?", initialValue: false }));
	}
	return outputs;
}

async function run(opts) {
	const dryRun = Boolean(opts.dryRun);
	intro(dryRun ? "Rename template repository (dry run)" : "Rename template repository");

	const name =
		opts.name ??
		ensure(
			await text({
				message: "What is the action name?",
				placeholder: "my-action",
				validate: (value) => (value?.trim() ? undefined : "Name is required."),
			}),
		);

	const description =
		opts.description ??
		ensure(
			await text({
				message: "Describe the action",
				placeholder: "A GitHub Action that does something amazing!",
				// Not required — fall back to a generic description when left blank.
				defaultValue: "A GitHub Action",
			}),
		);

	const owner =
		opts.owner ??
		ensure(
			await text({
				message: "Who is the owner (org or user)? Used in the repository URLs.",
				placeholder: "my-org",
				initialValue: detectOwner(repoRoot) ?? "",
				validate: (value) => (value?.trim() ? undefined : "Owner is required."),
			}),
		);

	const author =
		opts.author ??
		ensure(
			await text({
				message: "Who is the author (GitHub handle)? Credited in package.json and action.yml.",
				placeholder: "octocat",
				initialValue: detectHandle(repoRoot) ?? "",
				// Not required — fall back to the owner when no handle is given/detected.
				defaultValue: owner,
			}),
		);

	// Author email: prefer the configured commit email, fall back to the
	// author's GitHub noreply address.
	const authorEmail = execMaybe("git config user.email") ?? `${author.trim()}@users.noreply.github.com`;

	const inputs = await collectInputs();
	const outputs = await collectOutputs();

	const proceed = ensure(
		await confirm({
			message: `${dryRun ? "Preview the rename for" : "Replace placeholders for"} "${name}" — owner "${owner}", author "${author}", ${inputs.length} input(s), ${outputs.length} output(s)?`,
		}),
	);
	if (!proceed) {
		cancel("Rename cancelled.");
		process.exit(0);
	}

	const replacements = [
		...buildReplacements({ name, description, owner, author, authorEmail }),
		...buildContentReplacements({ inputs, outputs }),
	];

	const s = spinner();
	s.start(dryRun ? "Scanning files" : "Updating files");

	const updated = renameFiles(repoRoot, replacements, { dryRun });

	s.stop(`${dryRun ? "Would update" : "Updated"} ${updated.length} file${updated.length === 1 ? "" : "s"}`);
	for (const file of updated) console.log(`  ${file}`);

	// Swap the templated, action-only files in for the repository-specific
	// versions (recursing into nested folders, e.g. .github/), then remove the
	// entire rename toolchain (this directory).
	const templateDir = join(here, "template");
	for (const src of walk(templateDir, { ignore: new Set() })) {
		const rel = relative(templateDir, src);
		if (renderTemplateFile(src, join(repoRoot, rel), replacements, { dryRun })) {
			console.log(`  ${dryRun ? "would update" : "updated"} ${rel}`);
		}
	}

	// Drop the template's own pending changesets so the new repo starts with a
	// clean release history (and no dangling reference to this package's name).
	for (const removed of clearChangesets(repoRoot, { dryRun })) {
		console.log(`  ${dryRun ? "would remove" : "removed"} ${removed}`);
	}

	console.log(`  ${dryRun ? "would remove" : "removed"} scripts/`);
	if (!dryRun) rmSync(here, { recursive: true, force: true });

	outro(
		dryRun
			? "Dry run complete — no files were changed."
			: "Rename complete. Action config installed; scripts/ removed.",
	);
}

const program = new Command();

program
	.name("rename")
	.description("Replace template placeholders, install the action config, and remove scripts/.")
	.option("-n, --name <name>", "action name (replaces ACTION_NAME)")
	.option("-d, --description <description>", "action description (replaces ACTION_DESCRIPTION)")
	.option("-o, --owner <owner>", "repository owner / org for the URLs (replaces OWNER)")
	.option("-a, --author <author>", "author GitHub handle, the project creator (replaces ACTION_AUTHOR)")
	.option("--dry-run", "walk through the prompts and print what would change, writing nothing")
	.action(run);

await program.parseAsync(process.argv);
