# prod-v1.5.2

> Release Notes for Version prod-v1.5.2

_Generated on 2026-09-15 from `prod-v1.5.1..HEAD` (8 commits)._

## Summary
This release includes several dependency updates and enhancements to the deployment process, ensuring improved stability and performance.

## Highlights
- Updated dependencies for enhanced security and performance.
- Introduced a new flag for deployment scripts to streamline processes.

## Dependency Updates
- Raised the sharp override floor to address the libheif advisory.
- Bumped pytest-randomly from 3.16.0 to 5.0.0 in the backend.
- Updated the pip-minor-patch group with 7 updates across one directory.
- Updated the npm-minor-patch group with 30 updates across one directory.

## Deployment Enhancements
- Added a --yes flag to deploy_prod.sh for automated deployments.
- Stopped opting the production stack into Watchtower auto-updates.

## Testing Improvements
- Implemented route interception to own the poll body in tests.

## Source Commits
- `debc8c8` sec(deps): raise the sharp override floor to clear the libheif advisory
- `7283c3e` feat(deploy): add a --yes flag to deploy_prod.sh
- `fbd0f6c` chore(deps): bump pytest-randomly from 3.16.0 to 5.0.0 in /backend
- `d74245a` ci(playwright): bump the runner image to match the client bump
- `bcf0ce2` chore(deps): bump the pip-minor-patch group across 1 directory with 7 updates
- `5ab84b1` chore(deps): bump the npm-minor-patch group across 1 directory with 30 updates
- `3c8a7cc` chore(deploy): stop opting the prod stack into Watchtower auto-updates
- `3917034` test(route-contract): own the poll body via route interception
