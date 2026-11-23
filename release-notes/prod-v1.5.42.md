# prod-v1.5.42

> Release Notes for Version prod-v1.5.42

_Generated on 2026-11-23 from `prod-v1.5.41..HEAD` (3 commits)._

## Summary
This release introduces enhancements to reasoning lines and improves data extraction processes. It includes important fixes to ensure compatibility with legacy data and better organization of job results.

## Highlights
- Enhanced naming of outcome series for clarity.
- Improved handling of legacy source-id rows during resume operations.
- Job results are now organized by requested judgment UUID.

## Enhancements
- Named outcome series after the parties involved, distinguishing between borrower and bank in CHF lines.

## Fixes
- Accepted legacy source-id rows on resume, with added regression tests to ensure reliability.
- Keyed job results by requested judgment UUID for better data organization.

## Source Commits
- `caaf44a1` feat(reasoning-lines): name outcome series after the parties; CHF line as borrower vs bank
- `6f0534f6` fix(extraction): accept legacy source-id rows on resume, add regression tests
- `90412a48` fix(extraction): key job results by requested judgment uuid
