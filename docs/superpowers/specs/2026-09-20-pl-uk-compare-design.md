# PL↔UK comparison on live data — design spec

> **Status:** implemented · **Date:** 2026-09-20 · **Issue:** [#684](https://github.com/pwr-ai/juddges-app/issues/684) · **Owner:** extractions-search

This is the spec of record for issue #684, copied verbatim (translated to
English) from the issue body so it survives alongside the code that
implements it; see `docs/reference/base-schema-filter-api.md`,
`docs/api/API_REFERENCE.md` and `docs/how-to/compare-pl-uk.md` for the
implementation-facing documentation.

## User story

**As a** comparative-law researcher **I want to** ask one question and see
the base-field distribution broken out for PL and UK side by side, with the
option to save both subsets as paired collections, **so that** I can do
cross-jurisdiction comparison without manually repeating the search and
copying numbers into a spreadsheet.

Execution plan (TDD, 20 tasks; Task 1 moved to #682, Tasks 9 and 16 rewritten
per the "Changes to plans A/B/C" section of the foundation plan):
`docs/superpowers/plans/2026-09-20-pl-uk-compare.md` (local;
`docs/superpowers/` is gitignored).

## Context

- `docs/tutorials/first-30-minutes.md` described this as a manual
  "Comparative workflow pattern" (two searches, two collections).
- `/dataset-comparison` renders a static `frontend/lib/stats/dataset-comparison-stats.json`
  (Plotly) — a corpus-level artifact that does not react to a filter. It
  stays, and gets a link to the new route.
- `get_extracted_facet_counts(field_path)` (`20260226000001…sql:730`) counts
  globally, with no filter and no per-jurisdiction split.
- Data distortions (`APP_STATUS_2026-08-21.md` §4): `legal_topics`/`keywords`
  are PL-only (0/300 UK); `base_convict_offences` is 153/200 PL vs. 198/200
  UK. The comparison must show **per-jurisdiction field coverage**, or it
  lies. `case_type`/`court_level` are not exposed (only `base_*` fields).

## Scope

**Database (`20260921000001`, `20260921000002`)**
- RPC `get_extracted_facet_counts_by_jurisdiction(p_filters JSONB, field_path TEXT, p_text_query TEXT) → (jurisdiction, value, count, total, covered, coverage)`;
  a `LEFT JOIN` yields a summary row (`value IS NULL`), so N_PL/N_UK come
  back without a second call. Builds on `list_extracted_filter_matches` from
  #682 — no copying the `WHERE` clause.
- `collection_pairs` table (its own `id`, `name`, `filters`, `text_query`,
  `pl_collection_id`, `uk_collection_id` with a `UNIQUE` per side, cascade,
  RLS `(SELECT auth.uid())`); in the Database Contract: `EXPECTED_TABLES` +
  `OWNER_SCOPED_TABLES` + the RPC entry.

**Backend**
- `backend/app/compare/`: `fields.py` (`comparable_fields_from_schema`,
  `base_compare_fields` — enum / `items.enum` / boolean), `layout.py`
  (`tier_for`: `primary | partial <80 % | unavailable (0 % in one
  jurisdiction) | empty`; `LOW_COVERAGE_THRESHOLD`; `coverage_ratio`
  imported from `completeness.py`, #682), `schema_tally.py` (tallying
  extension-schema fields from each side's newest `SUCCESS`
  `extraction_jobs.results`, when both sides of the pair share the same
  `schema_id`), `csv_export.py`, `service.py`, `router.py`: `POST
  /compare/facets`, `POST /compare/export`, `GET /compare/pairs/{id}`.
- Pairs: `collections_from_filter.py` (from #682) gets
  `split_by_jurisdiction: bool = False` — when `True`:
  `check_cap(per_jurisdiction=True)`, two collections `"<name> — PL"` /
  `"<name> — UK"`, a `collection_pairs` row, response `collections=[PL,
  UK]`, `pair_id`. `CollectionPairsDB` + `GET /collections/pairs`,
  `GET/DELETE /collections/pairs/{id}`; `GET /collections` adds `pair {id,
  name, role, partner_collection_id}`.
- Coverage semantics: `covered` = not-NULL / non-empty array / non-empty
  string (SQL, `base_*` columns); `coverage = covered/total`; `share =
  count/covered`. Counting happens in SQL; thresholds and tiers live only in
  `layout.py`; the frontend renders the flags.

**Frontend**
- New routes `/compare` and `/compare/[pairId]`; `_components`:
  `CompareView`, `CompareFilterBar` (drawer via the #682 adapter,
  `NlFilterDialog` from #683), `CoverageBadge`, `UnavailableFields`,
  `SavePairDialog`, `PairContent`.
- `BivariateBarChart` is promoted to `components/charts/` (+`yTickSuffix`,
  `hoverTemplate`; a re-export keeps the static page working).
- `lib/compare/`: `types.ts` (`Jurisdiction` from
  `@/types/base-schema-filter`), `chart-data.ts`, `permalink.ts`
  (`buildComparePermalink = buildFilterHref('/compare', …)` from #682 — a
  link portable to `/search/extractions`), `api.ts` (`createCollectionPair`
  → `createCollectionFromFilter({..., split_by_jurisdiction: true})`).
- 5 BFF routes via `proxyToBackend` (#682); export passes through
  `content-type`, `content-disposition`, `x-rows-count`.
- i18n `compare.*` (en + pl). Colors per `docs/reference/DESIGN.md`.

## Acceptance criteria

1. **Given** a user on `/compare`, **when** they supply a filter (NL or
   chips) with no jurisdiction, **then** the system runs the same filter for
   PL and UK and shows N_PL, N_UK and the enum/boolean fields
   (`appeal_outcome`, `offender_gender`, `sentence_serve`, `plea_point`, …)
   as side-by-side bars with a percentage share.
2. **Given** a field with coverage < 80 % in either jurisdiction, **then**
   it carries a "coverage PL x % / UK y %" badge and is not in the first
   row; a field at 0 % in one jurisdiction is hidden with an explanatory
   message, not shown as "0".
3. **Given** a comparison result, **when** the user clicks "Save as a pair
   of collections", **then** two collections are created, linked by
   `pair_id`, and `/collections` shows them as a pair.
4. **Given** a saved pair extracted with the same extension schema on both
   sides, **then** `/compare/{pairId}` shows that schema's fields in the
   same side-by-side layout.
5. **Given** any comparison, **when** "Export", **then** a long-format CSV
   (`field,value,jurisdiction,count,share,coverage,covered,total`, BOM) plus
   a permalink with the filter encoded.
6. **Regression:** `/dataset-comparison` keeps working unchanged (route
   reachability test); `get_extracted_facet_counts` keeps its signature (a
   new function alongside it, not an override).

## Test plan

- DB contract: `tests/db/test_compare_rpcs_contract.py` — a 2×PL + 2×UK
  fixture; per-jurisdiction sum = N from `list_extracted_filter_matches`;
  `coverage` for an empty array = uncovered.
- Unit (backend): `layout.py` tiers and threshold; `schema_tally` with
  `FakeRpcClient` (#682); `csv_export` headers and BOM;
  `split_by_jurisdiction` in `collections_from_filter`.
- Unit (frontend): `CoverageBadge`, `UnavailableFields`, `chart-data`,
  `permalink`, `compare-bff.test.ts`.
- Route-contract E2E: filter → two columns → "Save pair" → two collections
  on `/collections`.

## Out of scope

Statistical significance tests (chi², CI) — version 2. Aligning the PL↔UK
topic taxonomy (`docs/how-to/polish-dataset-curation.md`). Fixing the
`case_type`/`court_level` data.

## Dependencies and links

Hard blocks on: #682. Soft blocks on: #683 (without the NL prompt,
`/compare` works from chips, but a date range parsed from an NL question
needs #683). Related: #537 (empty `extraction_schemas` → empty state with a
deep link `/extract?collection=`), the research-flow epic (an "Extract"
button on both collections of a pair).
