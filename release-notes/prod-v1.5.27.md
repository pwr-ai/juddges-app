# prod-v1.5.27

> Release Notes for Version prod-v1.5.27

_Generated on 2026-10-29 from `prod-v1.5.26..HEAD` (6 commits)._

## Summary
This release includes important fixes and improvements to enhance the functionality and performance of the application.

## Highlights
- Restored CRLF line endings in test files for consistency.
- Improved synchronization tasks in Meilisearch to run in a single event loop.
- Enhanced ingestion process to derive UK case type and court level from citations.
- Added merge-when-green helpers for managing PRs effectively.
- Updated dashboard stats refresh process for better performance.
- Bumped multidict dependency to version 6.9.1 and removed unused black dependency.

## Improvements
- Restored CRLF line endings in test_meilisearch_sync.py for consistency in tests.
- Added merge-when-green helpers for managing own and Dependabot PRs.

## Fixes
- Fixed Meilisearch synchronization to run each task in a single event loop.
- Derived UK case type and court level from citation during ingestion.
- Updated dashboard stats refresh to run over a direct connection with a longer timeout.
- Bumped multidict to version 6.9.1 and removed unused black from juddges_search.

## Source Commits
- `6496485a` style(tests): restore CRLF line endings in test_meilisearch_sync.py
- `ca3a6ebb` fix(meilisearch): run each sync task in a single event loop
- `33ff90ed` fix(ingestion): derive uk case_type and court_level from citation
- `78bca2cb` chore(scripts): add merge-when-green helpers for own and Dependabot PRs
- `2c7210ff` fix(maintenance): run dashboard stats refresh over direct connection with longer timeout
- `25dfdeca` fix(deps): bump multidict to 6.9.1 and drop unused black from juddges_search
