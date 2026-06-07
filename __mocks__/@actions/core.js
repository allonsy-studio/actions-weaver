import { jest } from "@jest/globals";

/** @typedef {Record<string, string>} InputMap */

/** @type {InputMap} */
let inputs = {};

/**
 * @param {InputMap} next
 * @returns {void}
 */
export function __setInputs(next) {
	inputs = next;
}

/**
 * @returns {void}
 */
export function __resetInputs() {
	inputs = {};
}

/**
 * @param {string} name
 * @returns {string}
 */
export const getInput = jest.fn((name) => inputs[name] ?? "").mockName("core.getInput");

/**
 * @param {string} name
 * @returns {boolean}
 */
export const getBooleanInput = jest
	.fn((name) => {
		const value = (inputs[name] ?? "").toLowerCase();
		if (value === "true") return true;
		if (value === "false" || value === "") return false;
		throw new TypeError(`Input does not meet YAML 1.2 "Core Schema" specification: ${name}`);
	})
	.mockName("core.getBooleanInput");

export const debug = jest.fn().mockName("core.debug");
export const info = jest.fn().mockName("core.info");
export const warning = jest.fn().mockName("core.warning");
export const error = jest.fn().mockName("core.error");
export const setOutput = jest.fn().mockName("core.setOutput");
export const setFailed = jest.fn().mockName("core.setFailed");

const addHeading = jest.fn().mockName("core.summary.addHeading");
const addRaw = jest.fn().mockName("core.summary.addRaw");
const addList = jest.fn().mockName("core.summary.addList");
const write = jest.fn().mockName("core.summary.write");

/** @type {typeof import("@actions/core").summary} */
const summaryChain = { addHeading, addRaw, addList, write };

addHeading.mockReturnValue(summaryChain);
addRaw.mockReturnValue(summaryChain);
addList.mockReturnValue(summaryChain);
write.mockResolvedValue(summaryChain);

export const summary = summaryChain;
