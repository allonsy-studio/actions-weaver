/**
 * Retry helper for transient GitHub API failures.
 *
 * When Weaver writes to many repos in quick succession, GitHub occasionally
 * rejects a request with a secondary (abuse) rate limit rather than a normal
 * REST error. That surfaces in three shapes: a 403/429 carrying a
 * `retry-after` header, a 5xx blip, or — at the edge — a generic HTML
 * "You have sent an invalid request" page served with a 400. All of these are
 * safe to retry; a genuine 4xx (bad input, missing resource, no permission) is
 * not, and is re-thrown immediately so real problems still surface.
 */

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Decide whether an error is a transient GitHub failure worth retrying.
 *
 * @param {any} err
 * @returns {boolean}
 */
export function isTransient(err) {
	if (!err) return false;
	const status = err.status;
	const body = typeof err.message === "string" ? err.message : "";
	if (TRANSIENT_STATUSES.has(status)) return true;
	// Secondary rate limits reach us as a 403 (with an abuse/rate-limit message)
	// or as GitHub's edge-level HTML 400 page. Genuine 400s/403s are not retried.
	if (status === 403) return /rate limit|abuse|secondary/i.test(body);
	if (status === 400) return /invalid request|rate limit|whoa there/i.test(body);
	return false;
}

/**
 * Delay before the next attempt: honour a `retry-after` header when GitHub
 * sends one, otherwise back off exponentially (baseDelay, ×2, ×4, …).
 *
 * @param {any} err
 * @param {number} attempt Zero-based attempt index that just failed.
 * @param {number} baseDelayMs
 * @returns {number}
 */
export function backoffMs(err, attempt, baseDelayMs) {
	const headers = err?.response?.headers ?? {};
	const retryAfter = Number(headers["retry-after"]);
	if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
	return baseDelayMs * 2 ** attempt;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function defaultSleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn`, retrying on transient GitHub errors with exponential backoff.
 * Non-transient errors reject immediately; the last transient error rejects
 * once retries are exhausted.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number, baseDelayMs?: number, sleep?: (ms: number) => Promise<void>, onRetry?: (err: any, attempt: number, delay: number) => void }} [options]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
	const { retries = 3, baseDelayMs = 1000, sleep = defaultSleep, onRetry } = options;
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= retries || !isTransient(err)) throw err;
			const delay = backoffMs(err, attempt, baseDelayMs);
			onRetry?.(err, attempt, delay);
			await sleep(delay);
		}
	}
}
