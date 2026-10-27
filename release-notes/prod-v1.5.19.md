# prod-v1.5.19

> Release Notes for Version prod-v1.5.19

_Generated on 2026-10-27 from `prod-v1.5.18..HEAD` (6 commits)._

## Summary
This release includes important dependency updates, CI improvements, and new features for enhanced development and deployment processes.

## Highlights
- Exclusion of compromised dependency for security enhancement.
- Improved CI workflow for backend and frontend tests.
- New feature to run development and production environments side by side.

## Dependency Updates
- Excluded the compromised litellm version 1.107.0 for security reasons.
- Bumped pip-minor-patch group across one directory with six updates.
- Bumped npm-minor-patch group across one directory with six updates.

## Continuous Integration Improvements
- CI now runs backend and frontend test suites only when their respective paths change.

## New Features
- Introduced the ability to run development and production environments side by side on a single host.

## Deployment Fixes
- Updated frontend API_BASE_URL to point at the juddges-backend container name.

## Source Commits
- `b47d3276` fix(deps): exclude the compromised litellm 1.107.0
- `49855475` ci: run backend and frontend suites only when their paths change
- `1d0b7123` chore(deps): bump the pip-minor-patch group across 1 directory with 6 updates
- `c2443454` chore(deps): bump the npm-minor-patch group across 1 directory with 6 updates
- `ddad773c` feat(compose): run dev and prod side by side on one host
- `d07b11ca` fix(deploy): point frontend API_BASE_URL at juddges-backend container name
