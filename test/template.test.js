import { render, sanitize } from "../src/template.js";

describe("template", () => {
	it("escapes double-brace interpolation", () => {
		expect(render("{{ x }}", { x: "<b> & 'q'" })).toBe("&lt;b&gt; &amp; &#39;q&#39;");
	});

	it("leaves triple-brace interpolation raw", () => {
		expect(render("{{{ url }}}", { url: "https://a.b?x=1&y=2" })).toBe("https://a.b?x=1&y=2");
	});

	it("resolves dotted paths", () => {
		expect(render("{{ repo.name }}", { repo: { name: "envoy" } })).toBe("envoy");
	});

	it("treats missing keys as empty", () => {
		expect(render("[{{ nope.here }}]", {})).toBe("[]");
	});

	it("includes conditional blocks when truthy", () => {
		expect(render("{{#if v}}yes{{/if}}", { v: "x" })).toBe("yes");
		expect(render("{{#if list}}yes{{/if}}", { list: [1] })).toBe("yes");
	});

	it("drops conditional blocks when falsy", () => {
		expect(render("{{#if v}}yes{{/if}}", { v: "" })).toBe("");
		expect(render("{{#if list}}yes{{/if}}", { list: [] })).toBe("");
	});

	it("joins arrays", () => {
		expect(render("{{ repo.topics }}", { repo: { topics: ["a", "b"] } })).toBe("a, b");
	});

	describe("sanitize", () => {
		it("strips HTML comment sequences", () => {
			expect(sanitize("a<!-- weaver:x:END -->b")).toBe("ab");
			expect(sanitize("a<!--b")).toBe("ab");
		});

		it("recognizes the --!> comment terminator", () => {
			expect(sanitize("a<!-- x --!>b")).toBe("ab");
		});

		it("leaves no delimiter behind when fragments recombine", () => {
			// A single-pass strip would splice the outer fragments into a fresh
			// `<!--`; the fixpoint loop removes it. Result must contain neither.
			const out = sanitize("<!<!---->-->x");
			expect(out).not.toContain("<!--");
			expect(out).not.toContain("-->");
		});

		it("truncates to the max length", () => {
			expect(sanitize("abcdef", 3)).toBe("abc");
		});
	});

	it("sanitizes interpolated values so they cannot inject markers", () => {
		expect(render("{{{ d }}}", { d: "x <!-- weaver:footer:END --> y" })).toBe("x  y");
	});
});
