# prod-v1.2.1

> Release Notes for Version prod-v1.2.1

_Generated on 2026-05-12 from `prod-v1.2.0..HEAD` (31 commits)._

## Summary
This release introduces several enhancements and fixes to improve the search and filtering functionalities, along with accessibility improvements. Key features include the integration of a shared BaseFiltersDrawer and new filter components.

## Highlights
- Introduced shared BaseFiltersDrawer for improved filtering experience.
- Added new filter components: TagArrayControl, BooleanTriControl, and NumericRangeControl.
- Enhanced search capabilities with support for facets and bilingual suggested-topic pills.

## New Features
- Mounted BaseFiltersDrawer on /search, replacing ExtractedFieldsFilter.
- Introduced TagArrayControl with facet-driven autocomplete.
- Added BooleanTriControl and NumericRangeControl sub-components.
- Implemented a shared registry→meili map and URL (de)serializer.
- Enhanced search with forwarding of facets and facet_query through /documents/search.
- Introduced bilingual drug-crime suggested-topic pills on /search.

## Improvements
- Refactored extraction logic to nest min/max under range in BaseFilterValue adapter.
- Widened BaseFilters into a per-control discriminated union for better type handling.
- Updated search-flow integration test to support bilingual suggested-topic pills.

## Fixes
- Fixed issues with drawer props and URL access in BaseFilters.
- Resolved useMemo dependency issues in TagArrayControl.
- Added missing DateRangeControl and EnumMultiControl files.

## Source Commits
- `03921cd` fix(search): drop drawer open/onOpenChange props, fix BaseFilters URL access
- `8664e8e` fix(extractions): nest min/max under range in BaseFilterValue adapter
- `fd4c97d` fix(meili): include all base_* columns in JUDGMENT_SYNC_COLUMNS
- `93a5613` refactor(extractions): mount shared BaseFiltersDrawer; keep substring inputs
- `2e0d870` feat(search): mount BaseFiltersDrawer on /search, drop ExtractedFieldsFilter
- `1eb381f` feat(filters): shared BaseFiltersDrawer renders registry-driven groups
- `8b2735c` feat(filters): useBaseFieldFacets hook + fetchBaseFieldFacets API
- `949db4a` fix: add missing newline in TagArrayControl test
- `161664f` fix: useMemo dependency issue in TagArrayControl
- `9d19337` fix: add missing DateRangeControl and EnumMultiControl files
- `0dda4d3` feat(filters): TagArrayControl with facet-driven autocomplete
- `5fafe6a` feat(filters): BooleanTriControl sub-component
- `9a3f68e` feat(filters): NumericRangeControl sub-component
- `9634baa` feat(search): buildMeilisearchFilter dispatches on control type
- `270951b` feat(filters): shared registry→meili map + URL (de)serializer
- `6c76ee5` feat(store): widen BaseFilters into per-control discriminated union
- `1d3a8d6` feat(filters): add operational group + 8 base_* registry entries
- `28879b6` feat(api): forward facets + facet_query through search-documents proxy
- `c4186d7` fix(search): tighten facets fast-path gate to empty-query autocomplete only
- `8c0d12f` feat(search): forward facets + facet_query through /documents/search
- `29bdb6d` fix(meili): split settings PATCH into safe + embedders phases
- `88a7d54` feat(meili): extend index settings with all base_* filterable + searchable fields
- `8b2eb6a` refactor(meili): hoist BASE_SCHEMA_FIELDS to module scope, clean up transformer
- `6e22c2f` feat(meili): emit 45 filterable + 9 searchable base_* fields in transformer
- `f5c8c17` test(frontend): update search-flow integration test to bilingual suggested-topic pills
- `e671292` chore(frontend): delete orphan ExampleQueries component
- `dbd5251` fix(frontend): a11y polish on bilingual suggested-topic pills
- `ae67349` feat(frontend): bilingual drug-crime suggested-topic pills (dual + cross-lingual) on /search
- `84feec0` test(frontend): expect bilingual drug-crime suggested-topic pills
- `790ab82` docs(how-to): base-schema search & filter parity — implementation plan
- `606ca09` docs(specs): base-schema search & filter parity on /search
