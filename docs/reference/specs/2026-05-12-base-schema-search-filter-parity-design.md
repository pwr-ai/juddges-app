# Base-schema search & filter parity on `/search`

**Status:** draft — pending implementation
**Owner:** Lukasz
**Date:** 2026-05-12
**Related memory:** `[[project-meili-settings-atomic-fail]]`, `[[project-country-pl-default-in-legacy-converter]]`

## 1. Goal & scope

Bring the Meili-backed `/search` page to **full filter parity over every user-relevant `base_*` extraction column** (45 of the 59 columns on `public.judgments`), driven by the same registry that powers `/search/extractions`. Nine free-form text fields move to Meili's `searchableAttributes` (low weight) instead of getting drawer controls.

In scope:

- Extend the Meilisearch transformer + index settings to carry all 45 filterable `base_*` fields and 9 searchable `base_*` fields.
- Extract the grouped filter drawer that currently lives inline in `app/search/extractions/page.tsx` into a shared `<BaseFiltersDrawer>` component, mounted on both `/search` and `/search/extractions`.
- Extend `buildMeilisearchFilter` in `hooks/useSearchResults.ts` to translate every control type (`enum_multi`, `tag_array`, `boolean_tri`, `numeric_range`, `date_range`) into Meili filter syntax.
- Add a new `operational` group to `base-schema-filter-config.ts` exposing `base_extraction_model`, `base_extracted_at`, `base_extraction_status` for QA / model-rollout slicing.
- Wire Meili `facets` calls to power autocomplete on high-cardinality `tag_array` controls.
- Split the Meili settings PATCH into a "safe" pass + an "embedders" pass so the new `filterableAttributes` land even while the bge-m3 embedder backfill is outstanding.

Out of scope:

- Retiring `/search/extractions` (kept as the PG-RPC view with substring text inputs).
- Backfilling the bge-m3 vectors for the legacy index (tracked separately in `[[project-meili-settings-atomic-fail]]`).
- Sort UI for `base_*` fields (we set `sortableAttributes` but don't ship the dropdown).
- Exposing `base_raw_extraction`, `base_search_tsv`, `base_schema_key`, `base_schema_version`, `base_extraction_error` — these are excluded mechanically.

## 2. Architecture

```
       base-schema-filter-config.ts   ← single source of truth (50+ entries, 8 new)
                  │
                  ▼
   components/search/BaseFiltersDrawer.tsx   ← NEW shared component (group-rendered, props-driven)
        │
        ├─ used by  app/search/extractions/page.tsx  →  PG RPC translator (unchanged)
        │
        └─ used by  app/search/page.tsx              →  buildMeilisearchFilter (extended)
                                                              │
                                                              ▼
                                              Meili `filterableAttributes` (+39 base_*)
                                                              ▲
                                              transform_judgment_for_meilisearch (+45 filterable + 9 searchable base_*)
                                                              ▲
                                              Postgres `judgments` row
```

The drawer is **dumb**: it receives `{ filters, onChange, onReset, facetCounts?, disabled? }`. Page-level glue owns the translator and any facet refresh.

## 3. Field inventory & control mapping

Live counts from prod Postgres on 2026-05-12 (12,307 judgments).

### 3.1 Filterable (45 columns)

#### Already filterable in Meili — no change required (6)

| Column | PG type | Distinct | Control |
|---|---|---:|---|
| `base_num_victims` | int4 | 110 | numeric_range |
| `base_victim_age_offence` | numeric | 98 | numeric_range |
| `base_case_number` | numeric | 6 081 | numeric_range |
| `base_co_def_acc_num` | int4 | 36 | numeric_range |
| `base_date_of_appeal_court_judgment_ts` | int (epoch-sec twin) | — | date_range |
| `base_extraction_status` | text | 1 | enum_multi (will move to operational group) |

Note: `keywords` (the non-base column) is also already filterable; `base_keywords` is separate and is promoted in §3.1.2.

#### Newly filterable — already in registry (31)

`base_keywords`, `base_convict_plea_dates`, `base_convict_offences`, `base_acquit_offences`, `base_did_offender_confess`, `base_plea_point`, `base_remand_decision`, `base_sentences_received`, `base_sentence_serve`, `base_what_ancilliary_orders`, `base_offender_gender`, `base_offender_job_offence`, `base_offender_home_offence`, `base_offender_intox_offence`, `base_offender_victim_relationship`, `base_victim_type`, `base_victim_gender`, `base_victim_intox_offence`, `base_pros_evid_type_trial`, `base_def_evid_type_trial`, `base_pre_sent_report`, `base_agg_fact_sent`, `base_mit_fact_sent`, `base_vic_impact_statement`, `base_appellant`, `base_appeal_against`, `base_appeal_ground`, `base_sent_guide_which`, `base_appeal_outcome`, `base_reason_quash_conv`, `base_reason_sent_excessive`, `base_reason_sent_lenient`, `base_reason_dismiss`.

Controls already declared in `base-schema-filter-config.ts`; no registry edit needed.

#### Newly filterable — *new registry entries required* (8)

| Column | Distinct | Group | Control | Notes |
|---|---:|---|---|---|
| `base_conv_court_names` | 1 432 | `court_date` | tag_array | Free-text but bounded; tag chip + facet autocomplete |
| `base_sent_court_name` | 1 025 | `court_date` | tag_array | Same shape |
| `base_victim_job_offence` | 490 | `victim` | tag_array | Free-text |
| `base_victim_home_offence` | 348 | `victim` | tag_array | Free-text |
| `base_extraction_model` | 2 | `operational` (NEW group) | enum_multi | Slice by model version |
| `base_extracted_at` | 12 307 | `operational` | date_range | Slice by extraction date |
| `base_extraction_status` | 1 | `operational` | enum_multi | Surface in drawer when ≥2 statuses exist |

#### Net counts

- Filterable in Meili after this work: **45** (6 existing base + 31 newly-promoted-from-registry + 8 newly-registered).
- Filter-attribute additions: **+39** over today's 6 base entries.

### 3.2 Searchable (9 columns)

Added to `searchableAttributes` *after* `title`, `summary`, `full_text` so they only break ties:

`base_neutral_citation_number`, `base_appeal_court_judges_names`, `base_case_name`, `base_offender_representative_name`, `base_crown_attorney_general_representative_name`, `base_remand_custody_time`, `base_offender_age_offence`, `base_offender_mental_offence`, `base_victim_mental_offence`.

Three of these (`base_appeal_court_judges_names`, `base_case_name`, `base_offender_representative_name`) are in the existing registry as `substring` controls; they are dropped from the `/search` drawer per the prior round but `/search/extractions` retains their substring text inputs against the PG RPC. The remaining six have no drawer control on either page.

### 3.3 Excluded (5 columns)

| Column | Reason |
|---|---|
| `base_schema_key` | Constant ("uk_base_schema_v1") |
| `base_schema_version` | Constant; revisit on schema bump |
| `base_extraction_error` | Always null |
| `base_raw_extraction` | Full LLM blob; filtering is meaningless, indexing is wasteful |
| `base_search_tsv` | `tsvector` — Meili cannot index |

### 3.4 Control → Meili clause map

| Control | Meili shape | Clause |
|---|---|---|
| `enum_multi` (scalar or array column) | `string` or `string[]` | `field IN [v1, v2, …]` |
| `tag_array` | `string[]` | `field IN [v1, v2, …]` |
| `boolean_tri` | `bool` | `field = true` / `field = false` / no clause when "unset" |
| `numeric_range` | `int` / `numeric` | `field >= min AND field <= max` (already implemented) |
| `date_range` | `int` epoch-sec twin (e.g. `*_ts`) | `<field>_ts >= … AND <= …` |

## 4. Backend changes

All edits in `backend/app/services/meilisearch_config.py`.

### 4.1 `transform_judgment_for_meilisearch`

Add pass-through assignments for the 45 filterable + 9 searchable fields (the 6 already-filterable rows stay as-is, so net new emissions = 48). Coerce `decimal.Decimal` → `int|float` (mirrors the 2026-05-12 finding); pass `text[]` through as a Python list; emit `bool` directly. For `base_extracted_at`, emit both the ISO-8601 string (for display) and an epoch-sec twin `base_extracted_at_ts` for range filtering (same pattern as `base_date_of_appeal_court_judgment_ts`).

### 4.2 `MEILISEARCH_INDEX_SETTINGS`

- `filterableAttributes`: append the 39 new columns (including `base_extracted_at_ts`).
- `searchableAttributes`: append the 9 free-form text columns at the end so they only contribute to relevance after the core fields.
- `sortableAttributes`: add `base_date_of_appeal_court_judgment_ts`, `base_extracted_at_ts`, `base_num_victims`, `base_case_number` (no UI change in this PR; cheap to declare).
- `displayedAttributes`: append the 45 filterable + 9 searchable fields (54 in total) so the card view and future detail surfaces can read them without a re-roundtrip.

### 4.3 Settings PATCH safety

The current `setup_meilisearch_index` sends the entire `MEILISEARCH_INDEX_SETTINGS` object in one `PATCH /settings`. Per `[[project-meili-settings-atomic-fail]]`, that call has been failing in prod on the `embedders.bge-m3` block, taking the rest of the settings down with it. For this work:

1. Split the call into two phases inside `setup_meilisearch_index`:
   - **Phase A — safe block:** `PATCH /settings` with the canonical settings *minus* the `embedders` key. Fail loudly if this errors.
   - **Phase B — embedders:** `PATCH /settings/embedders` with the `embedders` block alone. Log and swallow failures; do not block phase A.
2. Keep retry logic only around phase A.
3. Document the split in a code comment with a link back to this spec.

This is a behaviour-preserving refactor for indexes that already have working embedders, and an unblocker for prod where embedders is poisoned.

### 4.4 Sync trigger

After the new image is deployed, dispatch `meilisearch.full_sync` once so every doc carries the new fields. The periodic 6-h beat job will then maintain freshness. Smoke-test with a filtered query per control type (see §7).

## 5. Frontend changes

### 5.1 `frontend/lib/extractions/base-schema-filter-config.ts`

- Add the `operational` group to `FilterGroup`, `GROUP_LABELS`, `GROUP_ORDER` (placed last).
- Add the 8 new registry entries from §3.1 with `field` matching the PG column minus the `base_` prefix (e.g. registry uses `extraction_model`; the Meili field name is `base_extraction_model` — translation already happens in `BASE_FILTER_FIELDS` in `useSearchResults.ts`).
- Update `BASE_FILTER_FIELDS` in `hooks/useSearchResults.ts` so every registry field maps to its `base_*` Meili column name.

### 5.2 `frontend/components/search/BaseFiltersDrawer.tsx` (new)

Extract from `app/search/extractions/page.tsx`'s inline drawer:

```ts
interface BaseFiltersDrawerProps {
  filters: BaseFilters;
  onChange: (field: keyof BaseFilters, value: BaseFilterValue) => void;
  onReset: () => void;
  facetCounts?: Record<string, Record<string, number>>; // optional, populates tag_array autocomplete
  facetLoading?: Record<string, boolean>;
  disabled?: boolean;
}
```

- Iterates `GROUP_ORDER` → `FIELDS_BY_GROUP[group]` → one collapsible section per group.
- One sub-component per `FilterControl` (`EnumMultiControl`, `TagArrayControl`, `BooleanTriControl`, `NumericRangeControl`, `DateRangeControl`).
- `TagArrayControl` accepts `facetCounts?.[field]` and renders a chip-input with a suggestions popover populated from facet values; falls back to plain free-text when no facets are provided (so `/search/extractions` doesn't need facets).
- No router / API access inside the component.

### 5.3 `frontend/hooks/useSearchResults.ts`

Extend `buildMeilisearchFilter` with one translator per control. Sketch (illustrative, not final):

```ts
function rangeClause(field: string, range: BaseNumericRange): string | null { /* unchanged */ }

function enumClause(field: string, values: string[]): string | null {
  if (!values.length) return null;
  const list = values.map(v => JSON.stringify(v)).join(', ');
  return `${field} IN [${list}]`;
}

function booleanClause(field: string, tri: BooleanTri): string | null {
  return tri === 'unset' ? null : `${field} = ${tri}`;
}
```

Drive the dispatch from `FILTER_FIELD_BY_NAME[field].control` rather than a switch hard-coded to today's 5 numeric fields.

### 5.4 Facet autocomplete (high-cardinality `tag_array`)

- New helper `fetchBaseFieldFacets(fields: string[], query?: string)` in `lib/api/search.ts` that calls Meili's `searchableAttributes` → `facets` parameter via the existing `/api/search/documents` proxy (extended to forward `facets[]` / `q`). Returns `Record<field, Record<value, count>>`.
- Hook `useBaseFieldFacets(activeTagFields: string[])` in `hooks/`: requests facets for currently-mounted `tag_array` controls; debounces typing input; caches per-field per-query for 60s.
- `TagArrayControl` calls the hook when the input is focused or typed into.
- Backend: extend `backend/app/judgments_pkg/__init__.py:/search` to forward `facets[]` to Meili and return `facetDistribution` to the frontend. Cap at the top 20 values per field; allow `facetQuery` for typed substring narrowing.

### 5.5 Store (`lib/store/searchStore.ts`)

- Replace today's `BaseFilters` (5 numeric fields) with a typed map keyed by registry field:
  ```ts
  type BaseFilters = {
    [field: string]:
      | { kind: 'enum_multi'; values: string[] }
      | { kind: 'tag_array'; values: string[] }
      | { kind: 'boolean_tri'; value: BooleanTri }
      | { kind: 'numeric_range'; range: BaseNumericRange }
      | { kind: 'date_range'; range: BaseNumericRange };
  };
  ```
- Reuse the URL serializer that `/search/extractions` already has (move it to `lib/extractions/url-serializer.ts` and import from both pages).
- Update `BASE_FILTER_FIELDS` (the field-name → Meili-column map) to cover the full registry.

### 5.6 Page wiring

- `app/search/page.tsx`: replace `<ExtractedFieldsFilter …>` with `<BaseFiltersDrawer …>`; pipe `useBaseFieldFacets()` output into `facetCounts`.
- `app/search/extractions/page.tsx`: replace inline drawer with `<BaseFiltersDrawer …>` (no `facetCounts` prop — falls back to free text); keep the existing substring text inputs rendered *above* the drawer.
- Delete `frontend/components/search/ExtractedFieldsFilter.tsx`.

## 6. Rollout

Per `[[feedback-no-gha-docker-builds]]`, prod images are built manually.

1. Merge the code changes to `main` (backend transformer + split settings, frontend drawer + translator + facets).
2. Build + push images via `./scripts/build_and_push_prod.sh patch`. Deploy with `./scripts/deploy_prod.sh`.
3. The new `setup_meilisearch_index` runs on backend boot — phase A applies the new `filterableAttributes` / `searchableAttributes`; phase B's embedder failure is logged but does not block.
4. Dispatch `meilisearch.full_sync` manually (`docker exec juddges-backend-worker celery -A app.workers call meilisearch.full_sync`). Expect ~2 minutes for 12 307 docs.
5. Smoke-test on `/search`: open drawer, exercise one control per type, confirm hit counts (see §7).
6. If anything regresses, roll back via `./scripts/deploy_prod.sh --rollback`; the index data is forward-compatible (extra fields are ignored by older code).

## 7. Testing

### Unit (frontend)

- Extend `__tests__/hooks/buildMeilisearchFilter.test.ts` with one case per control type: `enum_multi`, `tag_array`, `boolean_tri` (both true and false), `date_range`, and at least one combined query that also constrains `jurisdiction`.
- Add `__tests__/components/search/BaseFiltersDrawer.test.tsx` covering: renders one section per group, calls `onChange` with the right shape per control, applies `facetCounts` to `TagArrayControl` suggestions.

### Unit (backend)

- Extend `tests/app/test_meilisearch_sync.py` to feed a fixture row covering every `base_*` data type (text, text[], bool, int, numeric, date, timestamptz) and assert the transformer's output preserves type and includes both `base_extracted_at` and `base_extracted_at_ts`.
- Add `tests/app/test_meilisearch_config.py::test_settings_split_phases` to verify `setup_meilisearch_index` issues the two PATCH calls in order and continues on embedder failure.

### Smoke (manual, post-deploy)

For each control type pick a known-populated value from §3 and confirm Meili returns > 0 hits:

| Control | Filter | Expected non-zero (PG count) |
|---|---|---|
| numeric_range | `base_num_victims = 1` | 5 485 |
| enum_multi | `base_appellant IN ["offender"]` | sample PG first |
| tag_array | `base_appeal_outcome IN ["dismissed"]` | sample PG first |
| boolean_tri | `base_vic_impact_statement = true` | sample PG first |
| date_range | `base_date_of_appeal_court_judgment_ts >= 2020 jan 1` | sample PG first |
| facet autocomplete | tag input typing "frau" against `base_convict_offences` | should suggest known offence variants |

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| The embedders block still poisons prod settings | §4.3 split — phase A is independent |
| `text[]` array fields explode Meili index size | Distinct counts ≤12k per field; per-row payload growth ~1–2 KB; ~12 MB total index growth — acceptable |
| Facet-autocomplete request volume | Debounced + 60s LRU cache + 20-value cap per field per query |
| Forward-compat with old containers reading the new index | Old containers ignore unknown fields; clause syntax for new controls only used when the drawer renders them, which only happens when the new frontend is deployed |
| Store/URL schema migration breaks bookmarked searches | Old `BaseFilters` keys map cleanly into the new union (numeric_range form unchanged); add a one-time URL migration step on store init |

## 9. Open questions

- Should `base_extracted_at` use the timestamptz value verbatim or be coerced to date for the drawer's `date_range` control? Picking timestamptz keeps precision; date range UI rounds to day.
- Should `BaseFiltersDrawer` collapse all groups by default, or expand `court_date` + `offender` + `victim` (the most-used three)? Default in v1: all collapsed except the first group, configurable later.
