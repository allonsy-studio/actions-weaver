import { findMarkers, applyBlocks } from "./markers.js";

const wrap = (body) => `# title\n\n<!-- weaver:footer:START -->\n${body}\n<!-- weaver:footer:END -->\n`;

describe("markers", () => {
	it("finds paired markers", () => {
		const markers = findMarkers(wrap("old"));
		expect(markers.map((m) => `${m.name}:${m.type}`)).toEqual(["footer:START", "footer:END"]);
	});

	it("replaces content between markers and inserts the notice", () => {
		const { content, applied, warnings, errors } = applyBlocks(
			wrap("old"),
			{ footer: "NEW" },
			"managed",
		);
		expect(applied).toEqual(["footer"]);
		expect(warnings).toEqual([]);
		expect(errors).toEqual([]);
		expect(content).toContain("(managed)");
		expect(content).toContain("NEW");
		expect(content).not.toContain("old");
		// Markers themselves are preserved.
		expect(content).toContain("<!-- weaver:footer:START -->");
		expect(content).toContain("<!-- weaver:footer:END -->");
	});

	it("leaves blocks without a rendered value untouched", () => {
		const input = wrap("old");
		const { content, applied } = applyBlocks(input, { header: "X" }, "");
		expect(applied).toEqual([]);
		expect(content).toBe(input);
	});

	it("warns on an unpaired START marker", () => {
		const input = "<!-- weaver:footer:START -->\nx\n";
		const { applied, warnings } = applyBlocks(input, { footer: "Y" }, "");
		expect(applied).toEqual([]);
		expect(warnings[0]).toMatch(/no END/);
	});

	it("warns on an unpaired END marker", () => {
		const input = "x\n<!-- weaver:footer:END -->\n";
		const { warnings } = applyBlocks(input, { footer: "Y" }, "");
		expect(warnings[0]).toMatch(/no START/);
	});

	it("errors on duplicate markers", () => {
		const input = `${wrap("a")}${wrap("b")}`;
		const { errors } = applyBlocks(input, { footer: "Y" }, "");
		expect(errors[0]).toMatch(/duplicate/);
	});

	it("ignores marker examples inside fenced code blocks", () => {
		const input = [
			"Add these markers:",
			"",
			"```html",
			"<!-- weaver:footer:START -->",
			"<!-- weaver:footer:END -->",
			"```",
			"",
			"<!-- weaver:footer:START -->",
			"old",
			"<!-- weaver:footer:END -->",
			"",
		].join("\n");
		const markers = findMarkers(input);
		expect(markers.map((m) => `${m.name}:${m.type}`)).toEqual(["footer:START", "footer:END"]);

		const { content, applied, warnings, errors } = applyBlocks(input, { footer: "NEW" }, "");
		expect(errors).toEqual([]);
		expect(warnings).toEqual([]);
		expect(applied).toEqual(["footer"]);
		expect(content).toContain("NEW");
		expect(content).not.toContain("old");
		// The fenced example is untouched.
		expect(content).toContain("```html\n<!-- weaver:footer:START -->\n<!-- weaver:footer:END -->\n```");
	});

	it("ignores markers in tilde fences and unclosed fences", () => {
		const tilde = "~~~\n<!-- weaver:footer:START -->\n~~~\n";
		expect(findMarkers(tilde)).toEqual([]);

		const unclosed = "```\n<!-- weaver:footer:START -->\n<!-- weaver:footer:END -->\n";
		expect(findMarkers(unclosed)).toEqual([]);
	});

	it("does not treat a longer closing fence of the other character as a close", () => {
		const input = [
			"```",
			"~~~~",
			"<!-- weaver:footer:START -->",
			"```",
			"<!-- weaver:footer:END -->",
			"",
		].join("\n");
		// The backtick fence closes at the second ```; the END marker after it is real.
		expect(findMarkers(input).map((m) => `${m.name}:${m.type}`)).toEqual(["footer:END"]);
	});

	it("warns when END precedes START", () => {
		const input = "<!-- weaver:footer:END -->\nx\n<!-- weaver:footer:START -->\n";
		const { warnings } = applyBlocks(input, { footer: "Y" }, "");
		expect(warnings[0]).toMatch(/before its START/);
	});
});
