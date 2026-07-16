---
"@allons-y/actions-weaver": minor
---

Make cross-repo updates resilient to a single transient failure so one hiccup no longer red-lights an otherwise-healthy run.

Each sync now retries transient GitHub failures — secondary (abuse) rate limits, which GitHub returns as a `403`/`429` or, at the edge, a generic HTML "Bad request" `400` page, plus `5xx` blips — with exponential backoff that honours a `retry-after` header when present. Genuine `4xx` errors (bad input, missing resource, no permission) are not retried and still surface immediately. Retries are capped by the new `max-retries` input (default `3`).

A new `fail-on-error` input (default `true`, preserving current behaviour) controls whether a repo that still fails after retries marks the whole job failed. Set it to `false` to keep the per-repo failure counts in the summary and outputs while leaving the job green.

Fetching an explicit `repos` list no longer aborts the whole run when a named repo is missing: a `404` on `repos.get` is logged as a warning and that repo is skipped, matching how a missing target file is already handled.

Adds unit coverage for the retry helper (transient classification, backoff, retry budget), the `fail-on-error` off path, and the skip-missing-named-repo path.
