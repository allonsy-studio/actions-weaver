---
"@allons-y/actions-weaver": patch
---

Marker lines inside fenced code blocks are now ignored, so documenting the
marker syntax in a target file (e.g. a README usage example) no longer
triggers a false "duplicate START or END markers" error that skipped the
block entirely.
