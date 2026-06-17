/**
 * Committer — PR delivery. For each repo, Weaver renders the target file,
 * pushes the change onto a head branch via the Contents API, and opens (or
 * reuses) a single pull request. It never commits to the base branch directly.
 */

/**
 * Decode a base64 Contents API payload to a UTF-8 string.
 *
 * @param {string} base64
 * @returns {string}
 */
function decode(base64) {
	return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Encode a UTF-8 string for the Contents API.
 *
 * @param {string} text
 * @returns {string}
 */
function encode(text) {
	return Buffer.from(text, "utf8").toString("base64");
}

/**
 * Fetch a file's content + blob SHA on a given ref, or null if absent.
 *
 * @param {any} client
 * @param {{ owner: string, repo: string, path: string, ref: string }} params
 * @returns {Promise<{ content: string, sha: string } | null>}
 */
async function getFile(client, { owner, repo, path, ref }) {
	try {
		const res = await client.rest.repos.getContent({ owner, repo, path, ref });
		if (Array.isArray(res.data) || res.data.type !== "file") return null;
		return { content: decode(res.data.content), sha: res.data.sha };
	} catch (err) {
		if (err && err.status === 404) return null;
		throw err;
	}
}

/**
 * Ensure the head branch exists, creating it from the base branch SHA if not.
 *
 * @param {any} client
 * @param {{ owner: string, repo: string, branch: string, baseSha: string }} params
 * @returns {Promise<void>}
 */
async function ensureBranch(client, { owner, repo, branch, baseSha }) {
	try {
		await client.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
	} catch (err) {
		if (err && err.status === 404) {
			await client.rest.git.createRef({
				owner,
				repo,
				ref: `refs/heads/${branch}`,
				sha: baseSha,
			});
			return;
		}
		throw err;
	}
}

/**
 * Find an open PR for this head→base pair, or null.
 *
 * @param {any} client
 * @param {{ owner: string, repo: string, branch: string, base: string }} params
 * @returns {Promise<{ number: number, html_url: string } | null>}
 */
async function findOpenPr(client, { owner, repo, branch, base }) {
	const res = await client.rest.pulls.list({
		owner,
		repo,
		state: "open",
		head: `${owner}:${branch}`,
		base,
	});
	return res.data[0] ?? null;
}

/**
 * @typedef {Object} SyncResult
 * @property {string} repo Full name (owner/repo).
 * @property {"opened" | "updated" | "skipped" | "dry-run"} status
 * @property {string} [url] PR URL (when a PR was opened or already existed).
 * @property {number} [number] PR number.
 * @property {string[]} [applied] Block names that changed.
 * @property {string[]} [warnings]
 */

/**
 * Render the target file for one repo and open/update a PR if it changed.
 *
 * @param {any} client
 * @param {Record<string, any>} repo Repo object from the REST API.
 * @param {{
 *   path: string,
 *   branch: string,
 *   base?: string,
 *   commitMessage: string,
 *   prTitle: string,
 *   prBody: string,
 *   dryRun: boolean,
 *   transform: (content: string) => import("./markers.js").ApplyResult,
 * }} opts
 * @returns {Promise<SyncResult>}
 */
export async function syncRepo(client, repo, opts) {
	const owner = repo.owner.login;
	const name = repo.name;
	const fullName = repo.full_name;
	const base = opts.base || repo.default_branch;

	const baseFile = await getFile(client, { owner, repo: name, path: opts.path, ref: base });
	if (!baseFile) {
		return { repo: fullName, status: "skipped", warnings: [`${opts.path} not found.`] };
	}

	const result = opts.transform(baseFile.content);
	if (result.errors.length > 0) {
		return { repo: fullName, status: "skipped", warnings: result.errors };
	}
	// Nothing to inject (no markers present, or content already current).
	if (result.applied.length === 0 || result.content === baseFile.content) {
		return { repo: fullName, status: "skipped", applied: [], warnings: result.warnings };
	}

	if (opts.dryRun) {
		return {
			repo: fullName,
			status: "dry-run",
			applied: result.applied,
			warnings: result.warnings,
		};
	}

	const baseRef = await client.rest.git.getRef({ owner, repo: name, ref: `heads/${base}` });
	await ensureBranch(client, { owner, repo: name, branch: opts.branch, baseSha: baseRef.data.object.sha });

	// Re-render against the branch's current content so we never revert changes
	// already present on the branch from a prior run (idempotent).
	const headFile = await getFile(client, { owner, repo: name, path: opts.path, ref: opts.branch });
	const headResult = opts.transform(headFile ? headFile.content : baseFile.content);

	if (!headFile || headResult.content !== headFile.content) {
		await client.rest.repos.createOrUpdateFileContents({
			owner,
			repo: name,
			path: opts.path,
			message: opts.commitMessage,
			content: encode(headResult.content),
			branch: opts.branch,
			...(headFile ? { sha: headFile.sha } : {}),
		});
	}

	const existing = await findOpenPr(client, { owner, repo: name, branch: opts.branch, base });
	if (existing) {
		return {
			repo: fullName,
			status: "updated",
			url: existing.html_url,
			number: existing.number,
			applied: result.applied,
			warnings: result.warnings,
		};
	}

	const pr = await client.rest.pulls.create({
		owner,
		repo: name,
		title: opts.prTitle,
		body: opts.prBody,
		head: opts.branch,
		base,
	});
	return {
		repo: fullName,
		status: "opened",
		url: pr.data.html_url,
		number: pr.data.number,
		applied: result.applied,
		warnings: result.warnings,
	};
}
