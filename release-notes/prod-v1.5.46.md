# prod-v1.5.46

> Release Notes for Version prod-v1.5.46

_Generated on 2026-11-24 from `prod-v1.5.45..HEAD` (9 commits)._

## Summary
This release includes enhancements to job result extraction, improvements in migration tests, and various bug fixes to enhance overall performance and user experience.

## Highlights
- Enhanced paginated job results on the detail page.
- Improved migration tests for better reliability.
- Fixed issues related to authentication and chat functionalities.

## Enhancements
- Added paginated job results endpoint.
- Implemented pagination for job results on the detail page.

## Bug Fixes
- Addressed review findings on paged job results extraction.
- Fixed migration renumbering for results-page RPC.
- Resolved issues with authentication to return JSON 401 instead of a login redirect.
- Stopped showing not-found cards on source fetch failure.

## Performance Improvements
- Honored return_properties in the batch endpoint.

## Testing Improvements
- Updated migration test to point at the correct results-page migration.

## Source Commits
- `120cc7f6` fix(extractions): address review findings on paged job results
- `7d73a412` test(migrations): point the results-page migration test at 20261123000004
- `9308674d` fix(migrations): renumber the results-page RPC migration to 20261123000004
- `4d66874b` feat(extractions): page job results on the detail page
- `0d96384d` feat(extractions): add paginated job results endpoint
- `19eca849` fix: address review findings
- `502061fe` fix(auth): return json 401 instead of login redirect for /api
- `51768ec4` perf(documents): honour return_properties in batch endpoint
- `0a410792` fix(chat): stop showing not-found cards on source fetch failure
