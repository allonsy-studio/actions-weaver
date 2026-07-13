import { jest } from "@jest/globals";

import { syncRepo } from "./commit.js";
import { applyBlocks } from "./markers.js";

const repo = {
	owner: { login: "acme" },
	name: "envoy",
	full_name: "acme/envoy",
	default_branch: "main",
};

const README = "# envoy\n\n<!-- weaver:footer:START -->\nold\n<!-- weaver:footer:END -->\n";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

const transform = (content) => applyBlocks(content, { footer: "NEW FOOTER" }, "managed");
const noop = (content) => applyBlocks(content, { header: "X" }, "");

const baseOpts = {
	path: "README.md",
	branch: "weaver/sync-templates",
	commitMessage: (applied) => `sync ${applied.join(",")}`,
	prTitle: () => "title",
	prBody: (applied) => `blocks: ${applied.join(",")}`,
	dryRun: false,
};

describe("syncRepo", () => {
	it("skips when the target file is missing", async () => {
		const client = {
			rest: { repos: { getContent: jest.fn().mockRejectedValue({ status: 404 }) } },
		};
		const result = await syncRepo(client, repo, { ...baseOpts, transform });
		expect(result.status).toBe("skipped");
		expect(result.warnings[0]).toMatch(/not found/);
	});

	it("skips when no blocks change", async () => {
		const client = {
			rest: {
				repos: {
					getContent: jest.fn().mockResolvedValue({
						data: { type: "file", content: b64(README), sha: "s1" },
					}),
				},
			},
		};
		const result = await syncRepo(client, repo, { ...baseOpts, transform: noop });
		expect(result.status).toBe("skipped");
	});

	it("reports a dry-run without writing", async () => {
		const getContent = jest.fn().mockResolvedValue({
			data: { type: "file", content: b64(README), sha: "s1" },
		});
		const client = { rest: { repos: { getContent } } };
		const result = await syncRepo(client, repo, { ...baseOpts, dryRun: true, transform });
		expect(result.status).toBe("dry-run");
		expect(result.applied).toEqual(["footer"]);
	});

	it("opens a pull request when content changes", async () => {
		const client = {
			rest: {
				repos: {
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
					create: jest
						.fn()
						.mockResolvedValue({ data: { html_url: "https://pr/1", number: 1 } }),
				},
			},
		};
		const result = await syncRepo(client, repo, { ...baseOpts, transform });
		expect(result.status).toBe("opened");
		expect(result.url).toBe("https://pr/1");
		expect(result.number).toBe(1);
		expect(client.rest.git.createRef).toHaveBeenCalled();
		expect(client.rest.repos.createOrUpdateFileContents).toHaveBeenCalled();
		// Messages reflect only the blocks that actually changed in this repo.
		expect(client.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
			expect.objectContaining({ message: "sync footer" }),
		);
		expect(client.rest.pulls.create).toHaveBeenCalledWith(
			expect.objectContaining({ body: "blocks: footer" }),
		);
	});

	it("reuses an existing open pull request", async () => {
		const client = {
			rest: {
				repos: {
					getContent: jest
						.fn()
						.mockResolvedValueOnce({ data: { type: "file", content: b64(README), sha: "base" } })
						.mockResolvedValueOnce({
							// branch already has the rendered content → no re-commit
							data: { type: "file", content: b64(transform(README).content), sha: "head" },
						}),
					createOrUpdateFileContents: jest.fn().mockResolvedValue({}),
				},
				git: {
					getRef: jest.fn().mockResolvedValue({ data: { object: { sha: "basesha" } } }),
					createRef: jest.fn().mockResolvedValue({}),
				},
				pulls: {
					list: jest
						.fn()
						.mockResolvedValue({ data: [{ html_url: "https://pr/9", number: 9 }] }),
					create: jest.fn(),
				},
			},
		};
		const result = await syncRepo(client, repo, { ...baseOpts, transform });
		expect(result.status).toBe("updated");
		expect(result.number).toBe(9);
		expect(client.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
		expect(client.rest.pulls.create).not.toHaveBeenCalled();
	});
});
