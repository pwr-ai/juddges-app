# NL question → base-schema filter → collection — design spec

> **Status:** implemented · **Date:** 2026-09-20 · **Issue:** [#683](https://github.com/pwr-ai/juddges-app/issues/683) · **Owner:** extractions-search

This is the spec of record for issue #683, copied verbatim (translated
section headers only) from the issue body so it survives alongside the code
that implements it. The original Polish issue text is preserved below; see
`docs/reference/base-schema-filter-api.md` and
`docs/how-to/save-extraction-filter-as-collection.md` for the
implementation-facing documentation.

## User story

**As a** researcher or lawyer **I want to** type a question ("women
convicted of fraud with a suspended sentence, PL and UK, 2015–2024") and get
a filtered set of judgments across 40+ base-schema fields, which I save as a
collection, **so that** I can use the only fully-populated resource (100%
base extraction, `APP_STATUS_2026-08-21.md` §4) instead of guessing
keywords.

Execution plan (TDD, 16 tasks, 6 of which moved to #682):
`docs/superpowers/plans/2026-09-20-nl-filter-to-collection.md` (checked into
this repo alongside the other `docs/superpowers/plans/` and
`docs/superpowers/specs/` files, despite the issue text below calling it
"local"). The "Changes to plans A/B/C" section in the foundation plan
(`docs/superpowers/plans/2026-09-20-shared-foundation.md`) says which tasks
to drop (Task 3, 4, 5, 11, 12, 13) and how to narrow Task 7.

## Context

- NL→filter already exists: `backend/app/extraction_domain/nl_filter_generator.py`
  (`BaseSchemaFilter`, `generate_base_schema_filter`), proxy
  `frontend/app/api/extractions/base-schema/nl-filter/route.ts`,
  `NlFilterDialog` on `/search/extractions`.
- Gap 1: `BaseSchemaFilter` has neither `jurisdiction` nor `decision_date` —
  a "PL vs UK 2015–2024" question cannot be expressed. The RPC keys are
  delivered by #682; this issue adds the Pydantic model + prompt.
- Gap 2: `frontend/app/search/extractions/page.tsx:189` links a row to
  `/judgments/${row.id}` — the route does not exist, every row 404s. Target:
  `/documents/[id]`.
- Gap 3: no "save result as collection"; endpoint `POST /collections/from-filter`
  is delivered by #682.
- `case_type='Civil'` on UK criminal appeals and `court_level='Crown Court'`
  on Court of Appeal — neither field should be exposed in the NL prompt
  until the data is fixed (`NL_EXCLUDED_CORE_FIELDS`, pinned by a prompt
  contract test).

## Scope

- `BaseSchemaFilter`: `jurisdiction: list[Jurisdiction] | None` (imported
  from `app.models`), `decision_date: DateRange | str | None`;
  `to_rpc_payload()` emits keys consistent with #682.
- Prompt: rules for Polish and English phrasings ("w latach 2015–2024",
  "od/po/przed", "brytyjskie", "w Polsce", "since/between"); `decision_date`
  as the default date field; `NL_EXCLUDED_CORE_FIELDS = {case_type,
  court_level}`; `tests/app/test_nl_filter_prompt_contract.py` checks that
  neither field appears in the prompt or the JSON Schema.
- `components/search/ScopeFilters.tsx` — a `jurisdiction` + `decision_date`
  strip above the drawer (reuses `EnumMultiControl`/`DateRangeControl`, the
  adapter from #682).
- `?nl=` — the NL question in URL state (`nlQuestion` in `FilterUrlState`
  from #682), used as the default collection name.
- `lib/extractions/document-href.ts::buildDocumentHref(id, filters)` →
  `/documents/{id}?f=…#base-fields`; `lib/extractions/filter-match.ts::matchedMetadataKeys(filters,
  metadata)`; `KeyInformation` gets `highlightKeys`/`id`/`highlightCaption` —
  the base-fields section highlights values that satisfied the filter (a
  deep link instead of a new tab strip — a deliberate deviation from AC2).
- `SaveAsCollectionDialog` on `/search/extractions` →
  `createCollectionFromFilter` (#682), redirect to
  `/collections/{collections[0].collection.id}`; 413 communicated with
  `total`/`cap`.
- Docs: extend `docs/reference/base-schema-filter-api.md` (NL and `?nl=`
  sections), append queries 11/12 to
  `docs/how-to/test-base-schema-filter-queries.md`.

## Acceptance criteria

1. **Given** a user on `/search/extractions`, **when** they type a question
   with a jurisdiction and a year range into `NlFilterDialog`, **then** the
   generated filter contains `jurisdiction: ["PL","UK"]` and `decision_date:
   {from, to}`, and the result contains only matching rows.
2. **Given** a filter result, **when** the user clicks a row, **then**
   `/documents/{id}` opens (not a 404) with the base-fields section and the
   values that satisfied the filter highlighted.
3. **Given** a filter result (≤ 5000 rows), **when** the user clicks "Save as
   collection", **then** a collection is created with name = the question
   (editable) and every id from the result, and the user lands on
   `/collections/{id}`.
4. **Given** a generated filter, **then** every condition is a chip
   (remove/edit) and the URL encodes the filter — the link is reproducible
   and shareable.
5. **Regression:** facets and `BaseFiltersDrawer` are unchanged;
   `test_base_schema_route_regressions.py` passes; the NL prompt never
   contains `case_type` or `court_level`.

## Test plan

- Unit (backend): parsing PL/EN phrases into `DateRange`/`jurisdiction`;
  `to_rpc_payload()` emits the new keys; prompt contract.
- Unit (frontend): `ScopeFilters`, `buildDocumentHref`, `matchedMetadataKeys`
  (semantics mirror the RPC: `country`/`date_issued` for core fields,
  `base_*` for the rest), `?nl=` round-trip in the codec,
  `SaveAsCollectionDialog` with a `createCollectionFromFilter` mock
  (list-shaped response, `CollectionFromFilterError`).
- Route-contract E2E: `/search/extractions` → click a row → 200 on
  `/documents/{id}`; save collection → redirect.

## Out of scope

Fixing the `case_type`/`court_level` facet (separate issue: migration +
reindex + a contract test that "a UK row with non-empty
`base_convict_offences` is not `Civil`"). Meilisearch hybrid search.
Per-jurisdiction facets (PL↔UK comparison).

## Dependencies and links

Blocks: #682 (RPC, endpoint, adapter, codec, proxy). Unblocks: PL↔UK
comparison (date ranges from the NL question). Related: #536 (navigation),
#537 (schema seeding — the "Extract" button on `/collections/{id}` from the
process-flow epic), #583.
