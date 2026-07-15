---
"@allons-y/actions-weaver": patch
---

The notice should be a comment that is not rendered by the browser but visible to editors. The previous patch did not handle this correctly because it inadvertently wrapped the entire update in a comment. This patch fixes the issue by adding the comment before the update.
