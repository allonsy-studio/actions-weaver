// @actions/core and @actions/github resolve to the manual mocks in __mocks__/
// via moduleNameMapper, so main.js and this test share the same instances.
import { jest } from "@jest/globals";
import * as core from "@actions/core";
import * as github from "@actions/github";

import run from "../src/main.js";

const context = { repo: { owner: "acme" } };

const README = "# envoy\n\n<!-- weaver:footer:START -->\nold\n<!-- weaver:footer:END -->\n";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

const repoData = {
	name: "envoy",
	full_name: "acme/envoy",
	description: "desc",
	html_url: "https://github.com/acme/envoy",
	default_branch: "main",
	license: { spdx_id: "MPL-2.0" },
	language: "JavaScript",
	topics: ["cli"],
	owner: { login: "acme", html_url: "https://github.com/acme" },
};

beforeEach(() => {
	core.__resetInputs();
});

describe("run", () => {
	it("fails fast when the templates directory is missing", async () => {
		core.__setInputs({ templates: "__fixtures__/does-not-exist", repos: "envoy" });
		await expect(run({}, context)).rejects.toThrow(/Templates directory/);
	});

	it("renders templates and reports a dry-run without opening PRs", async () => {
		core.__setInputs({
			templates: "__fixtures__/templates",
			org: "acme",
			repos: "envoy",
			"dry-run": "true",
		});

		const client = {
			rest: {
				repos: {
					get: jest.fn().mockResolvedValue({ data: repoData }),
					getContent: jest.fn().mockResolvedValue({
						data: { type: "file", content: b64(README), sha: "s1" },
					}),
				},
			},
		};

		await run(client, context);

		expect(core.setOutput).toHaveBeenCalledWith("pull-requests", "[]");
		const summaryCall = core.setOutput.mock.calls.find((c) => c[0] === "summary");
		expect(JSON.parse(summaryCall[1])).toMatchObject({ dryRun: 1, opened: 0, failed: 0 });
		expect(core.setFailed).not.toHaveBeenCalled();
	});

	it("collects PR links as output when repos change", async () => {
		core.__setInputs({
			templates: "__fixtures__/templates",
			org: "acme",
			repos: "envoy",
		});

		const client = {
			rest: {
				repos: {
					get: jest.fn().mockResolvedValue({ data: repoData }),
					getContent: jest
						.fn()
						.mockResolvedValueOnce({ data: { type: "file", content: b64(README), sha: "base" } })
						.mockResolvedValueOnce({ data: { type: "file", content: b64(README), sha: "head" } }),
					createOrUpdateFileContents: jest.fn().mockResolvedValue({}),
				},
				git: {
					getRef: jest
						.fn()
						.mockResolvedValueOnce({ data: { object: { sha: "basesha" } } })
						.mockRejectedValueOnce({ status: 404 }),
					createRef: jest.fn().mockResolvedValue({}),
				},
				pulls: {
					list: jest.fn().mockResolvedValue({ data: [] }),
					create: jest.fn().mockResolvedValue({ data: { html_url: "https://pr/1", number: 1 } }),
				},
			},
		};

		await run(client, context);

		const prCall = core.setOutput.mock.calls.find((c) => c[0] === "pull-requests");
		expect(JSON.parse(prCall[1])).toEqual([{ repo: "acme/envoy", url: "https://pr/1", number: 1 }]);
		expect(core.setFailed).not.toHaveBeenCalled();
	});

	it("marks the run failed when a repo errors", async () => {
		core.__setInputs({
			templates: "__fixtures__/templates",
			org: "acme",
			repos: "envoy",
		});

		const client = {
			rest: {
				repos: {
					get: jest.fn().mockResolvedValue({ data: repoData }),
					getContent: jest.fn().mockRejectedValue(new Error("boom")),
				},
			},
		};

		await run(client, context);
		expect(core.setFailed).toHaveBeenCalledWith(expect.stringMatching(/failed for 1/));
	});

	it("reports repo errors without failing the job when fail-on-error is off", async () => {
		core.__setInputs({
			templates: "__fixtures__/templates",
			org: "acme",
			repos: "envoy",
			"fail-on-error": "false",
		});

		const client = {
			rest: {
				repos: {
					get: jest.fn().mockResolvedValue({ data: repoData }),
					getContent: jest.fn().mockRejectedValue(new Error("boom")),
				},
			},
		};

		await run(client, context);
		expect(core.setFailed).not.toHaveBeenCalled();
		const summaryCall = core.setOutput.mock.calls.find((c) => c[0] === "summary");
		expect(JSON.parse(summaryCall[1])).toMatchObject({ failed: 1 });
	});

	it("keeps the existing github mock import wired", () => {
		expect(typeof github.getOctokit).toBe("function");
	});
});
