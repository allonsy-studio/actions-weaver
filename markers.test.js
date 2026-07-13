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

	it("warns when END precedes START", () => {
		const input = "<!-- weaver:footer:END -->\nx\n<!-- weaver:footer:START -->\n";
		const { warnings } = applyBlocks(input, { footer: "Y" }, "");
		expect(warnings[0]).toMatch(/before its START/);
	});
});
