# prod-v1.5.21

> Release Notes for Version prod-v1.5.21

_Generated on 2026-10-27 from `prod-v1.5.20..HEAD` (1 commit)._

## Summary
This release includes an important fix to enhance the user experience when accessing schema resources.

## Highlights
- Resolved an issue with the static /schemas/base page returning a 404 error.

## Fixes
- Stopped middleware from returning a 404 error on the static /schemas/base page.

## Source Commits
- `f132b1ef` fix(schemas): stop middleware 404ing the static /schemas/base page
