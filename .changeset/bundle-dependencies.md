---
"@allons-y/actions-weaver": major
---

Bundle runtime dependencies into a single `dist/index.mjs` instead of requiring `node_modules` at run time.

The action previously shipped raw source files (`index.js`, `main.js`, etc.) and relied on
`@actions/core` and `@actions/github` being resolvable from `node_modules`, which is never
committed to the repo. That made the action unusable when consumed via `uses:
allonsy-studio/actions-weaver@vX` from a Git ref, since GitHub Actions runs the checked-out
code as-is with no install step. It only worked when installed as an npm dependency in a
project that had already run `yarn install`.

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
