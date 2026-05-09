# /search — judgment-only, blazing fast

**Date:** 2026-05-09
**Owner:** Lukasz
**Status:** Approved (verbal); pending written review

## Goal

`POST /api/documents/search` (frontend) → `POST /documents/search` (backend) returns the first page of results almost instantaneously and never throws on the
`document_type` invariant again. We achieve this by:

1. **Removing all `document_type` machinery** from the search hot path — the
   `judgments` table has no `document_type` column, the backend hard-coded
   `JUDGMENT`, and the frontend coerced everything to `JUDGMENT` anyway. The
   field is ceremony, not function.
2. **Purging `tax_interpretation` codebase-wide** since search is the primary
   surface and there are no other live consumers expected to keep it.
3. **Five focused performance fixes** that cut wall-clock time per search.

## Non-goals

- LangServe chat/QA chains, citation network, similar-documents endpoints, the
  schema_generator agent's prompt examples — those keep working with the same
  visible behaviour. We touch them only to remove `tax_interpretation` literals.
- The legacy `/documents/search/legacy` endpoint stays as-is.
- We do **not** drop the `document_type` column from the `documents` table (if
  one exists with `tax_interpretation` rows). We just stop reading the value
  for routing.

## Architecture changes

### A. Search hot path simplification (judgment-only)

| Layer | File | Change |
|---|---|---|
| Backend | `backend/app/documents.py` | `_build_search_result_payload` already omits `document_type` — leave it omitted. `_convert_judgment_to_legal_document` keeps hard-coded `DocumentType.JUDGMENT` (with the enum reduced to a single value, this is fine). Drop the `document_types` filter parameter from `search_documents`. |
| Backend | `backend/app/models.py` | Drop `document_types` field and its validator from `SearchChunksRequest`. Same for `SearchDocumentsDirectRequest` if present. |
| Frontend | `frontend/hooks/useSearchResults.ts` | Delete the parse/throw block at lines 431-451 and the duplicate at 778-787. Delete `documentTypes`/`requestedDocumentTypes`/`overrideDocumentTypes` parameters and their plumbing. |
| Frontend | `frontend/hooks/useSearchUrlParams.ts` | Drop `document_type` URL param read/write. Drop `setDocumentTypes` calls. |
| Frontend | `frontend/lib/store/searchStore.ts` | Drop `documentTypes` and `setDocumentTypes` from store. Drop `isUnknownDocumentType`. |
| Frontend | `frontend/lib/api/search.ts` | Drop `document_types` from `SearchChunksInput` and `SearchDocumentsDirectInput`. |
| Frontend | `frontend/types/search.ts` | Drop `document_type` from `LegalDocumentMetadata`, `SearchChunk`, `WeaviateDocument`. Keep on `SearchDocument` only if the document detail page still needs it (it doesn't — strip there too). |

### B. Codebase-wide `tax_interpretation` purge

#### Shared package
- `backend/packages/juddges_search/juddges_search/models.py` — drop the
  `DocumentType` enum entirely. Replace consumer references with the literal
  string `"judgment"` or remove the field. (Enum had only two values; one
  remaining value is not worth an enum.)

#### Backend
- `backend/app/dashboard.py:615` — change `.in_("document_type", [...])` to
  `.eq("document_type", "judgment")` (preserves filter, cuts the
  `tax_interpretation` rows). `dashboard.py:736` — drop from any list literal.
- `backend/app/precedents.py:71` — strip `tax_interpretation` from filter
  description and validation if present.
- `backend/app/search_intelligence.py:169, 412` — drop the
  `tax_interpretation` weight entry and description.
- `backend/app/utils/validators.py` — `validate_document_types` either gets
  deleted (if the param is gone) or accepts only `"judgment"`.
- `backend/app/graphql_api/types.py` — drop `tax_interpretation` from any
  enum/union types. **Public API surface change** — call out in PR description.
- `backend/app/api/schema_generator.py` — drop from example doctype lists.
- `backend/app/documents.py:1007-1056` and similar — search request
  doctype-handling code goes away with Section A.
- `backend/app/models.py` — drop `tax_interpretation` from any enum, examples,
  doctype lists. Fix `SearchChunksRequest.document_types` (already going) and
  any other model carrying the literal.
- `backend/scripts/generate_lawyer_schemas.py` — drop from any list literals.

#### Frontend
- `frontend/types/search.ts:1-5` — remove the `DocumentType` enum entirely.
  Replace consumers with the literal string `"judgment"`. Drop `ERROR` value.
- `frontend/types/chat-sources.ts:101` — remove the `tax_interpretation` entry
  from the source-type config map.
- `frontend/components/chat/SourceCard.tsx:31, 40` — drop the
  `TAX_INTERPRETATION` and `ERROR` switch cases.
- `frontend/components/SchemaGenerator.tsx:46` — drop the
  `tax_interpretation → "Legal document"` mapping.
- `frontend/components/DocumentVisualization.tsx:59` — drop the
  `tax_interpretation` colour entry.
- `frontend/components/similarity-viz/types.ts:112, 120` — drop
  `tax_interpretation` from type and colour map.
- `frontend/components/dashboard/document-card-compact.tsx:17` — drop entry.
- `frontend/app/extract/page.tsx:294` — remove the
  `tax_interpretation` branch of the badge resolver.
- `frontend/lib/styles/components/search-filters.tsx:78` — remove the
  `tax_interpretation` style branch.
- `frontend/lib/styles/components/document-card.tsx`,
  `frontend/lib/styles/components/filter-toggle-group.tsx` — drop entries.
- `frontend/components/SchemaGenerator.tsx`,
  `frontend/__tests__/components/chat/SourceCard.test.tsx`,
  `frontend/__tests__/lib/store/searchStore.test.ts`,
  `frontend/__tests__/integration/search-flow.test.tsx`,
  `frontend/__tests__/lib/api-client.test.ts`,
  `frontend/__tests__/hooks/useGraphData.test.ts`,
  `frontend/tests/e2e-docker/api-integration.spec.ts`,
  `frontend/tests/e2e/api/backend-api.spec.ts`,
  `frontend/tests/e2e/search/complete-search-flow.spec.ts`,
  `frontend/tests/e2e/search/search-flow.spec.ts`,
  `frontend/tests/e2e/helpers/api-mocks.ts` — drop fixtures and assertions on
  `tax_interpretation`. **Deletion rule**: a test file or `describe`/`it`
  block whose *sole purpose* is to assert `tax_interpretation` handling
  (e.g., "renders TI badge", "filters TI correctly") is deleted. Tests that
  iterate over both types simplify to judgment-only. Mixed integration tests
  stay; their fixture data drops `tax_interpretation` entries.

#### Backend tests
- `backend/tests/app/test_serializers.py`,
  `backend/tests/app/test_graphql_converters.py`,
  `backend/tests/app/test_schema_generator.py`,
  `backend/tests/app/test_precedents.py` — same treatment.

#### Database
- New migration `supabase/migrations/2026050900000X_drop_tax_interpretation_dashboard_stats.sql`:
  ```sql
  delete from dashboard_precomputed_stats
  where stat_key in ('tax_interpretation', 'tax_interpretation_pl', 'tax_interpretation_uk');
  ```
  Existing migrations (`20260325`, `20260509`) are immutable history — leave
  them. The forward migration removes the rows so dashboards stop showing zero
  for "Tax Interpretations".

### C. Performance fixes

#### C1 — Eliminate the second round-trip
`useSearchResults.search()` calls `searchChunks` and then immediately
`fetchDocumentsByIds` for the same document IDs. The backend's search response
already includes `documents` built from the same RPC rows. Skip the second
fetch when `result.documents` is populated.

- **Frontend**: in `useSearchResults.ts`, when `result.documents?.length`,
  feed those directly into `fullDocumentsMapRef`. Only call
  `fetchDocumentsByIds` for the (rare) gap case where chunks reference docs
  not in `result.documents`.
- **Frontend**: same treatment in `loadMore()`.
- **Backend**: confirm the search response *always* includes lightweight
  documents (it already does via `_build_search_result_payload`), and that
  the lightweight shape matches what the card needs.
- **Expected gain**: 150–300 ms per search, plus a JSON parse round.

#### C2 — Trim response payload
Add `result_view: Literal["card", "full"] = "card"` to `SearchChunksRequest`.

- **Card view** returns only: `document_id`, `title`, `summary`,
  `date_issued`, `publication_date`, `document_number`, `court_name`,
  `language`, `country`. Roughly 9 fields, ~200 bytes per doc.
- **Full view** returns the existing payload (used by detail panels if any).
- The detail page (`GET /documents/{id}`) is the canonical full-doc fetch and
  is unchanged.
- **Frontend**: drop the long `return_properties` list from
  `fetchDocumentsByIds` calls inside `useSearchResults` (no longer needed
  since C1 skips them on the happy path; if invoked as fallback, request the
  card-view fields).
- **Expected gain**: 5–10× JSON shrink, less parse work, less wire time.

#### C3 — Redis result cache
New module `backend/app/search_cache.py` mirroring the pattern in
`backend/app/embedding_cache.py`.

- Cache key: SHA-256 of normalised JSON of (query, alpha, languages, mode,
  jurisdictions, court_names, court_levels, case_types, decision_types,
  outcomes, keywords, legal_topics, cited_legislation, date_from, date_to,
  offset, limit_docs, result_view).
- Cache value: serialised `SearchChunksResponse` (Pydantic
  `model_dump_json()`).
- TTL: 300 s (env-overridable via `SEARCH_CACHE_TTL_SECONDS`).
- DB index: `_CACHE_DB = 4` (or whatever the next free index is given
  embedding cache uses 1 and rate limits use 2 — confirm during impl).
- Bypass: when `mode == "thinking"` (LLM analysis is non-deterministic) and
  when `request.no_cache` is true (for benchmarking; default false).
- Insert *after* rerank, *before* response model serialisation, so hits skip
  even Pydantic round-trip overhead. Hits return the raw JSON string with
  appropriate `Content-Type` header.
- **Expected gain**: hot queries return in <50 ms wall-clock.

#### C4 — Fix `estimated_total`
Today `_build_search_pagination` hard-codes `estimated_total=None`. Frontend
asks for `include_count=True` and silently gets nothing.

- Add a count helper that runs alongside the search RPC for the first page
  only (`offset == 0` and `request.include_count`).
- Implementation: a new Postgres function `count_judgments_filtered(...)` in
  `supabase/migrations/2026050900000Y_add_count_judgments_filtered.sql` that
  takes the same filter parameters as `search_judgments_hybrid` and returns
  `COUNT(*)`. Call it via `supabase.rpc(...)` from the same backend method.
  Reasoning: keeping count logic next to search logic prevents drift when
  filters evolve.
- Cache the count for 60 s per filter combination (subset of the C3 cache).
- The number is informative ("about 1,243 judgments"), not exact — that's
  fine for an "estimated total".

#### C5 — Logging cleanup
The frontend `useSearchResults` has ~12 `searchLogger.info(...)` calls in the
hot path. Each serialises a payload object. Prune to 2–3 phase markers:
"search start", "results received", "render ready". Errors and warnings
stay verbose. Same on the backend `documents.py` — keep timing breakdown logs,
delete chunks-cache-state diagnostics that were added for debugging the bug.

## Out of scope

- Streaming/SSE first-result-fast (Strategic option, deferred).
- Separate fast-path RPC for keyword-only queries (Strategic, deferred).
- Server-side rendering of initial results (Strategic, deferred).
- Reranker tuning.
- Embedding model swap.

## Verification

- Frontend: `npm run validate` (lint + typecheck) passes.
- Backend: `poetry run poe check-all` passes.
- Frontend Jest: existing tests pass after the targeted updates.
- Backend pytest: existing tests pass after the targeted updates.
- Manual: searches for "Intellectual property", "podatek VAT", and an
  empty-query edge case all return a populated page within 1 s on first hit
  and <100 ms on warm hit (cached).
- No `document_type` or `tax_interpretation` strings remain in production
  code paths (allowed in: history migrations, this spec, and CHANGELOG).

## Implementation tasks (subagent-dispatch decomposition)

Sequential dispatch — fresh subagent per task with spec-compliance + code-quality
review between tasks (per `superpowers:subagent-driven-development`). Cannot
literally parallelise implementers because tasks share the `DocumentType` enum
file and other shared modules.

| # | Task | Files (approx) |
|---|---|---|
| 1 | **Shared enum + DB migration**: collapse `DocumentType` enum to single value (or remove) in `juddges_search/models.py`; write SQL migration to drop dashboard stats rows | `backend/packages/juddges_search/juddges_search/models.py`, new `supabase/migrations/...sql` |
| 2 | **Backend search hot path**: drop `document_types` from `SearchChunksRequest`, drop filter-application code in `documents.py`; trim `_convert_judgment_to_legal_document` callers | `backend/app/documents.py`, `backend/app/models.py`, `backend/app/utils/validators.py` |
| 3 | **Backend tax_interpretation purge (non-search)**: dashboard, precedents, search_intelligence, graphql_api/types, schema_generator, scripts | `backend/app/dashboard.py`, `backend/app/precedents.py`, `backend/app/search_intelligence.py`, `backend/app/graphql_api/types.py`, `backend/app/api/schema_generator.py`, `backend/scripts/generate_lawyer_schemas.py` |
| 4 | **Frontend search hot path** (incl. C1 + C5): remove document_type plumbing, eliminate second round-trip, prune logging | `frontend/hooks/useSearchResults.ts`, `frontend/hooks/useSearchUrlParams.ts`, `frontend/lib/store/searchStore.ts`, `frontend/lib/api/search.ts`, `frontend/types/search.ts` |
| 5 | **Frontend tax_interpretation purge (non-search)**: chat sources, schema generator, visualizations, badges, styles | `frontend/types/chat-sources.ts`, `frontend/components/chat/SourceCard.tsx`, `frontend/components/SchemaGenerator.tsx`, `frontend/components/DocumentVisualization.tsx`, `frontend/components/similarity-viz/types.ts`, `frontend/components/dashboard/document-card-compact.tsx`, `frontend/app/extract/page.tsx`, `frontend/lib/styles/components/*.tsx` |
| 6 | **Backend perf C2 + C4**: `result_view` param, payload trim, `estimated_total` count helper | `backend/app/documents.py`, `backend/app/models.py`, possibly new `supabase/migrations/...count.sql` |
| 7 | **Backend perf C3**: Redis search result cache | new `backend/app/search_cache.py`, integration in `backend/app/documents.py` |
| 8 | **Tests update**: backend pytest fixtures + frontend Jest + Playwright fixtures and assertions | `backend/tests/app/test_*.py`, `frontend/__tests__/**/*`, `frontend/tests/e2e/**/*` |
| 9 | **Final verification**: `poetry run poe check-all`, `npm run validate`, `npm run test`, manual search smoke | (no source files) |

## Risk register

- **GraphQL type drop** (Task 3) is a public schema change. If external
  consumers exist, this breaks them. Mitigation: confirm during impl that no
  external clients query `tax_interpretation` (search Slack / docs / contact
  list — owner: Lukasz). For internal-only use, ship.
- **Dashboard "Featured examples" composition** (Task 3) currently dedupes by
  doc type to show variety. With one type, dedup logic still works — code
  becomes simpler.
- **Cache invalidation** (Task 7): if data freshness becomes a concern, the
  300 s TTL is the upper bound on staleness for hot queries. Acceptable per
  Tactical scope.
- **`estimated_total` accuracy** (Task 6): the count helper does not reflect
  reranker filtering. We document it as "approximate" in the response field.
