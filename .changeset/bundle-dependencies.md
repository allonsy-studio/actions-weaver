---
"@allons-y/actions-weaver": major
---

Bundle runtime dependencies into `dist/index.js` instead of requiring `node_modules` at run time.

The action previously shipped raw source files (`index.js`, `main.js`, etc.) and relied on
`@actions/core` and `@actions/github` being resolvable from `node_modules`, which is never
committed to the repo. That made the action unusable when consumed via `uses:
allonsy-studio/actions-weaver@vX` from a Git ref, since GitHub Actions runs the checked-out
code as-is with no install step. It only worked when installed as an npm dependency in a
project that had already run `yarn install`.

`index.js` and its dependencies are now bundled with `@vercel/ncc` into a single
`dist/index.js`, which is committed to the repository and is the file `action.yml` points
`runs.main` at. A `yarn build` script produces the bundle, and CI (`check-dist` in
`.github/workflows/linting.yml`) fails any PR where the committed `dist/` is out of sync
with the source.

BREAKING CHANGE: `action.yml`'s `runs.main` now points at `dist/index.js` instead of
`index.js`, and the npm package's `files` field ships `dist/` instead of the individual
source files. Anyone requiring `index.js` or `main.js` directly from the
`@allons-y/actions-weaver` package (rather than using the action via `uses:`) must update
their import to `dist/index.js`. Consumers using the action normally via `uses:
allonsy-studio/actions-weaver@vX` are unaffected.
