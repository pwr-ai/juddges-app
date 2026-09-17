# prod-v1.5.11

> Release Notes for Version prod-v1.5.11

_Generated on 2026-09-17 from `prod-v1.5.10..HEAD` (16 commits)._

## Summary
This release includes significant refinements to collections, extractions, and UI components, enhancing overall performance and consistency.

## Highlights
- Polished document metadata view and card grid for improved user experience.
- Migrated collections, documents, and reasoning lines to editorial for better management.
- Resolved various font and extraction issues to ensure smoother functionality.

## Refinements and Migrations
- Polished document metadata view and card grid.
- Migrated collections and documents to editorial.
- Migrated precedents and reasoning lines to editorial.
- Editorial migration for extraction surfaces and schema studio surfaces.
- Updated editorial cards and stats for the about page.

## Fixes
- Moved next/font variable classes to <html> for token resolution.
- Resolved duplicate imports and JSX tags after main merge.
- Accepted provider argument in providerColor for settings alignment.
- Aligned type color hex literals with PWr identity tokens.

## Design Sync Updates
- Noted styleSha drift from peer merges mid-resync.
- Named the source of each reserved skeleton export.
- Shipped UI/skeletons and resynced drift #658-#660.

## UI Enhancements
- Phase 2 updates on status tokens, type markers, skeletons, and palettes.

## Source Commits
- `0800d017` refactor(collections): polish document metadata view and card grid
- `5bc3364b` refactor(collections): migrate collections and documents to editorial
- `9e5184ec` docs(design-sync): note styleSha drift from peer merges mid-resync
- `34cc5c29` refactor(reasoning-lines): migrate precedents and reasoning lines to editorial
- `38b3bdd8` docs(design-sync): name the source of each reserved skeleton export
- `786fb9cf` chore(design-sync): ship ui/skeletons and resync #658-#660 drift
- `e97c13d4` refactor(extractions): editorial migration for extraction surfaces
- `ebe2ce20` fix(fonts): move next/font variable classes to <html> so tokens resolve
- `749e0771` refactor(schemas): editorial migration for schema studio surfaces
- `ca94cae0` fix(extractions): resolve duplicate imports and JSX tags after main merge
- `79e77b3f` refactor(extractions): editorial status tones for extraction surfaces
- `04cc00f5` fix(settings): accept provider argument in providerColor
- `9423534d` fix(schema): align type color hex literals with PWr identity tokens
- `66dab87c` refactor(ui): phase 2 — status tokens, type markers, skeletons, palettes
- `9f657c8a` refactor(about): editorial cards and stats for the about page
- `aaf95f16` wip: phase 2 progress
