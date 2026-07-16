import * as core from "@actions/core";

import { loadConfig, parseList, parseVariables } from "../src/config.js";

const context = { repo: { owner: "monalisa" } };

beforeEach(() => {
	core.__resetInputs();
});

describe("parseList", () => {
	it("splits on commas and newlines, trimming blanks", () => {
		expect(parseList("a, b\n c \n\n,")).toEqual(["a", "b", "c"]);
	});
});

describe("parseVariables", () => {
	it("returns an empty object for blank input", () => {
		expect(parseVariables("")).toEqual({});
	});

	it("parses a JSON object", () => {
		expect(parseVariables('{"org":{"name":"X"}}')).toEqual({ org: { name: "X" } });
	});

	it("throws on invalid JSON", () => {
		expect(() => parseVariables("{bad")).toThrow(/valid JSON/);
	});

	it("throws when the JSON is not an object", () => {
		expect(() => parseVariables("[1,2]")).toThrow(/JSON object/);
	});
});

describe("loadConfig", () => {
	it("applies fallbacks when inputs are unset", () => {
		const config = loadConfig(context);
		expect(config.templatesDir).toBe("templates");
		expect(config.targetFile).toBe("README.md");
		expect(config.repos).toBe("*");
		expect(config.skipForks).toBe(true);
		expect(config.skipArchived).toBe(true);
		expect(config.branch).toBe("weaver/sync-templates");
		expect(config.dryRun).toBe(false);
		expect(config.maxValueLength).toBe(1000);
		expect(config.failOnError).toBe(true);
		expect(config.maxRetries).toBe(3);
	});

	it("reads explicit inputs", () => {
		core.__setInputs({
			repos: "a, b",
			exclude: "c",
			"skip-forks": "false",
			"dry-run": "true",
			variables: '{"k":"v"}',
			"max-value-length": "50",
			"fail-on-error": "false",
			"max-retries": "5",
		});
		const config = loadConfig(context);
		expect(config.repos).toEqual(["a", "b"]);
		expect(config.exclude).toEqual(["c"]);
		expect(config.skipForks).toBe(false);
		expect(config.dryRun).toBe(true);
		expect(config.variables).toEqual({ k: "v" });
		expect(config.maxValueLength).toBe(50);
		expect(config.failOnError).toBe(false);
		expect(config.maxRetries).toBe(5);
	});
});
