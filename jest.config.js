const isCI = !!process.env.CI;

/** @type {import('jest').Config} */
export default {
	clearMocks: true,
	moduleFileExtensions: ["js"],
	testEnvironment: "node",
	testMatch: ["**/scripts/*.test.js"],
	transform: {},
	verbose: true,
	// Cover the logic modules (scripts/rename.core.js) only. Entry
	// shells (index.js, scripts/rename.js) and config files are exercised at
	// runtime / in the e2e CI run rather than unit-tested.
	collectCoverageFrom: [
		"**/scripts/*.js",
		"!**/scripts/rename.js",
		"!**/scripts/*.test.js",
		"!**/node_modules/**",
	],
	coverageDirectory: "./coverage",
	coverageReporters: isCI ? ["cobertura", "json"] : ["text", "text-summary"],
	coverageThreshold: {
		global: {
			branches: 80,
			functions: 80,
			lines: 80,
			statements: -10,
		},
	},
};
