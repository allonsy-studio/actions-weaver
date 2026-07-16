/**
 * Repo scanner — resolves the set of target repos via the GitHub REST API and
 * builds the per-repo variable context used to render templates.
 */

import * as core from "@actions/core";

/**
 * Recursively merge plain objects (source wins). Arrays and scalars are
 * replaced, not merged.
 *
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} source
 * @returns {Record<string, unknown>}
 */
export function deepMerge(target, source) {
	const out = { ...target };
	for (const [key, value] of Object.entries(source)) {
		const existing = out[key];
		if (value != null && typeof value === "object" && !Array.isArray(value) && existing != null && typeof existing === "object" && !Array.isArray(existing)) {
			out[key] = deepMerge(/** @type {Record<string, unknown>} */ (existing), /** @type {Record<string, unknown>} */ (value));
		} else {
			out[key] = value;
		}
	}
	return out;
}

/**
 * Resolve the list of repos to target.
 *
 * - An explicit list fetches each named repo directly.
 * - "*" lists every repo for the org (falling back to a user account), then
 *   filters out archived repos, forks, and the exclude list.
 *
 * @param {import("@actions/github").getOctokit extends never ? never : any} client
 * @param {import("./config.js").WeaverConfig} config
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function resolveRepos(client, config) {
	if (config.repos !== "*") {
		const fetched = await Promise.all(
			config.repos.map((name) =>
				client.rest.repos
					.get({ owner: config.org, repo: name })
					.then((res) => res.data)
					.catch((err) => {
						// A named repo that doesn't exist (or isn't accessible) is
						// skipped with a warning rather than aborting the whole run.
						if (err && err.status === 404) {
							core.warning(`Repo "${config.org}/${name}" was not found — skipping.`);
							return null;
						}
						throw err;
					}),
			),
		);
		return fetched.filter(Boolean);
	}

	let all;
	try {
		all = await client.paginate(client.rest.repos.listForOrg, {
			org: config.org,
			per_page: 100,
			type: "sources",
		});
	} catch {
		// Not an org (or no org access) — fall back to a user account listing.
		all = await client.paginate(client.rest.repos.listForUser, {
			username: config.org,
			per_page: 100,
		});
	}

	const exclude = new Set(config.exclude);
	return all.filter((repo) => {
		if (config.skipArchived && repo.archived) return false;
		if (config.skipForks && repo.fork) return false;
		if (exclude.has(repo.name)) return false;
		return true;
	});
}

/**
 * Build the template variable context for a single repo, merging user-supplied
 * variables on top of the built-ins.
 *
 * @param {Record<string, any>} repo Repo object from the REST API.
 * @param {Record<string, unknown>} variables User-supplied variables.
 * @returns {Record<string, unknown>}
 */
export function buildContext(repo, variables) {
	const builtins = {
		repo: {
			name: repo.name,
			full_name: repo.full_name,
			description: repo.description ?? "",
			url: repo.html_url,
			default_branch: repo.default_branch,
			license: repo.license?.spdx_id ?? repo.license?.key ?? "",
			language: repo.language ?? "",
			topics: repo.topics ?? [],
		},
		org: {
			name: repo.owner?.login ?? "",
			url: repo.owner?.html_url ?? "",
		},
	};
	return deepMerge(builtins, variables);
}
