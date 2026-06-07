import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	walk,
	placeholder,
	buildReplacements,
	buildContentReplacements,
	applyReplacements,
	renameFiles,
	renderTemplateFile,
	clearChangesets,
	renderActionInput,
	renderActionOutput,
	renderActionIo,
	renderInputsTable,
	renderOutputsTable,
	renderUsageWith,
	parseRemoteOwner,
	parseGitConfigOwner,
	parseNoreplyHandle,
	parseGhUser,
} from "./rename.core.js";

const VALUES = {
	name: "my-action",
	description: "Does a thing",
	owner: "my-org",
	author: "octocat",
	authorEmail: "octocat@users.noreply.github.com",
};

describe("placeholder", () => {
	it("matches a token wrapped in braces, tolerating inner whitespace", () => {
		expect("{{ OWNER }}/{{OWNER}}".replace(placeholder("OWNER"), "x")).toBe("x/x");
	});

	it("does not match a different token with the same prefix", () => {
		expect("{{ ACTION_AUTHOR_EMAIL }}".replace(placeholder("ACTION_AUTHOR"), "x")).toBe("{{ ACTION_AUTHOR_EMAIL }}");
	});
});

describe("buildReplacements", () => {
	it("maps each placeholder to its trimmed value", () => {
		const replacements = buildReplacements({
			name: "  a  ",
			description: " b ",
			owner: " c ",
			author: " d ",
			authorEmail: " e ",
		});

		expect(replacements).toEqual([
			[placeholder("ACTION_NAME"), "a"],
			[placeholder("ACTION_DESCRIPTION"), "b"],
			[placeholder("ACTION_AUTHOR_EMAIL"), "e"],
			[placeholder("ACTION_AUTHOR"), "d"],
			[placeholder("OWNER"), "c"],
		]);
	});
});

describe("applyReplacements", () => {
	it("replaces every occurrence of each placeholder", () => {
		const input = "{{ OWNER }}/{{ ACTION_NAME }} — {{ ACTION_DESCRIPTION }} ({{ OWNER }}/{{ ACTION_NAME }})";

		const output = applyReplacements(input, buildReplacements(VALUES));

		expect(output).toBe("my-org/my-action — Does a thing (my-org/my-action)");
	});

	it("resolves the author/email placeholders distinctly", () => {
		const input = "{{ ACTION_AUTHOR }} <{{ ACTION_AUTHOR_EMAIL }}>";

		expect(applyReplacements(input, buildReplacements(VALUES))).toBe("octocat <octocat@users.noreply.github.com>");
	});

	it("leaves content without placeholders untouched", () => {
		const input = "nothing to see here";

		expect(applyReplacements(input, buildReplacements(VALUES))).toBe(input);
	});
});

describe("walk", () => {
	let root;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "rename-walk-"));
		writeFileSync(join(root, "a.txt"), "a");
		mkdirSync(join(root, "sub"));
		writeFileSync(join(root, "sub", "b.txt"), "b");
		mkdirSync(join(root, "node_modules"));
		writeFileSync(join(root, "node_modules", "skip.txt"), "skip");
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("recurses into subdirectories but skips ignored ones", () => {
		const files = walk(root).sort();

		expect(files).toEqual([join(root, "a.txt"), join(root, "sub", "b.txt")]);
	});
});

describe("renameFiles", () => {
	let root;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "rename-files-"));
		writeFileSync(join(root, "package.json"), '{"name":"{{ ACTION_NAME }}","owner":"{{ OWNER }}"}');
		writeFileSync(join(root, "README.md"), "# {{ ACTION_NAME }}\n\n{{ ACTION_DESCRIPTION }}");
		writeFileSync(join(root, "unchanged.md"), "no placeholders here");
		writeFileSync(join(root, "logo.png"), "{{ ACTION_NAME }}"); // non-text extension, must be ignored
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("rewrites placeholders only in text files and reports changed paths", () => {
		const updated = renameFiles(root, buildReplacements(VALUES)).sort();

		expect(updated).toEqual(["README.md", "package.json"]);
		expect(readFileSync(join(root, "package.json"), "utf8")).toBe('{"name":"my-action","owner":"my-org"}');
		expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# my-action\n\nDoes a thing");
	});

	it("does not touch files without placeholders or with non-text extensions", () => {
		renameFiles(root, buildReplacements(VALUES));

		expect(readFileSync(join(root, "unchanged.md"), "utf8")).toBe("no placeholders here");
		expect(readFileSync(join(root, "logo.png"), "utf8")).toBe("{{ ACTION_NAME }}");
	});

	it("returns an empty list when nothing matches", () => {
		mkdirSync(join(root, "empty"));
		const updated = renameFiles(join(root, "empty"), buildReplacements(VALUES));

		expect(updated).toEqual([]);
		expect(existsSync(join(root, "empty"))).toBe(true);
	});

	it("reports would-change paths without writing when dryRun is set", () => {
		const updated = renameFiles(root, buildReplacements(VALUES), { dryRun: true }).sort();

		// Same paths reported as a real run...
		expect(updated).toEqual(["README.md", "package.json"]);
		// ...but the files on disk are untouched.
		expect(readFileSync(join(root, "package.json"), "utf8")).toBe('{"name":"{{ ACTION_NAME }}","owner":"{{ OWNER }}"}');
		expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# {{ ACTION_NAME }}\n\n{{ ACTION_DESCRIPTION }}");
	});
});

describe("renderTemplateFile", () => {
	let root;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "rename-render-"));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("writes the rendered template to a separate destination", () => {
		const src = join(root, "template.json");
		const dest = join(root, "package.json");
		writeFileSync(src, '{"name":"{{ ACTION_NAME }}","owner":"{{ OWNER }}"}');
		writeFileSync(dest, '{"repository":"specific"}');

		renderTemplateFile(src, dest, buildReplacements(VALUES));

		expect(readFileSync(dest, "utf8")).toBe('{"name":"my-action","owner":"my-org"}');
		expect(readFileSync(src, "utf8")).toBe('{"name":"{{ ACTION_NAME }}","owner":"{{ OWNER }}"}');
	});

	it("can render a file in place", () => {
		const file = join(root, "in-place.md");
		writeFileSync(file, "# {{ ACTION_NAME }} by {{ OWNER }}");

		renderTemplateFile(file, file, buildReplacements(VALUES));

		expect(readFileSync(file, "utf8")).toBe("# my-action by my-org");
	});

	it("returns whether dest would change", () => {
		const src = join(root, "t.md");
		const dest = join(root, "out.md");
		writeFileSync(src, "{{ ACTION_NAME }}");

		// dest is missing -> would change
		expect(renderTemplateFile(src, dest, buildReplacements(VALUES))).toBe(true);
		// dest now matches the rendered output -> would not change
		expect(renderTemplateFile(src, dest, buildReplacements(VALUES))).toBe(false);
	});

	it("reports the change without writing when dryRun is set", () => {
		const src = join(root, "template.json");
		const dest = join(root, "package.json");
		writeFileSync(src, '{"name":"{{ ACTION_NAME }}"}');
		writeFileSync(dest, '{"repository":"specific"}');

		const changed = renderTemplateFile(src, dest, buildReplacements(VALUES), { dryRun: true });

		expect(changed).toBe(true);
		expect(readFileSync(dest, "utf8")).toBe('{"repository":"specific"}');
	});

	it("creates missing parent directories for a nested destination", () => {
		const src = join(root, "config.yml");
		const dest = join(root, ".github", "ISSUE_TEMPLATE", "config.yml");
		writeFileSync(src, "owner: {{ OWNER }}");

		renderTemplateFile(src, dest, buildReplacements(VALUES));

		expect(readFileSync(dest, "utf8")).toBe("owner: my-org");
	});
});

describe("clearChangesets", () => {
	let root;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "rename-changesets-"));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("removes pending changeset markdown but keeps README.md and config.json", () => {
		const dir = join(root, ".changeset");
		mkdirSync(dir);
		writeFileSync(join(dir, "config.json"), "{}");
		writeFileSync(join(dir, "README.md"), "# Changesets");
		writeFileSync(join(dir, "happy-pandas-jump.md"), "---\n\"pkg\": minor\n---\n");

		const removed = clearChangesets(root);

		expect(removed).toEqual([join(".changeset", "happy-pandas-jump.md")]);
		expect(existsSync(join(dir, "happy-pandas-jump.md"))).toBe(false);
		expect(existsSync(join(dir, "README.md"))).toBe(true);
		expect(existsSync(join(dir, "config.json"))).toBe(true);
	});

	it("reports would-remove paths without deleting when dryRun is set", () => {
		const dir = join(root, ".changeset");
		mkdirSync(dir);
		writeFileSync(join(dir, "stale.md"), "x");

		const removed = clearChangesets(root, { dryRun: true });

		expect(removed).toEqual([join(".changeset", "stale.md")]);
		expect(existsSync(join(dir, "stale.md"))).toBe(true);
	});

	it("returns an empty list when there is no .changeset directory", () => {
		expect(clearChangesets(root)).toEqual([]);
	});
});

describe("parseRemoteOwner", () => {
	it.each([
		["git@github.com:Allons-Y/My-Repo.git", "allons-y"],
		["https://github.com/allonsy-studio/repo.git", "allonsy-studio"],
		["https://github.com/allonsy-studio/repo", "allonsy-studio"],
		["ssh://git@github.com/Octocat/Hello.git", "octocat"],
	])("extracts and lowercases the owner from %s", (url, expected) => {
		expect(parseRemoteOwner(url)).toBe(expected);
	});

	it("returns undefined for missing input", () => {
		expect(parseRemoteOwner(undefined)).toBeUndefined();
	});
});

describe("parseGitConfigOwner", () => {
	it("reads the owner from the first remote url in .git/config text", () => {
		const config = ['[remote "origin"]', '\turl = git@github.com:acme/widget.git', "\tfetch = +refs/*"].join("\n");

		expect(parseGitConfigOwner(config)).toBe("acme");
	});

	it("returns undefined when there is no remote url", () => {
		expect(parseGitConfigOwner("[core]\n\tbare = false")).toBeUndefined();
		expect(parseGitConfigOwner(undefined)).toBeUndefined();
	});
});

describe("parseNoreplyHandle", () => {
	it.each([
		["19803989+castastrophe@users.noreply.github.com", "castastrophe"],
		["castastrophe@users.noreply.github.com", "castastrophe"],
		["Octocat@users.noreply.github.com", "octocat"],
	])("extracts the handle from %s", (email, expected) => {
		expect(parseNoreplyHandle(email)).toBe(expected);
	});

	it("returns undefined for non-noreply or missing emails", () => {
		expect(parseNoreplyHandle("me@example.com")).toBeUndefined();
		expect(parseNoreplyHandle(undefined)).toBeUndefined();
	});
});

describe("parseGhUser", () => {
	it("extracts the logged-in user from hosts.yml contents", () => {
		const hosts = ["github.com:", "    user: Castastrophe", "    git_protocol: https"].join("\n");

		expect(parseGhUser(hosts)).toBe("castastrophe");
	});

	it("returns undefined when no user is present", () => {
		expect(parseGhUser("github.com:\n    git_protocol: https")).toBeUndefined();
		expect(parseGhUser(undefined)).toBeUndefined();
	});
});

describe("renderActionInput", () => {
	it("renders an optional input with a default", () => {
		expect(renderActionInput({ name: "level", description: "How loud", required: false, default: "info" })).toBe(
			['    level:', '        description: "How loud"', "        required: false", '        default: "info"'].join("\n"),
		);
	});

	it("omits the default line for a required input", () => {
		expect(renderActionInput({ name: "path", description: "Target", required: true })).toBe(
			['    path:', '        description: "Target"', "        required: true"].join("\n"),
		);
	});

	it("escapes quotes in descriptions", () => {
		expect(renderActionInput({ name: "x", description: 'a "quoted" word' })).toContain(
			'description: "a \\"quoted\\" word"',
		);
	});
});

describe("renderActionOutput", () => {
	it("renders name and description", () => {
		expect(renderActionOutput({ name: "result", description: "The result" })).toBe(
			['    result:', '        description: "The result"'].join("\n"),
		);
	});
});

describe("renderActionIo", () => {
	it("always includes the token input and omits outputs when there are none", () => {
		const io = renderActionIo({ inputs: [], outputs: [] });

		expect(io).toContain("inputs:");
		expect(io).toContain("    token:");
		expect(io).toContain('default: "${{ github.token }}"');
		expect(io).not.toContain("outputs:");
	});

	it("appends user inputs and an outputs section", () => {
		const io = renderActionIo({
			inputs: [{ name: "foo", description: "Foo", required: true }],
			outputs: [{ name: "bar", description: "Bar" }],
		});

		expect(io).toContain("    foo:");
		expect(io).toMatch(/outputs:\n {4}bar:/);
	});
});

describe("renderInputsTable", () => {
	it("includes the token row and user inputs, with em-dash for missing defaults", () => {
		const table = renderInputsTable([{ name: "foo", description: "Foo", required: true }]);

		expect(table).toContain("| `token` | no | `${{ github.token }}` | GITHUB_TOKEN for the repository. |");
		expect(table).toContain("| `foo` | yes | — | Foo |");
	});
});

describe("renderOutputsTable", () => {
	it("notes when there are no outputs", () => {
		expect(renderOutputsTable([])).toBe("_This action defines no outputs._");
	});

	it("renders a row per output", () => {
		expect(renderOutputsTable([{ name: "bar", description: "Bar" }])).toContain("| `bar` | Bar |");
	});
});

describe("renderUsageWith", () => {
	it("is empty when there are no user inputs", () => {
		expect(renderUsageWith([])).toBe("");
	});

	it("renders a with: block listing inputs and their defaults", () => {
		expect(renderUsageWith([{ name: "foo", default: "bar" }, { name: "baz" }])).toBe(
			["", "  with:", "      foo: bar", "      baz:"].join("\n"),
		);
	});
});

describe("generators called without arguments", () => {
	it("default to an empty variable set", () => {
		expect(renderActionIo()).toContain("    token:");
		expect(renderActionIo()).not.toContain("outputs:");
		expect(renderInputsTable()).toContain("| `token` |");
		expect(renderOutputsTable()).toBe("_This action defines no outputs._");
		expect(renderUsageWith()).toBe("");
		expect(buildContentReplacements()).toHaveLength(4);
	});
});

describe("buildContentReplacements", () => {
	it("injects generated content for the action.yml IO and README placeholders", () => {
		const replacements = buildContentReplacements({
			inputs: [{ name: "foo", description: "Foo", required: false, default: "x" }],
			outputs: [{ name: "bar", description: "Bar" }],
		});
		const render = (tpl) => applyReplacements(tpl, replacements);

		expect(render("{{ ACTION_IO }}")).toContain("    foo:");
		expect(render("{{ ACTION_INPUTS_TABLE }}")).toContain("| `foo` | no | `x` | Foo |");
		expect(render("{{ ACTION_OUTPUTS_TABLE }}")).toContain("| `bar` | Bar |");
		expect(render("- uses: o/n@v1{{ ACTION_USAGE }}")).toBe("- uses: o/n@v1\n  with:\n      foo: x");
	});
});
