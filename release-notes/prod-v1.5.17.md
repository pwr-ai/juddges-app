# prod-v1.5.17

> Release Notes for Version prod-v1.5.17

_Generated on 2026-10-27 from `prod-v1.5.16..HEAD` (2 commits)._

## Summary
This release includes improvements to health reporting and optimizations in our CI process.

## Highlights
- Health check now reports the release version accurately.
- CI process enhancements to reduce cache duplication and optimize build artifacts.

## Improvements
- Health check now reports the release version instead of 'unknown'.

## CI Enhancements
- Stopped per-PR cache duplication to streamline the CI process.
- Shrunk frontend-build artifact for improved efficiency.

## Source Commits
- `cf88c2da` fix(health): report the release version instead of "unknown"
- `e47d8883` ci: stop per-PR cache duplication and shrink frontend-build artifact
