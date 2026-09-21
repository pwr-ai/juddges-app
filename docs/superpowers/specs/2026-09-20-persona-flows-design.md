# Persona flows — design

**Issue:** [#687](https://github.com/pwr-ai/juddges-app/issues/687) · **Date:** 2026-09-20 · **Status:** draft for review
**Research:** [`docs/research-notes/2026-09-20-quantitative-use-cases.md`](../../research-notes/2026-09-20-quantitative-use-cases.md)

## 1. Problem

The app is 17 sidebar routes and 63 pages presented as a toolbox. `docs/reference/APP_STATUS_2026-08-21.md` §1: "the codebase is in better shape than the product is". #646 turned the dashboard into a Plan → Search → Analyze hub, but only on the dashboard; every other surface is still a standalone entry point.

The single largest functional gap (verified 2026-09-20 on `main`): **no surface renders a distribution or cross-tab of extracted fields over a user-defined cohort.** All 12,907 judgments (PL 6,150 + UK 6,157) carry `base_extraction_status = completed` — 51 pre-extracted fields — but the only views over them are a paginated list (`/search/extractions`) and Plotly charts fed from a static JSON file (`/dataset-comparison`).

## 2. Personas and the four flows

| Flow | Persona | Question they bring | Steps (existing route → new) |
|---|---|---|---|
| **Ask** | everyone | "Find judgments about X" | `/search` → `/documents/[id]` |
| **Explore** | sociologist, data analyst, ELS scholar | "How many juvenile drug cases have features X, Y, Z — and what do the distributions look like at 10 / 50 / 100 / 1000 / 5000?" | `/search/extractions` (filters, NL filter) → **Statistics view** → `/collections` (save cohort) → export |
| **Code** | legal researcher | "Extract my own codebook from this cohort" | `/schemas` → `/extract` (**sample wizard**) → `/extractions/[id]` (**review + scale**) → Statistics view over results |
| **Case** | attorney, in-house counsel (radca prawny) | "I have this case — what happened in similar ones, and why?" | `/precedents` (fact pattern) → **grouped similar-case results** → `/reasoning-lines` → `/chat` → memo |

Explore is the headline: it needs no LLM call, works on the whole corpus today, and answers the quantitative question directly. Code and Case depend on the LLM path, which is currently blocked (#546 OpenAI credits, `extraction_schemas` = 0 rows, #507 pipeline unverified, `reasoning_lines` = 0 rows).

## 3. Design principles

1. **Reuse before build.** Every step maps to an existing route. New work is: one aggregate RPC, one statistics view, one sidebar regrouping, one editable review table, one grouping layer on precedent results.
2. **Counts must be auditable.** Every number links back to the judgments behind it (SAOS drill-back; Hall & Wright's "replicability of case selection" is the weakest point in the field). A count with no "show judgments" link is a bug.
3. **Pre-extracted first, LLM second.** Anything answerable from `base_*` / `deep_*` columns is answered without a model call. LLM output is labelled as model output and carries its agreement score where one exists.
4. **Sample before scale.** Custom extraction runs on a seeded sample first; the user sees and corrects it before paying for thousands.
5. **Same filters everywhere.** The cohort definition (`BaseFilters` + text query, or a collection id) is the one object passed between list, statistics, extraction and export. Nothing re-implements filtering.

## 4. Phase A — Sidebar as four flows (idea 9)

**Scope.** Regroup `frontend/components/app-sidebar.tsx` into four labelled groups matching §2, in that order, plus the existing admin group. Today the signed-in sidebar shows 9 routes (`/search`, `/search/extractions`, `/collections`, `/schemas`, `/chat`, `/topics`, `/history`, `/precedents`, `/reasoning-lines`) plus 5 admin-only (`/saved-searches`, `/topic-modeling`, `/argumentation-analysis`, `/judge-fingerprint`, `/admin`, gated by `isAdmin` at `app-sidebar.tsx:362`). All of them stay. Two finished-but-unlisted routes are added (`/extract`, `/extractions` — APP_STATUS §5b); nothing else hidden is promoted.

**Groups and items**

- **Ask** — Search judgments (`/search`), Chat (`/chat`), Search history (`/history`)
- **Explore** — Structured search (`/search/extractions`), Statistics (`/search/extractions?view=stats`, Phase B), Collections (`/collections`), Topics (`/topics`)
- **Code** — Schemas (`/schemas`), Run extraction (`/extract`, new entry), Extraction jobs (`/extractions`, new entry)
- **Case** — Find precedents (`/precedents`), Reasoning lines (`/reasoning-lines`); admin-only until #607's gate is lifted: Judge fingerprint (`/judge-fingerprint`), Argumentation analysis (`/argumentation-analysis`)
- **Admin** — Saved searches (`/saved-searches`), Topic modeling (`/topic-modeling`), Admin panel (`/admin`) — unchanged

`/dataset-comparison` stays out of the sidebar: its charts read a static JSON file, and Phase B supersedes it for live cohorts.

**Flow stepper.** A small `FlowStepper` component (`frontend/components/editorial/`) renders under the page header on every route that belongs to a flow: flow name, "step n of m", previous/next step links. It derives flow and step from `usePathname()` against a single `frontend/lib/navigation/flows.ts` config, which is also what the sidebar reads — one source of truth. Routes outside any flow render nothing.

**i18n.** New keys under `navigation.flows.*` in both `en` and `pl` message files; the sidebar test that asserts key symmetry must stay green.

**Docs.** Rewrite `docs/reference/sidebar-map.md` from `flows.ts` (it currently documents 6 items against 17 rendered — APP_STATUS calls it stale).

**Out of scope.** Command palette changes, dashboard changes (#646 already done), guest visibility rules (#565).

**Tests.** Jest: `flows.ts` covers every sidebar `href`; `FlowStepper` renders step index for a route inside a flow and nothing outside; i18n symmetry. Route-contract E2E: sidebar still exposes every route it exposes today.

## 5. Phase B — Statistics view with scale slider (ideas 3 + 4)

### 5.1 Data: one aggregate RPC

New SQL function in a new migration, next to `filter_documents_by_extracted_data` (`supabase/migrations/20260226000001_create_judgment_base_extractions_table.sql:501`):

```sql
aggregate_extracted_data(
  p_filters      jsonb    default '{}',   -- same shape as filter_documents_by_extracted_data
  p_text_query   text     default null,
  p_fields       text[]   default null,   -- base/deep/core field paths; null = default set
  p_sample_size  int      default null,   -- null = whole cohort
  p_seed         int      default null,   -- required when p_sample_size is set
  p_top_n        int      default 20      -- values per categorical field; rest folded into "__other__"
) returns jsonb
```

Return shape:

```json
{
  "total": 4312,
  "sample_n": 1000,
  "seed": 42,
  "fields": {
    "base_offender_age_offence": {"kind": "numeric", "buckets": [{"lo": 10, "hi": 15, "count": 12}, ...]},
    "base_convict_offences":     {"kind": "categorical", "values": [{"value": "possession", "count": 812}, ...], "other": 44, "null": 130},
    "decision_date":             {"kind": "year", "values": [{"value": "2019", "count": 301}, ...]},
    "court_name":                {"kind": "categorical", "values": [...]}
  }
}
```

- The cohort is `list_extracted_filter_matches(p_filters, p_text_query)` from #682 (`supabase/migrations/20260920000001_shared_extracted_filter_matches.sql`): the aggregate function selects its ids in a CTE, orders them by `md5(id::text || p_seed::text)`, keeps the first `p_sample_size`, and runs one dynamic per-field aggregate over `judgments WHERE id = ANY(sample)`. No predicate is re-implemented; a Database Contract test asserts `aggregate_extracted_data(...)->>'total'` equals `filter_documents_by_extracted_data(...).total_count` for a fixed set of filter payloads, so the two cannot disagree on the cohort.
- `collection_ids` is rejected by the aggregate endpoint exactly as `/base-schema/filter` rejects it (`results_router.py:475-487`, HTTP 400 `COLLECTION_IDS_NOT_ALLOWED`): the RPC is SECURITY INVOKER and the backend calls it with the service-role client, so honouring the key would let any signed-in caller probe any collection's membership. "Statistics over a saved collection" is therefore a named gap, owned by #685 together with the auth deferral. The spec's earlier "accept a collection" wording in §5.2 is withdrawn.
- Aggregable fields are one allowlist in three places — `frontend/lib/extractions/aggregable-fields.json` (canonical), `backend/app/extraction_domain/aggregate_fields.py`, and the SQL kind dispatch — with a test that the Python set equals the JSON. Free-text fields and extraction metadata are never aggregable.
- Most `base_*` fields are `text[]` columns; categorical aggregation `unnest`s them, so a judgment with two convict offences counts once per offence and the card says "counts are per value, a judgment can appear in more than one bar".
- Sampling is `ORDER BY md5(id::text || p_seed::text) LIMIT p_sample_size` inside a CTE: deterministic, exact-n, no `TABLESAMPLE` (block-level, inexact). Same cohort + same seed = same sample, which is what a methods section needs.
- Field kinds come from `_base_field_to_column` + column type: `text[]`/enum → categorical (arrays are `unnest`ed), numeric → `width_bucket` histogram (reusing the bucket logic in `get_numeric_histogram`), `date` → year, free text → not aggregable (rejected with an error listing aggregable fields).
- Default field set (when `p_fields` is null): `base_offender_age_offence`, `base_offender_gender`, `base_convict_offences`, `base_sentences_received`, `base_appeal_outcome`, `base_did_offender_confess`, `court_name`, `decision_date`.
- `deep_*` 1–5 scores are aggregable and labelled "model score" in the UI (research note §5).
- Grants: the migration runs `REVOKE ALL ON FUNCTION aggregate_extracted_data(...) FROM PUBLIC` **before** `GRANT EXECUTE … TO authenticated, service_role`. Postgres grants EXECUTE to PUBLIC by default, and the neighbouring `get_extracted_facet_counts` grants `anon` explicitly (`…:847`); a grant without the revoke changes nothing. `/search/extractions` is login-gated and stays so while #565 is open.
- Performance target: whole-corpus aggregation of the default 8 fields **≤ 1.5 s p95** on the production instance. Verified with `EXPLAIN ANALYZE` in the PR; if a field is slow, it is dropped from the default set rather than the target relaxed.

Backend: `POST /extractions/base-schema/aggregate` in `backend/app/extraction_domain/results_router.py`, Pydantic request/response models in `backend/app/models.py`, BFF proxy `frontend/app/api/extractions/base-schema/aggregate/route.ts`, client hook `useExtractionAggregate` beside `useExtractionResults` in `frontend/lib/extractions/`.

### 5.2 UI: `/search/extractions?view=stats`

Same page, same filter bar, same NL-filter dialog. A segmented control **List | Statistics** next to the result count switches the body; `view` is a URL param so a statistics view is linkable and lands in search history.

Statistics body, top to bottom:

1. **Cohort line** — "4,312 of 12,907 judgments match · filters: …" with a "Show judgments" link (switches to List with the same filters — the drill-back).
2. **Scale slider** — discrete stops `10 · 50 · 100 · 1,000 · 5,000 · all`; stops larger than the cohort are disabled. Seed shown next to it with a "reshuffle" button (new seed) and the seed persisted in the URL. Below `all`, the cohort line reads "showing a random sample of 1,000 (seed 42)".
3. **Y-axis toggle** — count | % of sample (SAOS pattern; per-1000 omitted, cohorts are small).
4. **Field cards** — one card per field, `HorizontalBarChart` for categorical, histogram for numeric, bar-per-year for dates. Cards reuse `frontend/app/dataset-comparison/_components/{HorizontalBarChart,BivariateBarChart}.tsx`, moved to `frontend/components/charts/` in this phase (dataset-comparison keeps importing them). Each bar links to List with that value added to the filters — every count drills back.
5. **Add field** — picker over the aggregable fields; selection persisted in the URL.
6. **Export** — CSV of the aggregates plus a `cohort.json` (`filters`, `text_query`, `sample_size`, `seed`, `schema_version`, `corpus_total`, generated-at). This is the reproducibility artefact from idea 10, delivered here in its minimal form.

Empty and error states use the editorial primitives already on the page (`ErrorCard`, empty-state block).

### 5.3 Prerequisite fix

`frontend/app/search/extractions/page.tsx:189` links rows to `/judgments/${row.id}`; the route does not exist (APP_STATUS §5d). Change to `/documents/${row.id}`. Ships as its own one-line PR before Phase B; Phase B's drill-back depends on it.

### 5.4 Tests

- SQL: contract test in `backend/tests/db/` calling `aggregate_extracted_data` with a fixed seed twice and asserting identical output; sample_n ≤ cohort; `__other__` + values + null = sample_n for every categorical field; unknown field rejected.
- Backend unit: request validation (seed required with sample_size; field list validated).
- Frontend unit: slider disables stops above cohort size; bar click produces the expected filter delta; export payload contains the cohort definition.
- Route-contract E2E: `/search/extractions?view=stats` renders the cohort line for a logged-in user.

## 6. Phase C — Sample → check → scale wizard (idea 6)

### 6.1 Blockers (separate issues, must close first)

- #546 — OpenAI key has no credits; nothing in this phase can be tested end-to-end without it.
- #507 — verify the extraction pipeline runs at all in this environment (`extraction_jobs` = 0 rows ever).
- Seed `extraction_schemas` with at least the base schema as a template and one small example schema; the schema picker on `/extract` is empty today (APP_STATUS §5c).

### 6.2 Step 1 — `/extract`: source + schema + sample

- Source is a **collection** (as today) **or a cohort** handed over from Explore (`?filters=…&q=…` in the URL; the page shows the cohort line from §5.2 and its count).
- The primary button becomes **"Run on a sample of 10"**. The page draws 10 ids with the same seeded ordering as §5.1 (a `p_sample_size`/`p_seed` pair added to `filter_documents_by_extracted_data`, or the collection's ids shuffled by the same `md5(id||seed)` rule) and calls the existing `POST /extraction/jobs` with `document_ids`. No backend change to job creation.
- The job's metadata records `sample_of: {source, filters|collection_id, seed, n, cohort_total}` so the sample is reproducible and the scale-out step knows its parent.

### 6.3 Step 2 — `/extractions/[id]`: review

- The results table (read-only today) becomes editable per cell. Edits are stored in a new table `extraction_reviews (job_id, document_id, field, model_value, human_value, reviewer_id, reviewed_at)`; the model output is never overwritten. The table ships with RLS enabled, a policy scoping rows to the job owner (`reviewer_id = auth.uid()`), and `REVOKE ALL … FROM anon, PUBLIC` — a `GRANT SELECT` alone narrows nothing on this project (`anon` already holds write grants on 33 of 43 tables — APP_STATUS §4 "Access posture").
- A per-field **agreement badge**: `1 − corrected / reviewed`, shown once ≥ 5 cells in that field have been reviewed. Fields below **80 %** are flagged. *80 % and n = 10 are assumptions — the literature gives no validation N (research note §4); both are constants in one config file so they can change without a migration.*
- "Reviewed by" and timestamps are visible; this is the kappa-lite the ELS workflow expects.

### 6.4 Step 3 — scale out

- A **"Run on …"** control with the same stops as the scale slider (`100 · 1,000 · 5,000 · all`), each showing an estimate: `n × mean tokens per document in the sample job × model price`. Jobs do not record token usage today; the Celery task must persist `usage: {prompt_tokens, completion_tokens, model}` per document and per job (backend change, `backend/app/workers.py` + `extraction_domain/shared.py`).
- The scale-out job carries `parent_job_id`, inherits the cohort definition and seed, and excludes the 10 already-extracted ids (or re-runs them — a checkbox, default exclude).
- Progress: the existing job status polling; the detail page shows done / total and elapsed.
- Result: the Statistics view (§5.2) over the job's results. Aggregating extraction output is a second `aggregate_extraction_job(p_job_id, p_fields, …)` RPC over the job's result JSONB, same return shape, so the same charts render. Fields flagged in §6.3 carry a warning in their card.

### 6.5 Tests

- Sample job stores `sample_of` and re-running with the same seed yields the same `document_ids`.
- Review edit persists to `extraction_reviews`; agreement badge math; flag threshold read from config.
- Cost estimate uses recorded usage; scale-out job links to parent and excludes sampled ids.
- Integration (marked, needs credits): 10-document sample job completes against the seeded example schema.

## 7. Phase D — Case flow (idea 8)

### 7.1 Entry: `/precedents`

Already accepts a fact-pattern description (`frontend/app/precedents/page.tsx:250`) and an optional source `document_id`. The backend (`backend/app/precedents.py`) embeds the query, pulls candidates from pgvector via `db.search_by_vector(match_count = min(limit × 2, 50))`, then an LLM pass (`_analyze_precedents`) ranks and explains them. Two changes:

- the **candidate stage is exposed separately**: the endpoint returns a `cohort` array — the raw top-100 vector candidates (`match_count` raised for this list only) with `id`, `similarity_score` and the base fields needed for grouping, joined from `judgments` — **before** the LLM pass runs. The LLM-ranked `precedents` list stays as it is. The cohort is therefore available even while #546 blocks the LLM step; the page renders the grouped block and shows the analysis section's existing error state.
- a **case number** typed into the same box is detected by pattern, resolved to a judgment, and passed as `document_id` (the existing field) so the current `_fetch_document_context` path builds the query from it.

### 7.2 Grouped results

Above the result list, a **"In similar cases…"** block groups the `cohort` client-side by one base field — default `base_appeal_outcome`, switchable to `base_sentences_received` or `base_convict_offences` — and renders the same `HorizontalBarChart` as Phase B with a headline sentence: *"In 63 of 100 similar cases the appeal was dismissed."* Each bar filters the list below. This is Explore's chart over a similarity cohort instead of a filter cohort. Backend change is limited to the `cohort` field in the response.

### 7.3 Continue

- Select judgments → **"Add to collection"** (existing) and **"Open reasoning lines"** → `/reasoning-lines` filtered to the selection. Depends on `reasoning_lines` being populated (0 rows today); until then the button is hidden, not disabled.
- **"Draft memo"** → `/chat` with the selected judgment ids as context and a fixed prompt template ("For each judgment cite the case number and the passage"). Depends on #546.
- Export: the chat's existing export.

### 7.4 Tests

Grouping is pure: unit test over a fixture of 100 results with nulls and multi-valued fields. Case-number detection unit test (PL and UK patterns). E2E: precedents page renders the grouped block for a logged-in user against a stubbed search response.

## 8. Order and dependencies

```
§5.3 404 fix (1 line)  ─┐
Phase A sidebar          ├─▶ Phase B statistics ─▶ Phase D case flow (grouping reuses B's charts)
                         │
#546, #507, schema seed ─┴─▶ Phase C sample→check→scale (C.3 reuses B's RPC pattern)
```

A and B are independent of the LLM path and ship first. D's grouping block (§7.2) can ship with B; D's reasoning-lines and memo steps wait on data and credits. C ships last.

Each phase becomes one issue linked from #687; B and C are split into backend-then-frontend PRs.

## 9. Non-goals

- Cohort as a dynamic saved object (idea 2): Phase B exports the cohort definition; a stored "cohort with a rule" is a follow-up once `saved_searches` is opened beyond admins.
- Column-at-a-time re-extraction and "ask the table" (idea 5).
- Codebook export and formal kappa (idea 7); Phase C's agreement badge is the minimal form.
- Guest access to statistics; per-1000 normalisation; charts on the public landing page.
- Any change to search ranking, Meilisearch, or the extraction prompts themselves.
- Statistics over a saved collection (blocked on the collection_ids auth deferral; #685).

## 10. Open questions for review

1. Phase A group labels — English shown here; Polish labels proposed: *Zapytaj · Zbadaj · Koduj · Sprawa*.
2. Default field set in §5.1 — eight fields chosen for the "juvenile drug cases" example; confirm or swap.
3. Should the Statistics view be reachable for guests once #565 (rate limiting) lands, or stay behind login permanently?
