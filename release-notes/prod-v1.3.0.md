# prod-v1.3.0

> Release Notes for Version 1.3.0

_Generated on 2026-05-15 from `prod-v1.2.1..HEAD` (12 commits)._

## Summary
This release introduces several enhancements and improvements, particularly in search functionalities and infrastructure upgrades. Notable updates include new CLI tools for managing topic snapshots and improved analytics features.

## Highlights
- Upgraded production Meilisearch to v1.43 for enhanced search capabilities.
- Introduced CLI tools for syncing, importing, and validating topic snapshots.
- Improved user analytics with a new history endpoint.

## Search Enhancements
- Added CLI tools to sync, import, and validate topic snapshots.
- Persisted topic runs in Supabase and rebuilt Meili from snapshot.
- Recentered snippet to ensure highlights survive line-clamp in document cards.
- Attributed analytics to users and added a history endpoint.

## Infrastructure Updates
- Upgraded production Meilisearch to v1.43 with a dump-based runbook.
- Bumped development Meilisearch to v1.43.
- Updated dependencies: next to 15.5.18 and uuid to 13.0.1 for security.

## Documentation and UI Changes
- Cited JuDDGES HF datasets with DOIs and dropped HFforLegal/case-law.
- Dropped 'Preview Plan' subtext from user-card popover.

## Testing Improvements
- Repaired drifted unit tests for landing, schema editor, i18n, API, and collection-batch.

## Service Worker Optimization
- Skipped RSC payloads, narrowed static cache, and bumped CACHE_VERSION to v3.

## Source Commits
- `3b33e9d` docs(release): add v1.3.0 release notes
- `9af9f5d` chore(infra): upgrade prod Meilisearch to v1.43 with dump-based runbook
- `1e197ab` test(frontend): repair drifted unit tests for landing, schema editor, i18n, api, and collection-batch
- `0d2be4c` fix(search): recenter snippet so highlight survives line-clamp in document cards
- `ff83189` chore(infra): bump dev Meilisearch to v1.43
- `0379fa8` feat(search-topics): add CLI tools to sync, import, and validate topic snapshots
- `d59430c` feat(search-topics): persist topic runs in Supabase and rebuild Meili from snapshot
- `dd5220e` docs(datasets): cite JuDDGES HF datasets with DOIs, drop HFforLegal/case-law
- `35f5c0f` feat(search): attribute analytics to user + add history endpoint
- `bc12186` chore(deps): bump next to 15.5.18 and uuid to 13.0.1 (security) (#208)
- `b4c6cab` fix(sw): skip RSC payloads, narrow static cache, bump CACHE_VERSION v3
- `e4559c3` chore(navbar): drop "Preview Plan" subtext from user-card popover
