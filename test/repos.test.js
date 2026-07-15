import { jest } from "@jest/globals";

import { deepMerge, buildContext, resolveRepos } from "../src/repos.js";

describe("deepMerge", () => {
	it("merges nested objects with source winning", () => {
		expect(deepMerge({ org: { a: 1, b: 2 } }, { org: { b: 3 } })).toEqual({ org: { a: 1, b: 3 } });
	});

	it("replaces arrays rather than merging them", () => {
		expect(deepMerge({ x: [1, 2] }, { x: [3] })).toEqual({ x: [3] });
	});
});

describe("buildContext", () => {
	const repo = {
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

	it("maps built-in repo and org variables", () => {
		const ctx = buildContext(repo, {});
		expect(ctx.repo.name).toBe("envoy");
		expect(ctx.repo.license).toBe("MPL-2.0");
		expect(ctx.org.name).toBe("acme");
	});

	it("merges user variables over built-ins", () => {
		const ctx = buildContext(repo, { org: { tagline: "hi" } });
		expect(ctx.org.name).toBe("acme");
		expect(ctx.org.tagline).toBe("hi");
	});
});

describe("resolveRepos", () => {
	it("fetches an explicit repo list", async () => {
		const client = {
			rest: { repos: { get: jest.fn().mockResolvedValue({ data: { name: "r" } }) } },
		};
		const repos = await resolveRepos(client, { org: "acme", repos: ["r"] });
		expect(repos).toEqual([{ name: "r" }]);
		expect(client.rest.repos.get).toHaveBeenCalledWith({ owner: "acme", repo: "r" });
	});

	it('lists and filters the org for "*"', async () => {
		const client = {
			rest: { repos: { listForOrg: "org", listForUser: "user" } },
			paginate: jest.fn().mockResolvedValue([
				{ name: "keep", archived: false, fork: false },
				{ name: "old", archived: true, fork: false },
				{ name: "forked", archived: false, fork: true },
				{ name: "skip", archived: false, fork: false },
			]),
		};
		const repos = await resolveRepos(client, {
			org: "acme",
			repos: "*",
			exclude: ["skip"],
			skipForks: true,
			skipArchived: true,
		});
		expect(repos.map((r) => r.name)).toEqual(["keep"]);
	});

	it("falls back to a user listing when the org call fails", async () => {
		const client = {
			rest: { repos: { listForOrg: "org", listForUser: "user" } },
			paginate: jest
				.fn()
				.mockRejectedValueOnce(new Error("not an org"))
				.mockResolvedValueOnce([{ name: "u", archived: false, fork: false }]),
		};
		const repos = await resolveRepos(client, {
			org: "person",
			repos: "*",
			exclude: [],
			skipForks: true,
			skipArchived: true,
		});
		expect(repos.map((r) => r.name)).toEqual(["u"]);
		expect(client.paginate).toHaveBeenCalledTimes(2);
	});
});
