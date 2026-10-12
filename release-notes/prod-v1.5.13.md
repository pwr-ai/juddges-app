# prod-v1.5.13

> Release Notes for Version prod-v1.5.13

_Generated on 2026-10-13 from `prod-v1.5.12..HEAD` (8 commits)._

## Summary
This release includes updates to dependencies, improvements in testing, and documentation enhancements.

## Highlights
- Updated MSW to version 3.0.2 for improved mock service worker functionality.
- Bumped @sentry/nextjs to version 11.6.0 for enhanced error tracking.
- Updated Playwright image to v1.64.0 for compatibility with testing tools.
- Improved documentation with updated screenshots.

## Dependency Updates
- Bumped MSW from 2.15.0 to 3.0.2 in /frontend.
- Bumped @sentry/nextjs from 10.74.0 to 11.6.0 in /frontend.
- Bumped react-day-picker from 9.14.0 to 10.0.2 in /frontend.
- Bumped pip-minor-patch group across 1 directory with 11 updates.
- Bumped npm-minor-patch group across 1 directory with 48 updates.

## Testing Improvements
- Adapted MSW mocks to MSW 3 for better testing accuracy.
- Bumped Playwright image to v1.64.0 to match @playwright/test.

## Documentation Enhancements
- Updated documentation to use PNG screenshots for search-ui figure.

## Source Commits
- `f0f7d412` test(frontend): adapt msw mocks to msw 3
- `cfa4619e` chore(deps): bump msw from 2.15.0 to 3.0.2 in /frontend
- `3084638d` chore(deps): bump @sentry/nextjs from 10.74.0 to 11.6.0 in /frontend
- `061de0d2` ci: bump playwright image to v1.64.0 to match @playwright/test
- `dbbc22bf` chore(deps): bump the pip-minor-patch group across 1 directory with 11 updates
- `f14b1e95` chore(deps): bump the npm-minor-patch group across 1 directory with 48 updates
- `87c436b9` docs(paper): use png screenshot for search-ui figure
- `81240324` chore(deps): bump react-day-picker from 9.14.0 to 10.0.2 in /frontend
