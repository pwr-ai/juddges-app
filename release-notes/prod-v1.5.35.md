# prod-v1.5.35

> Release Notes for Version prod-v1.5.35

_Generated on 2026-11-22 from `prod-v1.5.34..HEAD` (14 commits)._

## Summary
This release includes several important fixes and improvements across various components, enhancing functionality and ensuring better performance.

## Highlights
- Improved email confirmation status display in the admin panel.
- Enhanced handling of npm audit errors for better security compliance.
- Refined document breakdown aggregation for improved data insights.

## Admin Improvements
- Emit ISO 8601 format for `email_confirmed_at` in admin settings.
- Display accurate email confirmation status in the users list.
- Aggregate document country/language breakdown in SQL queries.

## Audit Enhancements
- Fail closed when npm audit encounters errors or reports no data.
- Gate npm audit through an expiring advisory allowlist for better security management.
- Refactor npm audit gate test to a module for improved maintainability.

## General Fixes
- Drop sort parameter rejected by Meili in suggestions.
- Parse pgvector text embeddings in related lines for better reasoning.
- Count distinct documents per facet value for improved comparison.
- Drop service worker timeout on /api requests to enhance responsiveness.

## Testing and Maintenance
- Align legacy table-name tests with breakdown RPC for consistency.
- Satisfy ESLint requirements in npm audit gate script.

## Source Commits
- `6de7167c` fix(suggestions): drop sort param rejected by Meili
- `bf90cbec` fix(audit): fail closed when npm audit errors or reports no data
- `854920f0` fix(admin): emit iso 8601 email_confirmed_at for datetime values
- `0b8060e1` test(admin): align legacy table-name test with breakdown rpc
- `52ecb0e0` chore(db): renumber admin document breakdown migration
- `58e32644` test(audit): make npm audit gate test a module
- `d40e6cb3` fix(reasoning-lines): parse pgvector text embeddings in related lines
- `41eb9cc8` style(audit): satisfy eslint in npm audit gate script
- `4f686d5c` fix(admin): show real email confirmation status in users list
- `f4c734ca` fix(rate-limit): accept response param in limited handlers
- `986b4990` ci(audit): gate npm audit through an expiring advisory allowlist
- `4075bd2e` fix(admin): aggregate document country/language breakdown in sql
- `1baeef2b` fix(compare): count distinct documents per facet value
- `270bb038` fix(frontend): drop service worker timeout on /api requests
