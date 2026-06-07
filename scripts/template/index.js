import * as core from "@actions/core";
import { getOctokit, context } from "@actions/github";

import run from "./main.js";

const token = core.getInput("token", { required: true });

const client = getOctokit(token, {
	userAgent: "{{ ACTION_NAME }}",
});

run(client, context).catch((err) => {
	const message = err instanceof Error ? err.message : String(err);
	core.setFailed(message);
});
