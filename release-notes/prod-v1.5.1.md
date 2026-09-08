# prod-v1.5.1

> Release Notes for Version prod-v1.5.1

_Generated on 2026-09-08 from `prod-v1.5.0..HEAD` (20 commits)._

## Summary
This release includes important fixes and enhancements to improve the user experience and system performance. Key updates focus on extraction search functionality, frontend improvements, and backend stability.

## Highlights
- Improved extraction search capabilities
- Enhanced frontend user interface
- Stability fixes for backend workers

## Extraction Search Enhancements
- Created a feature to run an extraction from the empty state.
- Show when a job resumes after an interruption.

## Frontend Improvements
- Bumped fast-uri to 4.1.4 to address HIGH audit advisories.
- Clarified NL filter entry point and addressed final review nits on extraction search.
- Implemented editorial layout, sticky feedback, and facet wiring on extraction search.
- Collapsed advanced filters drawer by default and fixed quick-filter grid collision.

## Backend Stability Fixes
- Made the Celery beat healthcheck runnable in the image.
- Dropped malformed stored result rows instead of raising errors.
- Resumed extraction from already-completed documents and kept completed results when a job fails late.

## Source Commits
- `1a3a3a1` fix(deploy): make the Celery beat healthcheck runnable in the image
- `a27ebba` fix: align vector search defaults and filters (#560)
- `6cff892` fix: execute vector chunk search via pgvector RPC (#560)
- `b640658` fix: execute vector chunk search via pgvector RPC (#560)
- `c7ff40c` fix(frontend): bump fast-uri to 4.1.4 to clear HIGH audit advisories
- `8c17ef2` feat(ux): create register and resolve extraction search debt
- `3006b42` fix(frontend): address final review nits on extraction search
- `181d0af` fix(frontend): clarify NL filter entry point
- `1e55a6a` fix(frontend): expand collapsed drawer in extraction e2e spec
- `54b3986` feat(frontend): editorial layout, sticky feedback, and facet wiring on extraction search
- `08bd35b` fix(frontend): collapse advanced filters drawer by default
- `0108181` fix(frontend): fix quick-filter grid collision, enum labels, and case-number control
- `b33cf7d` test(e2e): cover the extraction path on pull requests
- `49255e4` feat(search): offer to run an extraction from the empty state
- `2ac0a8e` feat(extractions): show when a job resumed after an interruption
- `db22298` fix(workers): drop malformed stored result rows instead of raising
- `ca34d35` fix(workers): resume extraction from already-completed documents
- `83d04f1` fix(workers): keep completed results when a job fails late
- `c4721ca` fix(frontend): migrate tanstack table usage to v9 api
- `8f9cc71` chore(deps): bump @tanstack/react-table in /frontend
