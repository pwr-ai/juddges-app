# prod-v1.5.49

> Release Notes for Version prod-v1.5.49

_Generated on 2026-11-27 from `prod-v1.5.48..HEAD` (32 commits)._

## Summary
This release includes various improvements, performance enhancements, and dependency updates to ensure a smoother user experience and maintainability.

## Highlights
- Updated Redis to version 8.2.0 for improved performance.
- Enhanced accessibility features for better keyboard navigation.
- Performance optimizations in data extraction processes.

## Dependency Updates
- Bumped Redis from 6.4.0 to 8.2.0 in the backend.
- Updated jsdom from 30.1.3 to 31.0.1 in the frontend.
- Bumped dotenv from 17.4.2 to 18.0.10 in the frontend.
- Updated gunicorn from 26.2.0 to 27.0.1 in the backend.
- Bumped termcolor from 2.5.0 to 3.3.0 in the backend.
- Updated cachetools from 7.2.4 to 8.0.2 in the backend.

## Performance Improvements
- Stopped remounting the page when authentication resolves for better performance.
- Skipped criteria refinement loop to fit the proxy budget.

## Accessibility Enhancements
- Hid empty value lists and displayed percentages in value buttons.
- Listed chart values as real buttons for improved keyboard filtering.
- Ensured keyboard-reachable value buttons are positioned beside chart bars.

## Testing Improvements
- Added tests for collection and schema metadata on job detail.
- Covered document count assertions on collection cards.

## Source Commits
- `2d2ca215` chore(deps): bump the uv-minor-patch group across 1 directory with 9 updates
- `b74d0a14` chore(deps): bump redis from 6.4.0 to 8.2.0 in /backend
- `8ea80023` fix(redis): fail fast on unreachable Redis regardless of redis-py default retries
- `c79a8b53` style(legal): restore CRLF line endings in compliance wrapper
- `faf64409` perf(extractions): stop remounting the page when auth resolves
- `8ff03b3f` test(extractions): expect one initial poll when auth resolves
- `d448a9a7` test(a11y): scope value-button assertions to the value list
- `624c283e` perf(schemas): skip criteria refinement loop to fit the proxy budget
- `38f37466` fix(a11y): hide empty value list and show percent in value buttons
- `cb5cf83b` test(a11y): cover bar-click and value-button paths separately
- `7da4c43b` fix(a11y): list chart values as real buttons for keyboard filtering
- `f11851ad` fix(schemas): run schema data assessment on the request loop, widen llm timeout
- `1a91afb5` fix(chat): size chat surfaces to the layout column, drop orphan phase keys
- `6fcc0032` ci: match Playwright container image to @playwright/test 1.65.1
- `f1841e10` test(logging): accept loguru 0.8 wrapping format KeyError in ValueError
- `54268791` feat(schemas): generate schemas with schematize via interrupt-based adapter
- `6566769d` build(backend): replace schema_generator_agent package with schematize 0.2.2
- `3058c1b4` refactor(extractions): build job detail from the incoming response
- `97e5bbe3` feat(extractions): return collection and schema metadata on job detail
- `28a86a47` fix(collections): prefer document_count for card document totals
- `9e028238` test(extractions): expect collection and schema metadata on job detail
- `3c72add5` test(chat): assert chat surfaces fill the layout column
- `b9ff4357` test(collections): cover document_count on collection cards
- `e7d6ccb7` test(a11y): require keyboard-reachable value buttons beside chart bars
- `96b94cc1` chore(deps): bump the npm-minor-patch group across 1 directory with 31 updates
- `1bf09481` chore(deps): bump jsdom from 30.1.3 to 31.0.1 in /frontend
- `9b8ab8f2` chore(deps): bump dotenv from 17.4.2 to 18.0.10 in /frontend
- `31d1caeb` chore(deps): bump gunicorn from 26.2.0 to 27.0.1 in /backend
- `0d19d093` chore(deps): bump termcolor from 2.5.0 to 3.3.0 in /backend
- `77961ca4` chore(deps): bump cachetools from 7.2.4 to 8.0.2 in /backend
- `2aa3c91d` chore(ci): bump astral-sh/setup-uv
- `e66fc795` fix(search): keep full-corpus result navigation stable
