---
"@allons-y/template-actions": minor
---

Migrate release tooling from semantic-release to Changesets. Versions and the
changelog are now driven by changeset files (`yarn changeset`) instead of commit
messages; commitlint is retained for commit-message hygiene but no longer gates
releases. The release workflow opens a "Version Packages" PR and, on merge, tags
the release and moves the floating major (`vN`) tag.
