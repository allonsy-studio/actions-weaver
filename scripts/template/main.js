import * as core from "@actions/core";

/**
 * Replace this stub with the action's real logic.
 *
 * @param {import("@actions/github/lib/utils").GitHub} _client
 * @param {import("@actions/github").context} _context
 * @returns {Promise<void>}
 */
export default async function run(_client, _context) {
	const hello = core.getInput("hello");
	const greeting = `Hello, ${hello}!`;
	core.info(greeting);
	core.setOutput("greeting", greeting);
}
