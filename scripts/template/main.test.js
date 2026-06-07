// @actions/core and @actions/github resolve to the manual mocks in __mocks__/
// via moduleNameMapper, so main.js and this test share the same instances.
import * as core from "@actions/core";
import * as github from "@actions/github";

import run from "./main.js";

describe("main", () => {
	it("greets the hello input", async () => {
		core.getInput.mockReturnValueOnce("world");

		await run(github.getOctokit("token"), github.context);

		expect(core.setOutput).toHaveBeenCalledWith("greeting", "Hello, world!");
	});
});
