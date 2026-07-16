import { readdir, readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";

import * as core from "@actions/core";

import { loadConfig } from "./config.js";
import { render } from "./template.js";
import { applyBlocks } from "./markers.js";
import { resolveRepos, buildContext } from "./repos.js";
import { syncRepo } from "./commit.js";
import { withRetry } from "./retry.js";

/**
 * Read every `*.md` file in the templates directory. Each file's basename
 * (minus extension) is its block name.
 *
 * @param {string} dir
 * @returns {Promise<Array<{ name: string, source: string }>>}
 */
async function loadTemplates(dir) {
	let entries;
	try {
		entries = await readdir(dir);
	} catch {
		throw new Error(`Templates directory "${dir}" was not found in the workspace.`);
	}

	const templates = await Promise.all(
		entries
			.filter((file) => extname(file) === ".md")
			.map(async (file) => ({
				name: basename(file, ".md"),
				source: await readFile(join(dir, file), "utf8"),
			})),
	);

	if (templates.length === 0) {
		throw new Error(`No "*.md" templates found in "${dir}".`);
	}
	return templates;
}

/**
 * Entry point. Resolves config, renders templates per repo, and opens a pull
 * request for each repo whose target file changed.
 *
 * @param {any} client Authenticated Octokit client.
 * @param {{ repo: { owner: string } }} context Action context.
 * @returns {Promise<void>}
 */
export default async function run(client, context) {
	const config = loadConfig(context);
	const templates = await loadTemplates(config.templatesDir);
	core.info(`Loaded ${templates.length} template(s): ${templates.map((t) => t.name).join(", ")}`);

	const repos = await resolveRepos(client, config);
	core.info(`Resolved ${repos.length} target repo(s).`);

	/** @type {import("./commit.js").SyncResult[]} */
	const results = [];

	for (const repo of repos) {
		const context_ = buildContext(repo, config.variables);

		/** @param {string} content */
		const transform = (content) => {
			const renderedByName = Object.fromEntries(templates.map((t) => [t.name, render(t.source, context_, { maxLength: config.maxValueLength })]));
			return applyBlocks(content, renderedByName, config.managedNotice);
		};

		// Message builders are rendered lazily with the blocks that actually
		// changed in this repo, so {{ blocks }} is per-repo accurate.
		/** @param {string} template */
		const renderMessage = (template) => (/** @type {string[]} */ applied) => render(template, { ...context_, blocks: applied.join(", ") });

		try {
			// Retry transient GitHub failures (secondary rate limits, 5xx) so a
			// single blip mid-sync doesn't fail an otherwise-healthy repo. syncRepo
			// is idempotent, so re-running the whole flow is safe.
			const result = await withRetry(
				() =>
					syncRepo(client, repo, {
						path: config.targetFile,
						branch: config.branch,
						base: config.base,
						commitMessage: renderMessage(config.commitMessage),
						prTitle: renderMessage(config.prTitle),
						prBody: renderMessage(config.prBody),
						dryRun: config.dryRun,
						transform,
					}),
				{
					retries: config.maxRetries,
					onRetry: (err, attempt, delay) => core.warning(`${repo.full_name}: transient error (attempt ${attempt + 1}), retrying in ${delay}ms.`),
				},
			);
			results.push(result);
			for (const warning of result.warnings ?? []) {
				core.warning(`${result.repo}: ${warning}`);
			}
			core.info(`${result.repo}: ${result.status}${result.url ? ` (${result.url})` : ""}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			core.error(`${repo.full_name}: ${message}`);
			results.push({ repo: repo.full_name, status: "failed", error: message });
		}
	}

	await report(results, config.dryRun, config.failOnError);
}

/**
 * Set outputs and write the job summary.
 *
 * @param {Array<import("./commit.js").SyncResult & { error?: string }>} results
 * @param {boolean} dryRun
 * @param {boolean} failOnError When false, failed repos are reported but the
 *   job is not marked failed.
 * @returns {Promise<void>}
 */
async function report(results, dryRun, failOnError) {
	const pullRequests = results.filter((r) => r.url).map((r) => ({ repo: r.repo, url: r.url, number: r.number }));

	const summary = {
		opened: results.filter((r) => r.status === "opened").length,
		updated: results.filter((r) => r.status === "updated").length,
		skipped: results.filter((r) => r.status === "skipped").length,
		dryRun: results.filter((r) => r.status === "dry-run").length,
		failed: results.filter((r) => r.status === "failed").length,
	};

	core.setOutput("pull-requests", JSON.stringify(pullRequests));
	core.setOutput("summary", JSON.stringify(summary));

	core.summary.addHeading("Weaver sync", 2).addRaw(`Opened: ${summary.opened} · Updated: ${summary.updated} · Skipped: ${summary.skipped}` + `${dryRun ? ` · Dry-run: ${summary.dryRun}` : ""} · Failed: ${summary.failed}`);
	if (pullRequests.length > 0) {
		core.summary.addList(pullRequests.map((pr) => `<a href="${pr.url}">${pr.repo} #${pr.number}</a>`));
	}
	await core.summary.write();

	if (summary.failed > 0) {
		const message = `Weaver failed for ${summary.failed} repo(s).`;
		if (failOnError) {
			core.setFailed(message);
		} else {
			core.warning(`${message} (fail-on-error is off, so the job is not marked failed.)`);
		}
	}
}
