# prod-v1.5.26

> Release Notes for Version prod-v1.5.26

_Generated on 2026-10-28 from `prod-v1.5.25..HEAD` (3 commits)._

## Summary
This release includes important updates and fixes to enhance stability and performance.

## Highlights
- Improved release process for smoother deployments.
- Updated Meilisearch engine to version 1.49.
- Patched development dependencies for security advisories.

## Release Process Improvements
- Push the release commit before building to ensure a clean deployment.
- Wait for healthy status on deploy to enhance reliability.

## Dependency Updates
- Bumped Meilisearch engine to version 1.49 with a dumpless upgrade runbook for easier management.
- Patched zod and fast-uri development dependencies to address security advisories.

## Source Commits
- `6866e2b1` fix(release): push the release commit before building, wait for healthy on deploy
- `27582e7d` chore(meilisearch): bump prod engine to v1.49 with dumpless upgrade runbook
- `88c6cefd` fix(deps): patch zod and fast-uri dev-dependency advisories
