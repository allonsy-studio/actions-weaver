# @allons-y/actions-weaver

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
