import { jest } from "@jest/globals";

import { isTransient, backoffMs, withRetry } from "../src/retry.js";

describe("isTransient", () => {
	it("treats 429 and 5xx as transient", () => {
		expect(isTransient({ status: 429 })).toBe(true);
		expect(isTransient({ status: 502 })).toBe(true);
		expect(isTransient({ status: 503 })).toBe(true);
	});

	it("treats a secondary-rate-limit 403 as transient but a plain 403 as not", () => {
		expect(isTransient({ status: 403, message: "You have exceeded a secondary rate limit" })).toBe(true);
		expect(isTransient({ status: 403, message: "Resource not accessible by integration" })).toBe(false);
	});

	it("treats GitHub's edge HTML 400 page as transient but a plain 400 as not", () => {
		expect(isTransient({ status: 400, message: "<h1>Whoa there!</h1> invalid request" })).toBe(true);
		expect(isTransient({ status: 400, message: "Invalid request.\n\n'sha' wasn't supplied." })).toBe(true);
		expect(isTransient({ status: 400, message: "Problems parsing JSON" })).toBe(false);
	});

	it("treats 404 and unknown errors as not transient", () => {
		expect(isTransient({ status: 404 })).toBe(false);
		expect(isTransient(new Error("boom"))).toBe(false);
		expect(isTransient(null)).toBe(false);
	});
});

describe("backoffMs", () => {
	it("honours a numeric retry-after header (seconds → ms)", () => {
		expect(backoffMs({ response: { headers: { "retry-after": "5" } } }, 0, 1000)).toBe(5000);
	});

	it("falls back to exponential backoff without a header", () => {
		expect(backoffMs({}, 0, 1000)).toBe(1000);
		expect(backoffMs({}, 1, 1000)).toBe(2000);
		expect(backoffMs({}, 2, 1000)).toBe(4000);
	});
});

describe("withRetry", () => {
	const sleep = () => Promise.resolve();

	it("returns the result on first success without sleeping", async () => {
		const fn = jest.fn().mockResolvedValue("ok");
		await expect(withRetry(fn, { sleep })).resolves.toBe("ok");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("retries transient errors then succeeds", async () => {
		const fn = jest.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce("recovered");
		await expect(withRetry(fn, { sleep })).resolves.toBe("recovered");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("gives up after the retry budget and rejects with the last error", async () => {
		const fn = jest.fn().mockRejectedValue({ status: 503 });
		await expect(withRetry(fn, { retries: 2, sleep })).rejects.toMatchObject({ status: 503 });
		expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
	});

	it("does not retry a non-transient error", async () => {
		const fn = jest.fn().mockRejectedValue({ status: 404 });
		await expect(withRetry(fn, { sleep })).rejects.toMatchObject({ status: 404 });
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("invokes onRetry before each retry", async () => {
		const onRetry = jest.fn();
		const fn = jest.fn().mockRejectedValueOnce({ status: 429 }).mockResolvedValueOnce("ok");
		await withRetry(fn, { sleep, onRetry });
		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(onRetry).toHaveBeenCalledWith({ status: 429 }, 0, expect.any(Number));
	});
});
