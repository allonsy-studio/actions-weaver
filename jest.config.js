const isCI = !!process.env.CI;

/** @type {import('jest').Config} */
export default {
	clearMocks: true,
	moduleFileExtensions: ["js"],
	testEnvironment: "node",
	testMatch: ["**/*.test.js"],
	transform: {},
	verbose: true,
	// Redirect the @actions/* packages to the hand-written manual mocks in
	// __mocks__/ so both the tests and main.js share the same mocked instance
	// (no jest.mock / unstable_mockModule needed under native ESM).
	moduleNameMapper: {
		"^@actions/core$": "<rootDir>/__mocks__/@actions/core.js",
		"^@actions/github$": "<rootDir>/__mocks__/@actions/github.js",
	},
	// Cover the action's logic (main.js); the entry shell (index.js) runs at
	// action runtime rather than under test.
	collectCoverageFrom: ["src/**/*.js", "!src/index.js", "!**/node_modules/**"],
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
