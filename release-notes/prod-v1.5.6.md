# prod-v1.5.6

> Release Notes for Version prod-v1.5.6

_Generated on 2026-09-15 from `prod-v1.5.5..HEAD` (2 commits)._

## Summary
This release includes important fixes to enhance performance and reliability.

## Highlights
- Improved cache setup reliability for LLM.
- Optimized rendering in React components.

## Cache Improvements
- Retry the LLM cache setup when a sibling worker wins the CREATE.

## React Enhancements
- Stopped reading refs during render to improve performance.
- Hoisted effect-called fetchers for better efficiency.

## Source Commits
- `d60b39d` fix(cache): retry the LLM cache setup when a sibling worker wins the CREATE
- `e2c601f` fix(react): stop reading refs during render, hoist effect-called fetchers
