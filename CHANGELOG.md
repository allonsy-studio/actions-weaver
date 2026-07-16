# @allons-y/actions-weaver

## 4.1.0

### Minor Changes

- Make cross-repo updates resilient to a single transient failure so one hiccup no longer red-lights an otherwise-healthy run. ([#21](https://github.com/allonsy-studio/actions-weaver/pull/21))

    Each sync now retries transient GitHub failures — secondary (abuse) rate limits, which GitHub returns as a `403`/`429` or, at the edge, a generic HTML "Bad request" `400` page, plus `5xx` blips — with exponential backoff that honours a `retry-after` header when present. Genuine `4xx` errors (bad input, missing resource, no permission) are not retried and still surface immediately. Retries are capped by the new `max-retries` input (default `3`).

    A new `fail-on-error` input (default `true`, preserving current behaviour) controls whether a repo that still fails after retries marks the whole job failed. Set it to `false` to keep the per-repo failure counts in the summary and outputs while leaving the job green.

    Fetching an explicit `repos` list no longer aborts the whole run when a named repo is missing: a `404` on `repos.get` is logged as a warning and that repo is skipped, matching how a missing target file is already handled.

    Adds unit coverage for the retry helper (transient classification, backoff, retry budget), the `fail-on-error` off path, and the skip-missing-named-repo path.

## 4.0.3

### Patch Changes

- The notice should be a comment that is not rendered by the browser but visible to editors. The previous patch did not handle this correctly because it inadvertently wrapped the entire update in a comment. This patch fixes the issue by adding the comment before the update. ([#17](https://github.com/allonsy-studio/actions-weaver/pull/17))

## 4.0.2

### Patch Changes

- Added HTML comment wrappers around notices so that customers don't see auto-update warning but editors can. ([#15](https://github.com/allonsy-studio/actions-weaver/pull/15))

## 4.0.1

### Patch Changes

- Marker lines inside fenced code blocks are now ignored, so documenting the ([#12](https://github.com/allonsy-studio/actions-weaver/pull/12))
  marker syntax in a target file (e.g. a README usage example) no longer
  triggers a false "duplicate START or END markers" error that skipped the
  block entirely.

## 4.0.0

### Major Changes

- Bundle runtime dependencies into a single `dist/index.mjs` instead of requiring `node_modules` at run time. ([#10](https://github.com/allonsy-studio/actions-weaver/pull/10))

                The action previously shipped raw source files (`index.js`, `main.js`, etc.) and relied on
                `@actions/core` and `@actions/github` being resolvable from `node_modules`, which is never
                committed to the repo. That made the action unusable when consumed via `uses:

        allonsy-studio/actions-weaver@vX`from a Git ref, since GitHub Actions runs the checked-out

    code as-is with no install step. It only worked when installed as an npm dependency in a
    project that had already run`yarn install`.

                `src/index.js` and its dependencies are now bundled with `@vercel/ncc` into a single
                `dist/index.mjs`, which is the file `action.yml` points `runs.main` at. The bundle is an ES
                module (ncc wires up `createRequire` for the Node built-ins it references, so it runs cleanly
                under `type: module`). `dist/` is **not** committed to `main`; the release workflow runs
                `yarn build`, publishes the bundle to npm via the package's `files` field, and attaches it to
                the release tag so `uses: …@vX` resolves a ref that carries the runnable bundle. A `build` job
                on every PR verifies the bundle still compiles.

                BREAKING CHANGE: `action.yml`'s `runs.main` now points at `dist/index.mjs` instead of
                `index.js`, and the npm package's `files` field ships the built `dist/` bundle instead of the
                individual source files. Anyone importing `index.js` or `main.js` directly from the
                `@allons-y/actions-weaver` package (rather than using the action via `uses:`) must import the
                package entry (`dist/index.mjs`) instead. Consumers using the action via `uses:

        allonsy-studio/actions-weaver@vX` are unaffected — this is the path the change fixes.

## 3.0.0

### Major Changes

- Rename project with workflow-safe format ([#8](https://github.com/allonsy-studio/actions-weaver/pull/8))

## 2.0.0

### Major Changes

- Updating the package name in the action.yml for publishing to GitHub Marketplace ([#6](https://github.com/allonsy-studio/actions-weaver/pull/6))

## 1.0.0

### Major Changes

- Implement the Weaver action: input-driven (no config file) cross-repo markdown ([#1](https://github.com/allonsy-studio/actions-weaver/pull/1))
  template sync via HTML comment markers, delivered as pull requests.
    - Marker parser, minimal logic-light template engine, repo scanner, and PR
      committer modules
    - All settings are optional action inputs with logical fallbacks (org derived
      from the running repo, `templates/`, `README.md`, `*` repo targeting, JSON
      `variables`, etc.)
    - Opens one pull request per changed repo and exposes a `pull-requests` output
      (JSON array of `{ repo, url, number }`) plus a `summary` output
