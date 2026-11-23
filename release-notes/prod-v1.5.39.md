# prod-v1.5.39

> Release Notes for Version prod-v1.5.39

_Generated on 2026-11-23 from `prod-v1.5.38..HEAD` (2 commits)._

## Summary
This release introduces enhancements to the main model and improves chat functionality.

## Highlights
- GPT-6.2-SOL is now the default main model.
- Chat query-rewrite stream no longer wipes retrieve inputs.

## Enhancements
- GPT-6.2-SOL is now the default main model.

## Bug Fixes
- Fixed an issue where the query-rewrite stream would wipe retrieve inputs.

## Source Commits
- `c3fcce57` feat(llm): make gpt-6.2-sol the default main model
- `88690044` fix(chat): stop query-rewrite stream from wiping retrieve inputs
