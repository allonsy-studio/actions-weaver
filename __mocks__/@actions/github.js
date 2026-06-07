import { jest } from "@jest/globals";

/** @type {Partial<typeof import("@actions/github").context>} */
export const context = {
	eventName: "push",
	repo: { owner: "monalisa", repo: "helloworld" },
	payload: { ref: "refs/heads/main" },
};

/**
 * @returns {ReturnType<typeof import("@actions/github").getOctokit>}
 */
export const getOctokit = jest.fn().mockName("github.getOctokit");
