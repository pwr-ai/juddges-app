# prod-v1.5.22

> Release Notes for Version prod-v1.5.22

_Generated on 2026-10-28 from `prod-v1.5.21..HEAD` (3 commits)._

## Summary
This release includes important fixes to the search functionality and updates to our continuous integration process.

## Highlights
- Improved search result handling
- Optimized query parameter encoding
- Updated coverage report retention policy

## Search Improvements
- Kept surviving chunk results when one search fails, enhancing user experience during search operations.
- Optimized the encoding of the query parameter to ensure it is processed correctly without redundancy.

## Continuous Integration Updates
- Adjusted the coverage report retention policy to keep reports for the main branch only for 7 days, streamlining our CI process.

## Source Commits
- `d47dea1a` fix(search): keep surviving chunk results when one search fails
- `90030490` fix(search): encode q param once instead of twice
- `cd6f1cf3` ci: keep coverage reports for main only, for 7 days
