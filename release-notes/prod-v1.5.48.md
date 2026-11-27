# prod-v1.5.48

> Release Notes for Version prod-v1.5.48

_Generated on 2026-11-27 from `prod-v1.5.47..HEAD` (3 commits)._

## Summary
This release includes important updates to database handling and extraction job results management.

## Highlights
- Improved database performance with optimized upsert operations.
- Enhanced extraction job results handling with keyset paging.

## Database Improvements
- Skipped unchanged mirror rows before the upsert to enhance performance.
- Tightened grants for better security.

## Extraction Job Results
- Refactored to read job results from extraction_job_results using keyset paging.
- Introduced a feature to mirror extraction job results into a per-row table.

## Source Commits
- `387efdbe` fix(db): skip unchanged mirror rows before the upsert, tighten grants
- `0353d420` refactor(extraction): read job results from extraction_job_results with keyset paging
- `33970600` feat(db): mirror extraction job results into a per-row table
