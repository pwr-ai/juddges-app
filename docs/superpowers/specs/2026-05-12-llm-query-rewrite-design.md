# LLM-based Query Rewrite for `/search`

- **Date:** 2026-05-12
- **Status:** Design — awaiting plan
- **Mode affected:** "thinking" search type only
- **Branch:** `worktree-query-rewrite-spec`

## 1. Problem

The "thinking" search type currently calls `enhance_query_chain`, which only
expands abbreviations into a flat string. It cannot:

- Pull explicit filter values out of natural-language queries (e.g.
  "wyroki sądu apelacyjnego z 2022 dotyczące VAT" should set
  `court_level=appellate`, `decision_date.from=2022-01-01`, `keywords=[VAT]`).
- Constrain output to the index's real facet vocabulary, so any extracted
  value is at risk of zero-result hallucinations.
- Reuse the existing facet sidebar UX users already understand.

We want one LLM call that returns a **rewritten query string + structured
filters** so the Meilisearch path can pre-filter accurately and rank on a
cleaner query text.

## 2. Goals & non-goals

### Goals

- Extract every Meilisearch-facetable field listed in
  `backend/app/services/meilisearch_config.py` (`filterableAttributes`).
- Validate open-vocab arrays (`keywords`, `legal_topics`, `cited_legislation`)
  against the live index before applying them.
- Apply extracted filters silently through the existing `useSearchStore`
  setters; no new UI surface in this iteration.
- Add no latency or behaviour change to the "rabbit" (instant) mode path.
- Keep `enhance_query_chain` untouched for its other consumers
  (`backend/app/precedents.py`).

### Non-goals

- Pgvector / hybrid path changes (text mode only; hybrid is disabled in
  production after #200/#202).
- "JuDDGES understood your query as…" preview UI — possible follow-up,
  not in scope.
- Multi-step / agent loops. One LLM call, one validation pass.
- Per-tenant or per-collection prompt overrides.
- Cross-lingual *translation* inside the rewriter. The `languages` filter
  handles cross-lingual recall; the rewriter only normalises terminology.

## 3. Architecture

### 3.1 End-to-end data flow

```
SearchForm (thinking-mode submit)
        │
        ▼  POST /api/query_rewrite   (Next.js BFF — new)
        ▼  POST /documents/search/rewrite   (FastAPI — new route)
        │
        ├── query_rewrite_chain  (juddges_search.chains.query_rewrite)
        │     • System+user prompt with full facet contract & today's date
        │     • ChatOpenAI(model=gpt-5-mini, reasoning_effort=minimal)
        │           .with_structured_output(QueryRewriteResult)
        │     • Returns QueryRewriteResult (Pydantic, schema-validated)
        │
        └── FacetValidator  (backend.app.services.facet_validation)
              • For each open-vocab array: Meilisearch facet-search →
                canonical value or drop
              • Clamp numeric ranges to known min/max (cached)
              • Normalise languages (en → uk; matches searchStore rule)
              • Return RewrittenQueryEnvelope
        │
        ▼ envelope returned to BFF, then to useQueryRewrite()
        │
        ├── Hydrate searchStore: setBaseFilters / setFilters /
        │   setSelectedLanguages / setDateFilter
        └── useSearchResults.search(envelope.rewritten_query) runs the
            regular Meili search against the now-prefiltered store
```

### 3.2 New components

| Unit | Path | Responsibility |
|---|---|---|
| `QueryRewriteResult` | `backend/packages/juddges_search/juddges_search/chains/query_rewrite_models.py` | Pydantic schema for the LLM's structured output. Enums for the 5 categorical facets. Numeric ranges as `{min, max}`. ISO-8601 dates. All fields nullable; LLM must emit `null` when uncertain. |
| `query_rewrite_chain` | `…/chains/query_rewrite.py` | LangChain Runnable: prompt → `model_mini.with_structured_output(QueryRewriteResult)` → result. Configured with the project's standard callbacks. |
| `RewrittenQueryEnvelope` | `backend/app/models/query_rewrite.py` | Backend-side combined model returned by the route: `rewritten_query`, `filters`, `diagnostics`, `degraded`. |
| `FacetValidator` | `backend/app/services/facet_validation.py` | Pure service holding a reference to `MeiliSearchService`. `validate(result: QueryRewriteResult) -> RewrittenQueryEnvelope`. Uses Meilisearch facet-search with a 250ms timeout per field; on failure the field is left empty rather than blocking. |
| `/documents/search/rewrite` | `backend/app/routers/documents.py` (extend) | New POST endpoint, mirrors `/enhance` plumbing (X-API-Key, AppError shape, logging). Orchestrates chain + validator. |
| `/api/query_rewrite` | `frontend/app/api/query_rewrite/route.ts` | Next.js BFF; mirrors `frontend/app/api/enhance_query/route.ts` exactly (auth header, error mapping). |
| `useQueryRewrite` | `frontend/hooks/useQueryRewrite.ts` | Calls the BFF, applies envelope to `useSearchStore`, returns `{ degraded, diagnostics }` for telemetry. |
| `useSearchResults` | `frontend/hooks/useSearchResults.ts` (extend) | When `searchType === "thinking"`, awaits `useQueryRewrite.run()` before issuing the search. Falls back to existing flow when `degraded === true`. |

### 3.3 Envelope returned to the frontend

```ts
interface RewrittenQueryEnvelope {
  rewritten_query: string;                   // never empty; falls back to original
  filters: {
    base: BaseFilters;                       // BaseNumericRange per existing store
    facets: {
      jurisdiction?: 'PL' | 'UK';
      court_level?: string;                  // from filterable enum
      case_type?: string;
      decision_type?: string;
      outcome?: string;
    };
    arrays: {
      keywords: string[];                    // canonicalised by FacetValidator
      legal_topics: string[];
      cited_legislation: string[];
    };
    decision_date?: { from?: string; to?: string };   // YYYY-MM-DD
    languages?: string[];                    // ['pl'], ['uk'], or both
  };
  diagnostics: {
    dropped_terms: string[];                 // values the validator rejected
    latency_ms: number;
    model: string;
  };
  degraded: boolean;                         // true if LLM call failed / timed out
}
```

`BaseFilters` is the existing type at
`frontend/lib/store/searchStore.ts:44`; the contract maps 1-1 onto its
fields (`numVictims`, `victimAgeOffence`, `caseNumber`, `coDefAccNum`,
`appealJudgmentDate`).

## 4. Prompt design

System prompt sections, in order:

1. **Role.** "You convert legal-research questions about Polish & UK
   court judgments into a Meilisearch query envelope."
2. **Today's date.** Injected as `{today}` (ISO-8601) so relative phrases
   like "ostatnie 5 lat" / "since 2020" resolve deterministically.
3. **Facet vocabulary.** Static enums for `jurisdiction`, `court_level`,
   `case_type`, `decision_type`, `outcome` — generated at import time from
   `MEILISEARCH_INDEX_SETTINGS["filterableAttributes"]` and a sibling
   `MEILISEARCH_FACET_VOCABULARY` dict added to `meilisearch_config.py`
   so prompt and Pydantic schema share one source of truth.
4. **Rules.**
   - Emit every field; use `null` when uncertain. Never guess.
   - Numeric ranges only when the user is explicit ("at least 3 victims",
     "appeals between 2018 and 2022").
   - Arrays: at most 6 candidate strings; the backend canonicalises.
   - `rewritten_query` preserves intent, strips terms that became chips,
     expands legal abbreviations (e.g. "k.k." → "kodeks karny").
   - Keep Polish accents intact; do not transliterate.
5. **Few-shot examples.** 4–6 hand-curated `pl` and `uk` pairs covering:
   numeric range, date range, multi-keyword, court-level + jurisdiction,
   negative case (no extractable filters → only rewrite).

Model: `gpt-5-mini` via `juddges_search.llms.get_default_llm(use_mini_model=True)`,
with `reasoning_effort="minimal"` (same setting as today's enhancer —
see `backend/packages/juddges_search/juddges_search/chains/query_enhancement.py`
for the precedent) and a 6 s server-side timeout.

## 5. Validation rules (`FacetValidator`)

| Field type | Rule |
|---|---|
| Categorical (`jurisdiction`, `court_level`, `case_type`, `decision_type`, `outcome`) | Already constrained by Pydantic enum; no extra check beyond `None`-passthrough. |
| Arrays (`keywords`, `legal_topics`, `cited_legislation`) | For each value, call `MeiliSearchService.facet_search(facet_name, query=value, limit=3)`. If any returned name matches case-insensitively, replace with that canonical name. Otherwise drop and record in `diagnostics.dropped_terms`. |
| `decision_date` | Validate ISO format; require `from <= to`. Reject impossible years (`< 1900` or `> today+1y`). |
| `base.*` ranges | Clamp to cached `MIN_MAX_BY_FIELD` map populated at app startup from `judgments` aggregates. Drop the field if both ends are outside the legal range. |
| `languages` | Lowercase; map `en → uk` to match `normalizeLanguages` in `searchStore.ts:188`. Drop unknown codes. |

The validator runs all field checks concurrently with `asyncio.gather`,
with a per-field 250 ms timeout and a hard 1 s total. If the validator
itself times out, the envelope is returned with empty `arrays.*` and
`degraded: false` (we still trust the categorical/numeric extraction).

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| LLM 5xx / timeout (6 s) | Return `{rewritten_query: original, filters: {}, degraded: true}`. Frontend silently falls through to the existing flow. Logged as WARNING with request id. |
| Structured-output parse failure | Functionally impossible with `with_structured_output`. Treated identically to LLM timeout if it happens. |
| Meili facet-search timeout | Field-level skip; remaining filters still apply. |
| Numeric clamp removes both bounds | Drop the field entirely; do not apply an unbounded range. |
| Backend unreachable from BFF | BFF returns 503 with `AppError`; `useSearchResults` catches and proceeds with the original query (matches today's `enhance_query` behaviour). |

## 7. Caching & cost

- Module-level TTL cache (`cachetools.TTLCache`) on the route handler
  keyed on `(normalised_query, sorted(languages_hint))`, 256 entries,
  60 s TTL. Stops the cost from running away when a user iterates on
  filters without changing the typed query.
- Telemetry: every call emits a Loguru log line with `latency_ms`,
  `dropped_count`, `degraded` for analysis through the existing log
  pipeline. No new dashboards.

## 8. Testing strategy

### Backend unit
- `tests/packages/juddges_search/test_query_rewrite_chain.py`
  - `FakeListLLM` returning canned JSON → assert `QueryRewriteResult`
    field-for-field.
  - Date-relative phrases resolve against fixed `today=2026-05-12`.
- `tests/app/test_facet_validation.py`
  - Mock `MeiliSearchService.facet_search` for hit / miss / timeout.
  - Numeric clamp at known boundaries.
  - Language normalisation matches `normalizeLanguages`.

### Backend integration (opt-in `@pytest.mark.integration`)
- 8-golden-query suite (Polish + English) against real OpenAI + real
  Meilisearch facet endpoints. Asserts `dropped_terms == []` for the
  golden cases and at least one expected facet present per query.

### Frontend unit (Jest)
- `__tests__/hooks/useQueryRewrite.test.ts`
  - Mocks `/api/query_rewrite`, asserts the right setters fire on the
    store.
  - On `degraded: true`, asserts the store is **not** mutated.

### E2E (Playwright)
- New scenario in the existing search E2E:
  1. Submit a thinking-mode query that should produce facets.
  2. Assert `/api/query_rewrite` request fires before `/api/search/*`.
  3. Assert the facet sidebar shows the expected chip (e.g. court level).
  4. Assert the subsequent `/api/search/*` request body's `q` field
     equals the rewritten query returned by the rewrite endpoint
     (i.e. the cleaned text was used, not the raw input).

## 9. Migration & rollout

- **No data migration** required; depends only on existing facetable
  attributes.
- **Feature gate:** new route gated behind `QUERY_REWRITE_ENABLED` env
  flag (default `true` in dev, `false` in prod for the first deploy).
  Flip on after the golden-query integration suite is green against
  prod Meili.
- **Back-compat:** `/documents/search/enhance` and `enhance_query_chain`
  remain untouched; the new chain lives next to them and they're
  exported independently from `juddges_search.chains`.

## 10. Open questions parked for follow-ups

- Should `rewritten_query` be shown to the user (e.g. as a one-line
  "Searched for: …" label above results)? Out of scope for v1 per
  brainstorm decision; revisit after we have a week of `diagnostics`
  data.
- Vector / hybrid integration. Blocked on re-enabling the Meilisearch
  hybrid embedder path that was reverted in #202.
- Personalisation: feeding the user's saved searches into the prompt as
  a "user vocabulary" hint. Defer until the saved-searches feature has
  meaningful adoption.

## 11. Required-checks impact

- Backend Lint: ruff on the new modules.
- Backend Unit Tests: new tests above.
- Frontend Lint & Typecheck: new hook + types.
- Frontend Unit Tests: Jest tests above.

All four required CI checks remain green; no new ones added.
