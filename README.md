# Actions Template Repository

> A batteries-included template for scaffolding new GitHub Actions.

A starting point for ESM, bundled GitHub Actions — ships with `action.yml`, an
example handler, Jest (with manual `@actions/*` mocks), ESLint/Prettier,
Changesets, Renovate, and issue/PR templates, plus a one-shot setup CLI
that wires it all to your action.

## Use this template

1. Click **Use this template** on GitHub and create your repository.
2. `yarn install`
3. `yarn rename` — an interactive CLI that collects the action name,
   description, owner, author, and your input/output variables, then rewrites
   `action.yml`, `package.json`, the README, and everything else before
   removing itself (the entire `scripts/` directory).
   - Pass `--dry-run` to preview every change without writing anything.
   - Supply `--name`, `--description`, `--owner`, and/or `--author` to skip the
     matching prompts.
4. Edit `main.js` to implement your action's logic.
5. Run `yarn changeset` to record any release-worthy change, then commit and
   push — [Changesets](https://github.com/changesets/changesets) handles
   versioning, the changelog, and tagging the release.

## What the setup does

- Replaces the `{{ ACTION_NAME }}` / `{{ ACTION_DESCRIPTION }}` /
  `{{ ACTION_AUTHOR }}` / `{{ ACTION_AUTHOR_EMAIL }}` / `{{ OWNER }}`
  placeholders across the repository.
- Generates the `action.yml` inputs/outputs and the README tables from the
  variables you define.
- Installs the action-only `package.json`, `jest.config.js`, and `README.md`
  from `scripts/template/` over the repository's own copies.
- Detects sensible defaults: the owner from the git remote, and the author from
  `gh`, the GitHub Actions context, or your commit email.

## Development

```sh
yarn format    # eslint
yarn lint      # eslint
yarn test      # jest
yarn coverage  # jest with the 80% coverage threshold
```

---
<sub>Built and maintained by [Allons-y Studio](https://allons-y.studio) — a US-based studio specializing in design systems, front-end architecture, and accessibility.</sub>
