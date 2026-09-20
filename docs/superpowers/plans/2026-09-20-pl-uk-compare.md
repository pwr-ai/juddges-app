# PL ↔ UK Live Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One research question (NL or chips) → the same base-schema filter run for PL and UK → side-by-side value distributions with per-jurisdiction coverage, saveable as a paired collection, exportable as long CSV, addressable by permalink.

**Architecture:** The 300-line WHERE clause of `filter_documents_by_extracted_data` moves into one shared plpgsql set-returning function (`list_extracted_filter_matches`) that returns matching `(id, jurisdiction)`; the existing RPC becomes a thin wrapper (signature unchanged) and a new RPC `get_extracted_facet_counts_by_jurisdiction` aggregates one field over that set with `GROUP BY jurisdiction`, returning counts plus `total`/`covered`. A new FastAPI package `app/compare/` turns rows into a `CompareResponse` (tiers, shares, coverage flags live in pure Python so UI and CSV agree), and a `collection_pairs` table plus `/collections/pairs` router persists "PL/UK" pairs. A new Next.js route `/compare` (and `/compare/[pairId]`) renders the response with the existing Plotly `BivariateBarChart`, promoted to `components/charts/`.

**Tech Stack:** Postgres/plpgsql (Supabase), FastAPI + Pydantic v2, supabase-py, pandas (CSV), Next.js 15 App Router, React Query, Plotly via `lib/charts/editorial-plot.ts`, Jest + Testing Library, pytest (`unit` and `db` tiers).

**Spec:** Spec C (scratchpad `specs/spec-C.md`, mirrored below under *Spec summary*). Depends on Spec B (`specs/spec-B.md`) and Spec A AC1 (extraction over a collection). Known data defects: `docs/reference/APP_STATUS_2026-08-21.md` §4.

## Spec summary (Spec C)

1. On `/compare`, a filter (NL or chips) without a jurisdiction runs for PL and UK; page shows N_PL, N_UK and enum/boolean fields (`appeal_outcome`, `offender_gender`, `sentence_serve`, `plea_point`, …) as side-by-side bars with %.
2. A field with coverage < 80 % in either jurisdiction gets a badge "coverage PL x % / UK y %" and is never in the first row; a field at 0 % in one jurisdiction is hidden behind a message, never rendered as "0".
3. "Save as collection pair" creates "<name> — PL" and "<name> — UK" linked by a comparison id; `/collections` shows them as a pair.
4. After an extended-schema extraction over both collections (Spec A), `/compare/{comparison_id}` shows the new fields side by side.
5. "Export" gives long CSV (`field, value, jurisdiction, count, share, coverage`) and a permalink encoding the filter.
6. Regression: static `/dataset-comparison` keeps working; existing facet RPCs keep their signature (new function alongside).

Out of scope: significance tests, PL↔UK topic taxonomy alignment, fixing `case_type`/`court_level`.

## Global Constraints

- Branch `feat/compare-pl-uk` from `origin/main` **after Spec B has merged**; work in `.worktrees/feat-compare-pl-uk` (superpowers:using-git-worktrees). `frontend/node_modules` is absent in a worktree: `ln -s ../../../frontend/node_modules frontend/node_modules` before the first `npx`.
- Commit messages: Conventional Commits, footer `Refs #<C>` where `#<C>` is the issue created from Spec C; also `Refs #537` on tasks touching seed/empty states. No Claude/co-author footers (CLAUDE.md).
- `docs/superpowers/` is gitignored; this plan is not committed.
- Required CI checks must stay green: `Backend Lint`, `Backend Unit Tests`, `Frontend Lint`, `Frontend Unit Tests`, `Frontend E2E Smoke (UI-only)`, `Database Contract`, `Frontend Route Contract (Chromium)`.
- Every new `.rpc("…")` / `.table("…")` call must land in the same PR as its migration (`backend/tests/app/test_db_contract_static.py`).
- New RLS policies use `(SELECT auth.uid())`, never bare `auth.uid()` (`supabase/migrations/20260623000002_optimize_rls_auth_init_plan.sql`).
- Design system: only `@/components/editorial` primitives and `lib/charts/editorial-plot.ts` colours (`editorialSeries.pl = #9A342D`, `editorialSeries.uk = #000000`). No gradients, no rounded cards, no `bg-indigo/purple/violet-*`. Numbers in `font-mono` tabular.
- i18n: every user-visible string on the new pages goes through `t('compare.*')` (`frontend/lib/i18n/types.ts`, `translations/en.ts`, `translations/pl.ts` — all three).
- Coverage threshold constant `LOW_COVERAGE_THRESHOLD = 0.80` exists in exactly one place (`backend/app/compare/layout.py`); the frontend never re-derives tiers.
- Migrations sort after Spec B's: use prefix `20260921` (verify with `ls supabase/migrations | tail -5` before creating).
- Dev commands: backend `cd backend && poetry run pytest -m unit -q`, db tier `DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres poetry run pytest -m db -q` (needs `docker run -d --name db-contract -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg17`), frontend `cd frontend && npx jest <path>`, `npm run validate && npm run typecheck`.
- `rm`/`cp` are interactive aliases on this machine → `command rm -f`, `command cp -f`.

---

## Interface assumed from Spec B (must be true before Task 1)

Spec B lands first. This plan assumes, and Task 1 Step 1 verifies:

| Layer | Assumed contract |
|---|---|
| RPC `filter_documents_by_extracted_data(p_filters JSONB, p_text_query TEXT, p_limit INT, p_offset INT)` | signature unchanged; `p_filters` additionally honours `"jurisdiction": ["PL","UK"]` (`j.jurisdiction = ANY(...)`) and `"decision_date": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}` (`j.decision_date >= from AND j.decision_date <= to`). |
| `backend/app/extraction_domain/nl_filter_generator.py::BaseSchemaFilter` | `jurisdiction: list[Literal["PL","UK"]] \| None`, `decision_date: DateRange \| None`; `to_rpc_payload()` still returns `{"filters": {...}, "text_query": ...}`. |
| `frontend/types/base-schema-filter.ts::BaseSchemaFilters` | `jurisdiction?: ("PL" \| "UK")[]`, `decision_date?: DateRange`. |
| `frontend/lib/extractions/use-extracted-data-filters.ts` | unchanged: `encodeFilters`, `decodeFilters`, `useExtractedDataFilters()` (URL `?f=<base64url json>&q=<text>`). |
| "Save as collection" on `/search/extractions` | uses `POST /collections` + `POST /collections/{id}/documents/batch` (≤ 100 ids/request, `frontend/lib/api/collections.ts::addDocumentsToCollection`, `chunkDocumentIds`). Spec C does **not** reuse that UI; pair creation is server-side (Task 9) so it works for up to 5 000 ids per side in one request. |

If B's migration names its clauses differently, copy B's exact clause text into the shared function in Task 1 — the JSON keys are the contract, not the SQL text.

## Decisions

### Route: new `/compare`, keep `/dataset-comparison`
`/dataset-comparison` is a corpus-level *research artifact* (text lengths, judges, vocabulary — data a live filter cannot produce) linked from the footer, command palette, `docs/reference/sidebar-map.md`, `ROUTES_AUDIT.md`, and pinned by `NAV_LINKED_ROUTES` in `frontend/tests/unit/navigation/route-reachability.test.ts:56-67`. Repurposing it would break AC6 and mix two data regimes. `/compare` is a *query-scoped* tool. The static page gets a one-line "Live comparison →" link (Task 19); a redirect can be decided later, out of scope.

### Shared SQL: one set-returning plpgsql function, not a row predicate
`list_extracted_filter_matches(p_filters JSONB, p_text_query TEXT) RETURNS TABLE (id UUID, jurisdiction TEXT)` receives the whole DECLARE block and WHERE clause verbatim from `20260505000001_extend_base_schema_filterable_searchable.sql:141-449`. `filter_documents_by_extracted_data` becomes `SELECT … FROM list_extracted_filter_matches(...) m JOIN judgments j ON j.id = m.id ORDER BY … LIMIT/OFFSET` — same signature, same rows, same order. The facet RPC joins the same function. A per-row boolean predicate function was rejected: it hides the WHERE from the planner and disables the Tier-1 indexes; an inlinable `LANGUAGE sql` rewrite was rejected because the parsing block is plpgsql and a 300-line rewrite is where regressions would come from. Cost of materialising the id set: the corpus is 12 307 rows (`APP_STATUS_2026-08-21.md` §4), so ≤ 12 307 `(uuid, text)` tuples per call. Exposed as a public RPC because Task 9 (pair creation) needs the id set server-side.

`p_filters` gains one additive key, `"collection_ids": ["<uuid>", …]` → `EXISTS (SELECT 1 FROM collection_judgments cj WHERE cj.collection_id = ANY(v_collection_ids) AND cj.judgment_id = j.id::text)` (`judgment_id` is TEXT: `20260509000003_create_collections_tables.sql:19-20`). This is what lets `/compare/{pairId}` compute base facets over the *actual* collection membership.

### Facet RPC shape
`get_extracted_facet_counts_by_jurisdiction(p_filters JSONB, field_path TEXT, p_text_query TEXT) RETURNS TABLE (jurisdiction TEXT, value TEXT, count BIGINT, total BIGINT, covered BIGINT, coverage NUMERIC)`. `p_text_query` is added to the spec's `(p_filters, field_path)` because the NL dialog splits free text out of `filters` and the comparison must honour it. Totals `LEFT JOIN` values, so a jurisdiction that matched documents but has no filled value yields **one row with `value IS NULL`, `count IS NULL`** carrying `total`/`covered=0` — that is how the backend learns N_PL/N_UK without a second RPC.

### Coverage semantics (precise)
- `total(J)` = number of judgments in jurisdiction J matched by `p_filters`/`p_text_query` (always with `base_extraction_status = 'completed'`, as today).
- `covered(J, field)` = number of those where the column is *filled*: `text[]` → `EXISTS (SELECT 1 FROM unnest(col) e WHERE e IS NOT NULL AND e <> '')`; `text` → `NULLIF(BTRIM(col), '') IS NOT NULL`; `boolean`/numeric/date → `col IS NOT NULL`.
- `coverage(J, field)` = `covered / total`, `NULL` when `total = 0`.
- `share(J, field, value)` = `count / covered(J, field)` — "% of documents where the field is coded". Denominator is `covered`, not `total`, so a coverage gap does not masquerade as a distribution difference; coverage is shown separately (that is AC2's point). CSV carries `count`, `share`, `coverage`, `covered`, `total` so any other ratio is recomputable.
- Tiers (policy, in `backend/app/compare/layout.py`): `unavailable` if `covered = 0` in ≥ 1 jurisdiction (chart hidden, message names the jurisdiction(s) and `0 of total`); `empty` if `total = 0` everywhere; `partial` if `min(coverage) < 0.80` (badge, second section); `primary` otherwise.
- Where the logic lives: **counts in SQL** (only place with rows; one scan; auditable integers), **ratios + tiers in the backend** (pure functions, unit-testable without a DB, shared by JSON response and CSV export so they cannot disagree), **frontend renders flags only**.

### Pairing: `collection_pairs` table, not a column
A `comparison_id` column on `collections` cannot store the originating filter (needed for AC5's permalink and for re-running), needs a second column for the role, and makes "pair" a convention. A row in `collection_pairs (id, user_id, name, filters, text_query, pl_collection_id, uk_collection_id)` has its own identity, `ON DELETE CASCADE` from either collection, `UNIQUE` on each side (a collection belongs to at most one pair), and its own RLS. `GET /collections` adds `pair: {id, role, partner_collection_id} | null` per collection.

`DELETE /collections/pairs/{id}` unlinks only (collections survive); deleting either collection cascades the pair row.

### Jurisdiction key in the compare filter
`/compare` always splits by jurisdiction. If the incoming filter carries `jurisdiction`, the backend strips it and reports `ignored_filter_keys: ["jurisdiction"]`; the UI shows a notice chip. Deterministic, no silent one-sided results.

### Field selection
Comparable = enum (`enum` on the property or on `items.enum`) or `boolean`. Derived from the base JSON Schema (`backend/packages/juddges_search/config/schema/base_legal_schema.json`) via `BaseSchemaExtractor().schema["properties"]` → 17 fields. Order: `appeal_outcome, offender_gender, sentence_serve, plea_point` first (spec), then `x-ui-order`. The same derivation runs on any extension schema (`extraction_schemas.text`) for AC4. Free-text arrays (`keywords`, `convict_offences`) are excluded: PL-only topics and high cardinality make them incomparable (risk section).

### CSV + permalink
CSV: UTF-8 with BOM, `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="compare_<YYYY-MM-DD>.csv"`, `X-Rows-Count` (same as `results_router.py:243-281`). Columns exactly: `field, value, jurisdiction, count, share, coverage, covered, total` — the six from the spec first, two denominators appended. One row per `(field, value, jurisdiction)` for both jurisdictions (count 0 when absent). Permalink: `/compare?f=<encodeFilters(filters)>&q=<text>` (reuses `use-extracted-data-filters.ts:47-73`, so a link is portable to `/search/extractions?f=…&q=…`); pairs: `/compare/<pairId>`.

## File structure

```
supabase/migrations/
  20260921000001_shared_extracted_filter_matches.sql     # Task 1
  20260921000002_facet_counts_by_jurisdiction.sql        # Task 2
  20260921000003_create_collection_pairs.sql             # Task 3
backend/app/compare/
  __init__.py
  models.py        # Pydantic response models                          Task 4
  layout.py        # LOW_COVERAGE_THRESHOLD, share, tier, build_field  Task 4
  fields.py        # FieldSpec, base_compare_fields, from_schema       Task 5
  service.py       # CompareService (RPC → CompareResponse)            Task 6
  router.py        # POST /compare/facets, /compare/export, GET pairs  Tasks 7, 8, 11
  csv_export.py    # to_csv_rows, csv_bytes                            Task 8
  schema_tally.py  # extension-schema tally from extraction_jobs.results  Task 11
backend/packages/juddges_search/juddges_search/db/collection_pairs_db.py   Task 9
backend/app/collection_pairs.py   # /collections/pairs router           Task 9
backend/app/collections.py        # + pair field on list                Task 10
backend/app/server.py             # router registration                 Tasks 7, 9
backend/tests/db/test_compare_rpcs_contract.py                          Tasks 1, 2
backend/tests/db/test_migration_chain.py, test_rls_isolation.py         Tasks 2, 3
backend/tests/app/test_compare_layout.py, test_compare_fields.py,
  test_compare_service.py, test_compare_router.py, test_compare_csv.py,
  test_collection_pairs_router.py, test_collections_pair_field.py,
  test_compare_pair_view.py
frontend/components/charts/BivariateBarChart.tsx                        Task 12
frontend/app/dataset-comparison/_components/BivariateBarChart.tsx        (re-export)
frontend/lib/compare/{types.ts,api.ts,chart-data.ts,permalink.ts}      Task 13
frontend/lib/extractions/drawer-adapter.ts                              Task 16
frontend/app/api/compare/facets/route.ts, export/route.ts,
  pairs/[pairId]/route.ts; frontend/app/api/collections/pairs/route.ts,
  pairs/[pairId]/route.ts                                               Task 14
frontend/lib/i18n/{types.ts,translations/en.ts,translations/pl.ts}      Task 15
frontend/app/compare/page.tsx, _components/*, [pairId]/page.tsx         Tasks 16–18
frontend/app/collections/page.tsx, components/app-sidebar.tsx,
  components/command-palette.tsx, app/dataset-comparison/page.tsx       Task 19
docs/how-to/compare-pl-uk.md, docs/reference/sidebar-map.md,
  docs/api/API_REFERENCE.md                                             Task 20
```

---

### Task 1: Shared filter function + thin wrapper (migration 1)

**Files:**
- Create: `supabase/migrations/20260921000001_shared_extracted_filter_matches.sql`
- Create: `backend/tests/db/test_compare_rpcs_contract.py`
- Reference (copy from): `supabase/migrations/20260505000001_extend_base_schema_filterable_searchable.sql:141-449` and Spec B's migration.

**Interfaces:**
- Produces RPC `public.list_extracted_filter_matches(p_filters JSONB DEFAULT '{}', p_text_query TEXT DEFAULT NULL) RETURNS TABLE (id UUID, jurisdiction TEXT)` — every key of `p_filters` accepted today (+ B's `jurisdiction`, `decision_date`) plus `collection_ids: string[]`.
- Keeps RPC `public.filter_documents_by_extracted_data(p_filters, p_text_query, p_limit, p_offset)` byte-compatible in signature and result columns.

- [ ] **Step 1: Verify Spec B has landed and pick the migration prefix**

```bash
cd /home/laugustyniak/github/legal-ai/juddges-project/juddges-app
git log --oneline -5 origin/main
ls supabase/migrations | tail -5
grep -ln "'jurisdiction'" supabase/migrations/*.sql | tail -2
```
Expected: the newest migration defines `filter_documents_by_extracted_data` with `p_filters -> 'jurisdiction'` and `p_filters -> 'decision_date'`. Note that file name as `<B_MIGRATION>`; our files must sort after it.

- [ ] **Step 2: Write the failing db-tier test**

`backend/tests/db/test_compare_rpcs_contract.py`:

```python
"""Compare RPCs: shared filter set, per-jurisdiction facets (Spec C).

`filter_documents_by_extracted_data` and the new facet RPC must agree on which
rows match, so both are asserted against the same seeded judgments. Seeds are
isolated by a per-test keyword token because the scratch database is shared by
the whole `db` tier.
"""

from __future__ import annotations

import json
import uuid

import pytest

pytestmark = pytest.mark.db


def _exec(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


def _seed_judgment(conn, token: str, jurisdiction: str, **base) -> str:
    """Insert one completed-extraction judgment tagged with `token` in keywords."""
    jid = str(uuid.uuid4())
    columns = ["id", "case_number", "jurisdiction", "full_text",
               "base_extraction_status", "base_keywords"]
    values: list = [jid, f"CMP/{jid[:8]}", jurisdiction, "text", "completed", [token]]
    for col, val in base.items():
        columns.append(f"base_{col}")
        values.append(val)
    placeholders = ", ".join(["%s"] * len(values))
    _exec(conn,
          f"INSERT INTO public.judgments ({', '.join(columns)}) VALUES ({placeholders})",
          tuple(values))
    return jid


@pytest.fixture
def corpus(conn):
    """2 PL + 2 UK judgments; one PL row has no appeal_outcome (coverage 1/2)."""
    token = f"cmp-{uuid.uuid4()}"
    ids = {
        "pl_a": _seed_judgment(conn, token, "PL",
                               appeal_outcome=["outcome_dismissed_or_refused"],
                               did_offender_confess=True, plea_point="before_trial"),
        "pl_b": _seed_judgment(conn, token, "PL",
                               appeal_outcome=None, did_offender_confess=False),
        "uk_a": _seed_judgment(conn, token, "UK",
                               appeal_outcome=["outcome_conviction_quashed",
                                               "outcome_other"],
                               did_offender_confess=True),
        "uk_b": _seed_judgment(conn, token, "UK",
                               appeal_outcome=["outcome_dismissed_or_refused"],
                               did_offender_confess=None, plea_point=""),
    }
    return token, ids


def _matches(conn, filters: dict, text_query: str | None = None) -> set[tuple[str, str]]:
    rows = _exec(
        conn,
        "SELECT id::text, jurisdiction FROM public.list_extracted_filter_matches(%s::jsonb, %s)",
        (json.dumps(filters), text_query),
    )
    return {(r[0], r[1]) for r in rows}


def test_shared_function_returns_id_and_jurisdiction_for_every_match(conn, corpus):
    token, ids = corpus
    got = _matches(conn, {"keywords": [token]})
    assert got == {(ids["pl_a"], "PL"), (ids["pl_b"], "PL"),
                   (ids["uk_a"], "UK"), (ids["uk_b"], "UK")}


def test_shared_function_applies_existing_enum_filters(conn, corpus):
    token, ids = corpus
    got = _matches(conn, {"keywords": [token],
                          "appeal_outcome": ["outcome_dismissed_or_refused"]})
    assert {g[0] for g in got} == {ids["pl_a"], ids["uk_b"]}


def test_shared_function_honours_spec_b_jurisdiction_key(conn, corpus):
    token, ids = corpus
    got = _matches(conn, {"keywords": [token], "jurisdiction": ["UK"]})
    assert {g[0] for g in got} == {ids["uk_a"], ids["uk_b"]}


def test_wrapper_returns_the_same_rows_as_the_shared_function(conn, corpus):
    """The refactor must be behaviour-preserving: same ids, same total_count."""
    token, ids = corpus
    shared = {g[0] for g in _matches(conn, {"keywords": [token]})}
    rows = _exec(
        conn,
        "SELECT id::text, jurisdiction, total_count FROM "
        "public.filter_documents_by_extracted_data(%s::jsonb, NULL, 50, 0)",
        (json.dumps({"keywords": [token]}),),
    )
    assert {r[0] for r in rows} == shared
    assert {r[2] for r in rows} == {4}


def test_wrapper_pagination_and_order_are_unchanged(conn, corpus):
    token, _ = corpus
    page1 = _exec(conn,
                  "SELECT id::text FROM public.filter_documents_by_extracted_data(%s::jsonb, NULL, 3, 0)",
                  (json.dumps({"keywords": [token]}),))
    page2 = _exec(conn,
                  "SELECT id::text FROM public.filter_documents_by_extracted_data(%s::jsonb, NULL, 3, 3)",
                  (json.dumps({"keywords": [token]}),))
    assert len(page1) == 3 and len(page2) == 1
    assert not ({r[0] for r in page1} & {r[0] for r in page2})


def test_collection_ids_key_restricts_to_membership(conn, corpus, make_user):
    token, ids = corpus
    user = make_user(str(uuid.uuid4()))
    cid = str(uuid.uuid4())
    _exec(conn, "INSERT INTO public.collections (id, user_id, name) VALUES (%s, %s, 'c')",
          (cid, user))
    _exec(conn, "INSERT INTO public.collection_judgments (collection_id, judgment_id) VALUES (%s, %s)",
          (cid, ids["pl_a"]))
    got = _matches(conn, {"keywords": [token], "collection_ids": [cid]})
    assert got == {(ids["pl_a"], "PL")}
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  poetry run pytest tests/db/test_compare_rpcs_contract.py -q -m db -k "shared_function or wrapper or collection_ids"
```
Expected: FAIL — `function public.list_extracted_filter_matches(jsonb, unknown) does not exist`.

- [ ] **Step 4: Write the migration**

`supabase/migrations/20260921000001_shared_extracted_filter_matches.sql`. The DECLARE block and WHERE clause are **copied verbatim** from the current (post-Spec-B) `filter_documents_by_extracted_data`; the only additions are marked `-- Spec C`. The wrapper is rewritten around the shared function.

```sql
-- =============================================================================
-- Migration: shared base-schema filter set + thin wrapper (Spec C, Refs #<C>)
-- =============================================================================
-- `filter_documents_by_extracted_data` carried a ~300-line WHERE clause that the
-- PL/UK comparison also needs. It moves, verbatim, into
-- `list_extracted_filter_matches`, which returns the matching (id, jurisdiction)
-- set; the original RPC becomes a wrapper with an unchanged signature and result
-- shape. New in p_filters: `collection_ids` (restrict to collection membership).
-- The corpus is ~12k rows, so materialising the id set per call is cheap.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_extracted_filter_matches(
    p_filters JSONB DEFAULT '{}'::jsonb,
    p_text_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    jurisdiction TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    -- === BEGIN verbatim copy of the DECLARE block of
    -- === filter_documents_by_extracted_data (20260505000001:158-260 + Spec B)
    v_appellant TEXT[] := public._jsonb_to_text_array(p_filters -> 'appellant');
    v_appeal_against TEXT[] := public._jsonb_to_text_array(p_filters -> 'appeal_against');
    v_appeal_outcome TEXT[] := public._jsonb_to_text_array(p_filters -> 'appeal_outcome');
    v_plea_point TEXT[] := public._jsonb_to_text_array(p_filters -> 'plea_point');
    v_remand_decision TEXT[] := public._jsonb_to_text_array(p_filters -> 'remand_decision');
    v_sentence_serve TEXT[] := public._jsonb_to_text_array(p_filters -> 'sentence_serve');
    v_offender_gender TEXT[] := public._jsonb_to_text_array(p_filters -> 'offender_gender');
    v_offender_intox_offence TEXT[] := public._jsonb_to_text_array(p_filters -> 'offender_intox_offence');
    v_victim_gender TEXT[] := public._jsonb_to_text_array(p_filters -> 'victim_gender');
    v_victim_intox_offence TEXT[] := public._jsonb_to_text_array(p_filters -> 'victim_intox_offence');
    v_victim_type TEXT[] := public._jsonb_to_text_array(p_filters -> 'victim_type');
    v_pre_sent_report TEXT[] := public._jsonb_to_text_array(p_filters -> 'pre_sent_report');
    v_offender_job_offence TEXT[] := public._jsonb_to_text_array(p_filters -> 'offender_job_offence');
    v_offender_home_offence TEXT[] := public._jsonb_to_text_array(p_filters -> 'offender_home_offence');
    v_offender_victim_relationship TEXT[] := public._jsonb_to_text_array(p_filters -> 'offender_victim_relationship');
    v_keywords TEXT[] := public._jsonb_to_text_array(p_filters -> 'keywords');
    v_convict_offences TEXT[] := public._jsonb_to_text_array(p_filters -> 'convict_offences');
    v_acquit_offences TEXT[] := public._jsonb_to_text_array(p_filters -> 'acquit_offences');
    v_appeal_ground TEXT[] := public._jsonb_to_text_array(p_filters -> 'appeal_ground');
    v_sentences_received TEXT[] := public._jsonb_to_text_array(p_filters -> 'sentences_received');
    v_what_ancilliary_orders TEXT[] := public._jsonb_to_text_array(p_filters -> 'what_ancilliary_orders');
    v_pros_evid_type_trial TEXT[] := public._jsonb_to_text_array(p_filters -> 'pros_evid_type_trial');
    v_def_evid_type_trial TEXT[] := public._jsonb_to_text_array(p_filters -> 'def_evid_type_trial');
    v_agg_fact_sent TEXT[] := public._jsonb_to_text_array(p_filters -> 'agg_fact_sent');
    v_mit_fact_sent TEXT[] := public._jsonb_to_text_array(p_filters -> 'mit_fact_sent');
    v_sent_guide_which TEXT[] := public._jsonb_to_text_array(p_filters -> 'sent_guide_which');
    v_reason_quash_conv TEXT[] := public._jsonb_to_text_array(p_filters -> 'reason_quash_conv');
    v_reason_sent_excessive TEXT[] := public._jsonb_to_text_array(p_filters -> 'reason_sent_excessive');
    v_reason_sent_lenient TEXT[] := public._jsonb_to_text_array(p_filters -> 'reason_sent_lenient');
    v_reason_dismiss TEXT[] := public._jsonb_to_text_array(p_filters -> 'reason_dismiss');
    v_convict_plea_dates TEXT[] := public._jsonb_to_text_array(p_filters -> 'convict_plea_dates');
    v_did_offender_confess BOOLEAN := NULL;
    v_vic_impact_statement BOOLEAN := NULL;
    v_num_victims_eq NUMERIC := NULL;  v_num_victims_min NUMERIC := NULL;  v_num_victims_max NUMERIC := NULL;
    v_case_number_eq NUMERIC := NULL;  v_case_number_min NUMERIC := NULL;  v_case_number_max NUMERIC := NULL;
    v_victim_age_eq NUMERIC := NULL;   v_victim_age_min NUMERIC := NULL;   v_victim_age_max NUMERIC := NULL;
    v_co_def_acc_num_eq NUMERIC := NULL; v_co_def_acc_num_min NUMERIC := NULL; v_co_def_acc_num_max NUMERIC := NULL;
    v_date_eq DATE := NULL; v_date_from DATE := NULL; v_date_to DATE := NULL;
    v_case_name_like TEXT := NULL;
    v_neutral_citation_like TEXT := NULL;
    v_judges_like TEXT := NULL;
    v_offender_rep_like TEXT := NULL;
    -- Spec B (copy B's exact declarations if they differ):
    v_jurisdiction TEXT[] := public._jsonb_to_text_array(p_filters -> 'jurisdiction');
    v_decision_from DATE := NULL;
    v_decision_to DATE := NULL;
    -- === END verbatim copy
    -- Spec C: restrict to collection membership (collection_judgments.judgment_id is TEXT)
    v_collection_ids UUID[] := (
        SELECT array_agg(x::uuid)
        FROM unnest(public._jsonb_to_text_array(p_filters -> 'collection_ids')) AS x
    );
BEGIN
    -- === BEGIN verbatim copy of the parsing block (20260505000001:261-338 + Spec B)
    IF p_filters ? 'did_offender_confess' THEN
        v_did_offender_confess := (p_filters ->> 'did_offender_confess')::BOOLEAN;
    END IF;
    IF p_filters ? 'vic_impact_statement' THEN
        v_vic_impact_statement := (p_filters ->> 'vic_impact_statement')::BOOLEAN;
    END IF;
    IF p_filters ? 'num_victims' THEN
        IF jsonb_typeof(p_filters -> 'num_victims') = 'object' THEN
            IF (p_filters -> 'num_victims') ? 'min' THEN v_num_victims_min := (p_filters -> 'num_victims' ->> 'min')::NUMERIC; END IF;
            IF (p_filters -> 'num_victims') ? 'max' THEN v_num_victims_max := (p_filters -> 'num_victims' ->> 'max')::NUMERIC; END IF;
        ELSE
            v_num_victims_eq := (p_filters ->> 'num_victims')::NUMERIC;
        END IF;
    END IF;
    IF p_filters ? 'case_number' THEN
        IF jsonb_typeof(p_filters -> 'case_number') = 'object' THEN
            IF (p_filters -> 'case_number') ? 'min' THEN v_case_number_min := (p_filters -> 'case_number' ->> 'min')::NUMERIC; END IF;
            IF (p_filters -> 'case_number') ? 'max' THEN v_case_number_max := (p_filters -> 'case_number' ->> 'max')::NUMERIC; END IF;
        ELSE
            v_case_number_eq := (p_filters ->> 'case_number')::NUMERIC;
        END IF;
    END IF;
    IF p_filters ? 'victim_age_offence' THEN
        IF jsonb_typeof(p_filters -> 'victim_age_offence') = 'object' THEN
            IF (p_filters -> 'victim_age_offence') ? 'min' THEN v_victim_age_min := (p_filters -> 'victim_age_offence' ->> 'min')::NUMERIC; END IF;
            IF (p_filters -> 'victim_age_offence') ? 'max' THEN v_victim_age_max := (p_filters -> 'victim_age_offence' ->> 'max')::NUMERIC; END IF;
        ELSE
            v_victim_age_eq := (p_filters ->> 'victim_age_offence')::NUMERIC;
        END IF;
    END IF;
    IF p_filters ? 'co_def_acc_num' THEN
        IF jsonb_typeof(p_filters -> 'co_def_acc_num') = 'object' THEN
            IF (p_filters -> 'co_def_acc_num') ? 'min' THEN v_co_def_acc_num_min := (p_filters -> 'co_def_acc_num' ->> 'min')::NUMERIC; END IF;
            IF (p_filters -> 'co_def_acc_num') ? 'max' THEN v_co_def_acc_num_max := (p_filters -> 'co_def_acc_num' ->> 'max')::NUMERIC; END IF;
        ELSE
            v_co_def_acc_num_eq := (p_filters ->> 'co_def_acc_num')::NUMERIC;
        END IF;
    END IF;
    IF p_filters ? 'date_of_appeal_court_judgment' THEN
        IF jsonb_typeof(p_filters -> 'date_of_appeal_court_judgment') = 'object' THEN
            IF (p_filters -> 'date_of_appeal_court_judgment') ? 'from' THEN
                v_date_from := (p_filters -> 'date_of_appeal_court_judgment' ->> 'from')::DATE;
            ELSIF (p_filters -> 'date_of_appeal_court_judgment') ? 'min' THEN
                v_date_from := (p_filters -> 'date_of_appeal_court_judgment' ->> 'min')::DATE;
            END IF;
            IF (p_filters -> 'date_of_appeal_court_judgment') ? 'to' THEN
                v_date_to := (p_filters -> 'date_of_appeal_court_judgment' ->> 'to')::DATE;
            ELSIF (p_filters -> 'date_of_appeal_court_judgment') ? 'max' THEN
                v_date_to := (p_filters -> 'date_of_appeal_court_judgment' ->> 'max')::DATE;
            END IF;
        ELSE
            v_date_eq := (p_filters ->> 'date_of_appeal_court_judgment')::DATE;
        END IF;
    END IF;
    IF p_filters ? 'case_name' THEN v_case_name_like := NULLIF(TRIM(p_filters ->> 'case_name'), ''); END IF;
    IF p_filters ? 'neutral_citation_number' THEN v_neutral_citation_like := NULLIF(TRIM(p_filters ->> 'neutral_citation_number'), ''); END IF;
    IF p_filters ? 'appeal_court_judges_names' THEN v_judges_like := NULLIF(TRIM(p_filters ->> 'appeal_court_judges_names'), ''); END IF;
    IF p_filters ? 'offender_representative_name' THEN v_offender_rep_like := NULLIF(TRIM(p_filters ->> 'offender_representative_name'), ''); END IF;
    -- Spec B (copy B's exact parsing if it differs):
    IF p_filters ? 'decision_date' AND jsonb_typeof(p_filters -> 'decision_date') = 'object' THEN
        IF (p_filters -> 'decision_date') ? 'from' THEN v_decision_from := (p_filters -> 'decision_date' ->> 'from')::DATE; END IF;
        IF (p_filters -> 'decision_date') ? 'to' THEN v_decision_to := (p_filters -> 'decision_date' ->> 'to')::DATE; END IF;
    END IF;
    -- === END verbatim copy

    RETURN QUERY
    SELECT j.id, j.jurisdiction
    FROM public.judgments j
    WHERE
        j.base_extraction_status = 'completed'
        -- === BEGIN verbatim copy of the WHERE predicates (20260505000001:350-438 + Spec B)
        AND (v_appellant IS NULL OR j.base_appellant = ANY(v_appellant))
        AND (v_appeal_against IS NULL OR j.base_appeal_against && v_appeal_against)
        AND (v_appeal_outcome IS NULL OR j.base_appeal_outcome && v_appeal_outcome)
        AND (v_plea_point IS NULL OR j.base_plea_point = ANY(v_plea_point))
        AND (v_remand_decision IS NULL OR j.base_remand_decision = ANY(v_remand_decision))
        AND (v_sentence_serve IS NULL OR j.base_sentence_serve && v_sentence_serve)
        AND (v_offender_gender IS NULL OR j.base_offender_gender && v_offender_gender)
        AND (v_offender_intox_offence IS NULL OR j.base_offender_intox_offence && v_offender_intox_offence)
        AND (v_victim_gender IS NULL OR j.base_victim_gender && v_victim_gender)
        AND (v_victim_intox_offence IS NULL OR j.base_victim_intox_offence && v_victim_intox_offence)
        AND (v_victim_type IS NULL OR j.base_victim_type = ANY(v_victim_type))
        AND (v_pre_sent_report IS NULL OR j.base_pre_sent_report = ANY(v_pre_sent_report))
        AND (v_offender_job_offence IS NULL OR j.base_offender_job_offence = ANY(v_offender_job_offence))
        AND (v_offender_home_offence IS NULL OR j.base_offender_home_offence = ANY(v_offender_home_offence))
        AND (v_offender_victim_relationship IS NULL OR j.base_offender_victim_relationship = ANY(v_offender_victim_relationship))
        AND (v_did_offender_confess IS NULL OR j.base_did_offender_confess = v_did_offender_confess)
        AND (v_vic_impact_statement IS NULL OR j.base_vic_impact_statement = v_vic_impact_statement)
        AND (v_keywords IS NULL OR j.base_keywords && v_keywords)
        AND (v_convict_offences IS NULL OR j.base_convict_offences && v_convict_offences)
        AND (v_acquit_offences IS NULL OR j.base_acquit_offences && v_acquit_offences)
        AND (v_appeal_ground IS NULL OR j.base_appeal_ground && v_appeal_ground)
        AND (v_sentences_received IS NULL OR j.base_sentences_received && v_sentences_received)
        AND (v_what_ancilliary_orders IS NULL OR j.base_what_ancilliary_orders && v_what_ancilliary_orders)
        AND (v_pros_evid_type_trial IS NULL OR j.base_pros_evid_type_trial && v_pros_evid_type_trial)
        AND (v_def_evid_type_trial IS NULL OR j.base_def_evid_type_trial && v_def_evid_type_trial)
        AND (v_agg_fact_sent IS NULL OR j.base_agg_fact_sent && v_agg_fact_sent)
        AND (v_mit_fact_sent IS NULL OR j.base_mit_fact_sent && v_mit_fact_sent)
        AND (v_sent_guide_which IS NULL OR j.base_sent_guide_which && v_sent_guide_which)
        AND (v_reason_quash_conv IS NULL OR j.base_reason_quash_conv && v_reason_quash_conv)
        AND (v_reason_sent_excessive IS NULL OR j.base_reason_sent_excessive && v_reason_sent_excessive)
        AND (v_reason_sent_lenient IS NULL OR j.base_reason_sent_lenient && v_reason_sent_lenient)
        AND (v_reason_dismiss IS NULL OR j.base_reason_dismiss && v_reason_dismiss)
        AND (v_convict_plea_dates IS NULL OR j.base_convict_plea_dates && v_convict_plea_dates)
        AND ((v_num_victims_eq IS NULL OR j.base_num_victims = v_num_victims_eq)
             AND (v_num_victims_min IS NULL OR j.base_num_victims >= v_num_victims_min)
             AND (v_num_victims_max IS NULL OR j.base_num_victims <= v_num_victims_max))
        AND ((v_case_number_eq IS NULL OR j.base_case_number = v_case_number_eq)
             AND (v_case_number_min IS NULL OR j.base_case_number >= v_case_number_min)
             AND (v_case_number_max IS NULL OR j.base_case_number <= v_case_number_max))
        AND ((v_victim_age_eq IS NULL OR j.base_victim_age_offence = v_victim_age_eq)
             AND (v_victim_age_min IS NULL OR j.base_victim_age_offence >= v_victim_age_min)
             AND (v_victim_age_max IS NULL OR j.base_victim_age_offence <= v_victim_age_max))
        AND ((v_co_def_acc_num_eq IS NULL OR j.base_co_def_acc_num = v_co_def_acc_num_eq)
             AND (v_co_def_acc_num_min IS NULL OR j.base_co_def_acc_num >= v_co_def_acc_num_min)
             AND (v_co_def_acc_num_max IS NULL OR j.base_co_def_acc_num <= v_co_def_acc_num_max))
        AND ((v_date_eq IS NULL OR j.base_date_of_appeal_court_judgment = v_date_eq)
             AND (v_date_from IS NULL OR j.base_date_of_appeal_court_judgment >= v_date_from)
             AND (v_date_to IS NULL OR j.base_date_of_appeal_court_judgment <= v_date_to))
        AND (v_case_name_like IS NULL OR j.base_case_name ILIKE '%' || v_case_name_like || '%')
        AND (v_neutral_citation_like IS NULL OR j.base_neutral_citation_number ILIKE '%' || v_neutral_citation_like || '%')
        AND (v_judges_like IS NULL OR j.base_appeal_court_judges_names ILIKE '%' || v_judges_like || '%')
        AND (v_offender_rep_like IS NULL OR j.base_offender_representative_name ILIKE '%' || v_offender_rep_like || '%')
        AND (p_text_query IS NULL OR TRIM(p_text_query) = '' OR
             j.base_search_tsv @@ websearch_to_tsquery('simple', p_text_query))
        -- Spec B:
        AND (v_jurisdiction IS NULL OR j.jurisdiction = ANY(v_jurisdiction))
        AND (v_decision_from IS NULL OR j.decision_date >= v_decision_from)
        AND (v_decision_to IS NULL OR j.decision_date <= v_decision_to)
        -- === END verbatim copy
        -- Spec C:
        AND (v_collection_ids IS NULL OR EXISTS (
            SELECT 1 FROM public.collection_judgments cj
            WHERE cj.collection_id = ANY(v_collection_ids)
              AND cj.judgment_id = j.id::text
        ));
END;
$$;

-- Thin wrapper: identical signature and result columns; same ORDER BY.
CREATE OR REPLACE FUNCTION public.filter_documents_by_extracted_data(
    p_filters JSONB DEFAULT '{}'::jsonb,
    p_text_query TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    case_number TEXT,
    title TEXT,
    jurisdiction TEXT,
    decision_date DATE,
    extracted_data JSONB,
    total_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.id,
        j.case_number,
        j.title,
        j.jurisdiction,
        j.decision_date,
        COALESCE(j.base_raw_extraction, '{}'::jsonb) AS extracted_data,
        COUNT(*) OVER()::BIGINT AS total_count
    FROM public.list_extracted_filter_matches(p_filters, p_text_query) m
    JOIN public.judgments j ON j.id = m.id
    ORDER BY j.decision_date DESC NULLS LAST, j.id
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_extracted_filter_matches(JSONB, TEXT)
    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.filter_documents_by_extracted_data(JSONB, TEXT, INT, INT)
    TO anon, authenticated, service_role;
```

Before saving, `diff` the three "verbatim" regions against `<B_MIGRATION>` (`sed -n` the ranges) — any drift is a bug in this task, not in B.

- [ ] **Step 5: Run the db tier**

```bash
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  poetry run pytest tests/db -q -m db
```
Expected: all of `test_compare_rpcs_contract.py` selected in Step 3 PASS; `test_migration_chain.py` still PASS (chain applies).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260921000001_shared_extracted_filter_matches.sql backend/tests/db/test_compare_rpcs_contract.py
git commit -m "feat(db): shared list_extracted_filter_matches; filter RPC becomes a wrapper

Refs #<C>"
```

---

### Task 2: Facet counts by jurisdiction RPC (migration 2)

**Files:**
- Create: `supabase/migrations/20260921000002_facet_counts_by_jurisdiction.sql`
- Modify: `backend/tests/db/test_compare_rpcs_contract.py` (append)
- Modify: `backend/tests/db/test_migration_chain.py:90-115` (`EXPECTED_RPC_ARGS`)

**Interfaces:**
- Consumes: `public.list_extracted_filter_matches(JSONB, TEXT)` (Task 1), `public._base_field_to_column(TEXT)` (`20260226000001:437`).
- Produces RPC `public.get_extracted_facet_counts_by_jurisdiction(p_filters JSONB, field_path TEXT, p_text_query TEXT) RETURNS TABLE (jurisdiction TEXT, value TEXT, count BIGINT, total BIGINT, covered BIGINT, coverage NUMERIC)`. Rows with `value IS NULL` are per-jurisdiction summary rows (no filled value in that jurisdiction).

- [ ] **Step 1: Append failing tests**

Append to `backend/tests/db/test_compare_rpcs_contract.py`:

```python
def _facets(conn, filters: dict, field: str, text_query: str | None = None):
    rows = _exec(
        conn,
        "SELECT jurisdiction, value, count, total, covered, coverage "
        "FROM public.get_extracted_facet_counts_by_jurisdiction(%s::jsonb, %s, %s) "
        "ORDER BY jurisdiction, value NULLS LAST",
        (json.dumps(filters), field, text_query),
    )
    return [tuple(r) for r in rows]


def test_array_field_counts_each_element_per_jurisdiction(conn, corpus):
    token, _ = corpus
    rows = _facets(conn, {"keywords": [token]}, "appeal_outcome")
    by = {(r[0], r[1]): r for r in rows}
    # PL: pl_a has one value, pl_b has NULL -> total 2, covered 1
    assert by[("PL", "outcome_dismissed_or_refused")][2:5] == (1, 2, 1)
    assert float(by[("PL", "outcome_dismissed_or_refused")][5]) == 0.5
    # UK: uk_a two elements, uk_b one -> counts 1/1/1, total 2, covered 2
    assert by[("UK", "outcome_conviction_quashed")][2:5] == (1, 2, 2)
    assert by[("UK", "outcome_other")][2:5] == (1, 2, 2)
    assert by[("UK", "outcome_dismissed_or_refused")][2:5] == (1, 2, 2)
    assert float(by[("UK", "outcome_other")][5]) == 1.0


def test_boolean_field_values_are_text_true_false(conn, corpus):
    token, _ = corpus
    rows = _facets(conn, {"keywords": [token]}, "did_offender_confess")
    values = {(r[0], r[1]): r[2] for r in rows}
    assert values[("PL", "true")] == 1 and values[("PL", "false")] == 1
    assert values[("UK", "true")] == 1
    assert ("UK", "false") not in values
    uk = next(r for r in rows if r[0] == "UK")
    assert uk[3:5] == (2, 1)  # total 2, covered 1 (uk_b is NULL)


def test_scalar_text_field_treats_empty_string_as_not_covered(conn, corpus):
    token, _ = corpus
    rows = _facets(conn, {"keywords": [token]}, "plea_point")
    pl = [r for r in rows if r[0] == "PL"]
    uk = [r for r in rows if r[0] == "UK"]
    assert pl == [("PL", "before_trial", 1, 2, 1, pl[0][5])]
    # UK has no filled plea_point (one NULL, one ''): a single summary row
    assert len(uk) == 1
    assert uk[0][1] is None and uk[0][2] is None
    assert uk[0][3:5] == (2, 0)
    assert float(uk[0][5]) == 0.0


def test_jurisdiction_with_no_matches_yields_no_rows(conn, corpus):
    token, _ = corpus
    rows = _facets(conn, {"keywords": [token], "jurisdiction": ["PL"]}, "appeal_outcome")
    assert {r[0] for r in rows} == {"PL"}


def test_unknown_field_raises(conn, corpus):
    token, _ = corpus
    with pytest.raises(Exception, match="Unknown extracted field"):
        _facets(conn, {"keywords": [token]}, "no_such_field")
```

And in `backend/tests/db/test_migration_chain.py`, inside `EXPECTED_RPC_ARGS` (after the `create_document_version` entry):

```python
    # backend/app/compare/service.py, backend/app/collection_pairs.py
    "list_extracted_filter_matches": ["p_filters", "p_text_query"],
    # backend/app/compare/service.py
    "get_extracted_facet_counts_by_jurisdiction": [
        "p_filters",
        "field_path",
        "p_text_query",
    ],
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  poetry run pytest tests/db/test_compare_rpcs_contract.py tests/db/test_migration_chain.py -q -m db -k "facet or boolean or scalar_text or no_matches or unknown_field or rpc_exists"
```
Expected: FAIL — function does not exist / `get_extracted_facet_counts_by_jurisdiction does not exist after the migrations`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260921000002_facet_counts_by_jurisdiction.sql`:

```sql
-- =============================================================================
-- Migration: per-jurisdiction facet counts with coverage (Spec C, Refs #<C>)
-- =============================================================================
-- Sibling of get_extracted_facet_counts(field_path), which stays untouched.
-- Filters via list_extracted_filter_matches; groups by judgments.jurisdiction.
--
-- Coverage semantics:
--   total   = matched judgments in the jurisdiction
--   covered = those whose column is "filled":
--             text[]  -> at least one element that is NOT NULL and <> ''
--             text    -> NULLIF(BTRIM(col), '') IS NOT NULL
--             other   -> col IS NOT NULL
--   coverage = covered / total (NULL when total = 0)
-- A jurisdiction with total > 0 and covered = 0 yields ONE row with
-- value IS NULL and count IS NULL (LEFT JOIN) so callers still learn `total`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_extracted_facet_counts_by_jurisdiction(
    p_filters JSONB DEFAULT '{}'::jsonb,
    field_path TEXT DEFAULT NULL,
    p_text_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    jurisdiction TEXT,
    value TEXT,
    count BIGINT,
    total BIGINT,
    covered BIGINT,
    coverage NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_column TEXT;
    v_udt_name TEXT;
    v_filled_sql TEXT;
    v_values_sql TEXT;
BEGIN
    v_column := public._base_field_to_column(field_path);
    IF v_column IS NULL THEN
        RAISE EXCEPTION 'Unknown extracted field: %', field_path;
    END IF;

    SELECT c.udt_name INTO v_udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'judgments' AND c.column_name = v_column;

    IF v_udt_name IS NULL THEN
        RAISE EXCEPTION 'Column not found for extracted field: %', field_path;
    END IF;

    IF v_udt_name = '_text' THEN
        v_filled_sql := format(
            $f$EXISTS (SELECT 1 FROM unnest(j.%1$I) AS e WHERE e IS NOT NULL AND e <> '')$f$,
            v_column);
        v_values_sql := format(
            $v$SELECT j.jurisdiction, e::text AS value
               FROM matched m
               JOIN public.judgments j ON j.id = m.id
               CROSS JOIN LATERAL unnest(j.%1$I) AS e
               WHERE e IS NOT NULL AND e <> ''$v$,
            v_column);
    ELSIF v_udt_name = 'text' THEN
        v_filled_sql := format($f$NULLIF(BTRIM(j.%1$I), '') IS NOT NULL$f$, v_column);
        v_values_sql := format(
            $v$SELECT j.jurisdiction, j.%1$I AS value
               FROM matched m
               JOIN public.judgments j ON j.id = m.id
               WHERE NULLIF(BTRIM(j.%1$I), '') IS NOT NULL$v$,
            v_column);
    ELSE
        v_filled_sql := format($f$j.%1$I IS NOT NULL$f$, v_column);
        v_values_sql := format(
            $v$SELECT j.jurisdiction, j.%1$I::text AS value
               FROM matched m
               JOIN public.judgments j ON j.id = m.id
               WHERE j.%1$I IS NOT NULL$v$,
            v_column);
    END IF;

    RETURN QUERY EXECUTE format(
        $q$
        WITH matched AS (
            SELECT m.id, m.jurisdiction
            FROM public.list_extracted_filter_matches($1, $2) AS m
        ),
        totals AS (
            SELECT
                m.jurisdiction,
                COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE %1$s)::bigint AS covered
            FROM matched m
            JOIN public.judgments j ON j.id = m.id
            GROUP BY m.jurisdiction
        ),
        vals AS (
            SELECT v.jurisdiction, v.value, COUNT(*)::bigint AS count
            FROM (%2$s) AS v
            GROUP BY v.jurisdiction, v.value
        )
        SELECT
            t.jurisdiction,
            v.value,
            v.count,
            t.total,
            t.covered,
            ROUND(t.covered::numeric / NULLIF(t.total, 0), 4) AS coverage
        FROM totals t
        LEFT JOIN vals v ON v.jurisdiction = t.jurisdiction
        ORDER BY t.jurisdiction, v.count DESC NULLS LAST, v.value
        $q$,
        v_filled_sql,
        v_values_sql
    ) USING p_filters, p_text_query;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_extracted_facet_counts_by_jurisdiction(JSONB, TEXT, TEXT)
    TO anon, authenticated, service_role;
```

- [ ] **Step 4: Run the db tier**

```bash
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  poetry run pytest tests/db -q -m db
```
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260921000002_facet_counts_by_jurisdiction.sql backend/tests/db/test_compare_rpcs_contract.py backend/tests/db/test_migration_chain.py
git commit -m "feat(db): get_extracted_facet_counts_by_jurisdiction with coverage

Refs #<C>"
```

---

### Task 3: `collection_pairs` table (migration 3)

**Files:**
- Create: `supabase/migrations/20260921000003_create_collection_pairs.sql`
- Modify: `backend/tests/db/test_migration_chain.py:15-34` (`EXPECTED_TABLES`), `:151-158` (`EXPECTED_FKS` if present)
- Modify: `backend/tests/db/test_rls_isolation.py:36-101` (`_seed_owned_row`), `:104-112` (`OWNER_SCOPED_TABLES`)

**Interfaces:**
- Produces table `public.collection_pairs (id UUID PK, user_id UUID, name TEXT, filters JSONB, text_query TEXT, pl_collection_id UUID UNIQUE FK, uk_collection_id UUID UNIQUE FK, created_at, updated_at)`.

- [ ] **Step 1: Extend the contract tests (failing)**

In `backend/tests/db/test_migration_chain.py` add `"collection_pairs",` to `EXPECTED_TABLES`.

In `backend/tests/db/test_rls_isolation.py`, add a branch to `_seed_owned_row` before the final `raise AssertionError`:

```python
    elif table == "collection_pairs":
        pl_id, uk_id = str(uuid.uuid4()), str(uuid.uuid4())
        for cid, label in ((pl_id, "PL"), (uk_id, "UK")):
            _exec(
                conn,
                "INSERT INTO public.collections (id, user_id, name) VALUES (%s, %s, %s)",
                (cid, owner, f"pair — {label}"),
            )
        _exec(
            conn,
            "INSERT INTO public.collection_pairs "
            "(id, user_id, name, filters, pl_collection_id, uk_collection_id) "
            "VALUES (%s, %s, 'pair', '{}'::jsonb, %s, %s)",
            (row_id, owner, pl_id, uk_id),
        )
```
and `"collection_pairs",` to `OWNER_SCOPED_TABLES`.

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  poetry run pytest tests/db/test_migration_chain.py tests/db/test_rls_isolation.py -q -m db -k "collection_pairs or expected_tables"
```
Expected: FAIL — `these tables are absent: ['collection_pairs']`, and the RLS seed fails with `relation "public.collection_pairs" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260921000003_create_collection_pairs.sql`:

```sql
-- =============================================================================
-- Migration: collection_pairs — a PL/UK pair of collections (Spec C, Refs #<C>)
-- =============================================================================
-- A pair has its own identity so it can carry the filter that produced it
-- (permalink, re-run) and cascade when either side is deleted. A collection
-- belongs to at most one pair (UNIQUE on each side). RLS mirrors collections;
-- the backend uses service_role and bypasses it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.collection_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    text_query TEXT,
    pl_collection_id UUID NOT NULL UNIQUE REFERENCES public.collections(id) ON DELETE CASCADE,
    uk_collection_id UUID NOT NULL UNIQUE REFERENCES public.collections(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT collection_pairs_distinct_sides CHECK (pl_collection_id <> uk_collection_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_pairs_user_created
    ON public.collection_pairs(user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_collection_pairs_set_updated_at ON public.collection_pairs;
CREATE TRIGGER trg_collection_pairs_set_updated_at
    BEFORE UPDATE ON public.collection_pairs
    FOR EACH ROW EXECUTE FUNCTION public.tg_collections_set_updated_at();

ALTER TABLE public.collection_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS collection_pairs_owner_select ON public.collection_pairs;
CREATE POLICY collection_pairs_owner_select ON public.collection_pairs
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS collection_pairs_owner_insert ON public.collection_pairs;
CREATE POLICY collection_pairs_owner_insert ON public.collection_pairs
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS collection_pairs_owner_update ON public.collection_pairs;
CREATE POLICY collection_pairs_owner_update ON public.collection_pairs
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS collection_pairs_owner_delete ON public.collection_pairs;
CREATE POLICY collection_pairs_owner_delete ON public.collection_pairs
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_pairs TO authenticated;
GRANT ALL ON public.collection_pairs TO service_role;

COMMENT ON TABLE public.collection_pairs IS
    'PL/UK pair of collections created from one base-schema filter on /compare. `filters`/`text_query` reproduce the comparison.';
```

- [ ] **Step 4: Run the db tier**

```bash
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  poetry run pytest tests/db -q -m db
```
Expected: PASS, including `test_owner_sees_their_row_and_the_other_user_does_not[collection_pairs]` and the DELETE isolation variant.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260921000003_create_collection_pairs.sql backend/tests/db/test_migration_chain.py backend/tests/db/test_rls_isolation.py
git commit -m "feat(db): collection_pairs table with owner RLS

Refs #<C>"
```

---

### Task 4: Compare models + layout policy (pure Python)

**Files:**
- Create: `backend/app/compare/__init__.py` (empty), `backend/app/compare/models.py`, `backend/app/compare/layout.py`
- Test: `backend/tests/app/test_compare_layout.py`

**Interfaces:**
- Produces (`models.py`):
  ```python
  Jurisdiction = Literal["PL", "UK"]
  class CoverageStat(BaseModel): covered: int; total: int; ratio: float | None
  class CompareValue(BaseModel): value: str; counts: dict[str, int]; shares: dict[str, float | None]
  Tier = Literal["primary", "partial", "unavailable", "empty"]
  class CompareField(BaseModel): field: str; label: str; source: str; kind: Literal["enum","enum_array","boolean"]; coverage: dict[str, CoverageStat]; tier: Tier; missing_in: list[str]; values: list[CompareValue]
  class PairSummary(BaseModel): id: str; name: str; pl_collection_id: str; uk_collection_id: str
  class CompareResponse(BaseModel): jurisdictions: list[str] = ["PL","UK"]; totals: dict[str, int]; fields: list[CompareField]; ignored_filter_keys: list[str] = []; filters: dict[str, Any]; text_query: str | None = None; pair: PairSummary | None = None
  ```
- Produces (`layout.py`): `LOW_COVERAGE_THRESHOLD = 0.80`, `JURISDICTIONS = ("PL", "UK")`, `coverage_ratio(covered, total) -> float | None`, `share(count, covered) -> float | None`, `tier_for(coverage: dict[str, CoverageStat]) -> tuple[Tier, list[str]]`, `build_field(spec, coverage, counts) -> CompareField` where `spec` has `.field/.label/.kind/.source` (Task 5's `FieldSpec`) and `counts: dict[str, dict[str, int]]` = `{jurisdiction: {value: count}}`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/app/test_compare_layout.py`:

```python
"""Coverage/tier policy for the PL-UK comparison (Spec C AC2).

The threshold and hide rules live here, in one place, so the JSON response and
the CSV export cannot disagree. No DB, no HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.compare.layout import (
    LOW_COVERAGE_THRESHOLD,
    build_field,
    coverage_ratio,
    share,
    tier_for,
)
from app.compare.models import CoverageStat

pytestmark = pytest.mark.unit


@dataclass(frozen=True)
class _Spec:
    field: str = "appeal_outcome"
    label: str = "Appeal Outcome"
    kind: str = "enum_array"
    source: str = "base"


def _cov(pl: tuple[int, int], uk: tuple[int, int]) -> dict[str, CoverageStat]:
    return {
        "PL": CoverageStat(covered=pl[0], total=pl[1], ratio=coverage_ratio(*pl)),
        "UK": CoverageStat(covered=uk[0], total=uk[1], ratio=coverage_ratio(*uk)),
    }


def test_threshold_is_eighty_percent():
    assert LOW_COVERAGE_THRESHOLD == 0.80


def test_coverage_ratio_is_none_when_total_is_zero():
    assert coverage_ratio(0, 0) is None
    assert coverage_ratio(3, 4) == 0.75


def test_share_uses_covered_as_denominator():
    assert share(1, 4) == 0.25
    assert share(1, 0) is None


def test_primary_when_both_jurisdictions_at_or_above_threshold():
    assert tier_for(_cov((80, 100), (198, 200))) == ("primary", [])


def test_partial_when_either_jurisdiction_below_threshold():
    assert tier_for(_cov((153, 200), (198, 200))) == ("partial", [])
    assert tier_for(_cov((200, 200), (159, 200))) == ("partial", [])


def test_unavailable_names_the_jurisdiction_with_zero_coverage():
    assert tier_for(_cov((200, 200), (0, 300))) == ("unavailable", ["UK"])
    assert tier_for(_cov((0, 200), (0, 300))) == ("unavailable", ["PL", "UK"])


def test_unavailable_when_a_jurisdiction_matched_nothing():
    assert tier_for(_cov((10, 10), (0, 0))) == ("unavailable", ["UK"])


def test_empty_when_nothing_matched_anywhere():
    assert tier_for(_cov((0, 0), (0, 0))) == ("empty", ["PL", "UK"])


def test_build_field_aligns_values_across_jurisdictions_and_orders_by_total_count():
    field = build_field(
        _Spec(),
        _cov((2, 2), (2, 2)),
        {"PL": {"a": 2}, "UK": {"a": 1, "b": 1}},
    )
    assert [v.value for v in field.values] == ["a", "b"]
    a, b = field.values
    assert a.counts == {"PL": 2, "UK": 1} and a.shares == {"PL": 1.0, "UK": 0.5}
    assert b.counts == {"PL": 0, "UK": 1} and b.shares == {"PL": 0.0, "UK": 0.5}
    assert field.tier == "primary" and field.missing_in == []


def test_build_field_share_is_none_where_nothing_is_covered():
    field = build_field(_Spec(), _cov((0, 5), (1, 1)), {"UK": {"a": 1}})
    assert field.tier == "unavailable" and field.missing_in == ["PL"]
    assert field.values[0].shares == {"PL": None, "UK": 1.0}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_compare_layout.py -q
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.compare'`.

- [ ] **Step 3: Implement**

`backend/app/compare/__init__.py`: empty file (one docstring line: `"""PL/UK live comparison over base-schema fields (Spec C)."""`).

`backend/app/compare/models.py`:

```python
"""Response models for the PL/UK comparison API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Jurisdiction = Literal["PL", "UK"]
Tier = Literal["primary", "partial", "unavailable", "empty"]
FieldKind = Literal["enum", "enum_array", "boolean"]


class CoverageStat(BaseModel):
    """How many matched judgments have the field filled, per jurisdiction."""

    covered: int
    total: int
    ratio: float | None = Field(description="covered / total; null when total is 0")


class CompareValue(BaseModel):
    value: str
    counts: dict[str, int]
    shares: dict[str, float | None] = Field(
        description="count / covered per jurisdiction; null where covered is 0"
    )


class CompareField(BaseModel):
    field: str
    label: str
    source: str = Field(description="'base' or 'schema:<extraction_schema_id>'")
    kind: FieldKind
    coverage: dict[str, CoverageStat]
    tier: Tier
    missing_in: list[str] = []
    values: list[CompareValue]


class PairSummary(BaseModel):
    id: str
    name: str
    pl_collection_id: str
    uk_collection_id: str


class CompareResponse(BaseModel):
    jurisdictions: list[str] = ["PL", "UK"]
    totals: dict[str, int]
    fields: list[CompareField]
    ignored_filter_keys: list[str] = []
    filters: dict[str, Any]
    text_query: str | None = None
    pair: PairSummary | None = None
```

`backend/app/compare/layout.py`:

```python
"""Coverage ratios, shares and display tiers for the comparison (Spec C AC2).

Single home for the 80 % rule and the 0 %-hide rule. The frontend renders the
`tier`/`missing_in` flags and never re-derives them; the CSV export reads the
same numbers.
"""

from __future__ import annotations

from typing import Protocol

from app.compare.models import CompareField, CompareValue, CoverageStat, Tier

LOW_COVERAGE_THRESHOLD = 0.80
JURISDICTIONS: tuple[str, ...] = ("PL", "UK")


class FieldSpecLike(Protocol):
    field: str
    label: str
    kind: str
    source: str


def coverage_ratio(covered: int, total: int) -> float | None:
    return None if total == 0 else round(covered / total, 4)


def share(count: int, covered: int) -> float | None:
    return None if covered == 0 else round(count / covered, 4)


def tier_for(coverage: dict[str, CoverageStat]) -> tuple[Tier, list[str]]:
    """Classify a field.

    empty       — no judgment matched in any jurisdiction
    unavailable — at least one jurisdiction has covered == 0 (hide chart, say why)
    partial     — every jurisdiction covered, but one is below the threshold (badge)
    primary     — all jurisdictions at or above the threshold
    """
    stats = [coverage.get(j, CoverageStat(covered=0, total=0, ratio=None)) for j in JURISDICTIONS]
    if all(s.total == 0 for s in stats):
        return "empty", list(JURISDICTIONS)
    missing = [j for j, s in zip(JURISDICTIONS, stats, strict=True) if s.covered == 0]
    if missing:
        return "unavailable", missing
    if any((s.ratio or 0.0) < LOW_COVERAGE_THRESHOLD for s in stats):
        return "partial", []
    return "primary", []


def build_field(
    spec: FieldSpecLike,
    coverage: dict[str, CoverageStat],
    counts: dict[str, dict[str, int]],
) -> CompareField:
    """Align value rows across jurisdictions and attach shares + tier.

    `counts` is {jurisdiction: {value: count}}; a value absent in one
    jurisdiction gets count 0 there. Values are ordered by summed count, then
    alphabetically, so the bar order is stable between PL and UK.
    """
    all_values = {v for per in counts.values() for v in per}
    ordered = sorted(
        all_values,
        key=lambda v: (-sum(per.get(v, 0) for per in counts.values()), v),
    )
    values = [
        CompareValue(
            value=v,
            counts={j: counts.get(j, {}).get(v, 0) for j in JURISDICTIONS},
            shares={
                j: share(counts.get(j, {}).get(v, 0), coverage.get(j, CoverageStat(covered=0, total=0, ratio=None)).covered)
                for j in JURISDICTIONS
            },
        )
        for v in ordered
    ]
    tier, missing = tier_for(coverage)
    return CompareField(
        field=spec.field,
        label=spec.label,
        source=spec.source,
        kind=spec.kind,  # type: ignore[arg-type]
        coverage={j: coverage.get(j, CoverageStat(covered=0, total=0, ratio=None)) for j in JURISDICTIONS},
        tier=tier,
        missing_in=missing,
        values=values,
    )
```

- [ ] **Step 4: Run tests**

```bash
cd backend && poetry run pytest tests/app/test_compare_layout.py -q && poetry run ruff check app/compare tests/app/test_compare_layout.py && poetry run ruff format --check app/compare
```
Expected: PASS, lint clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/compare backend/tests/app/test_compare_layout.py
git commit -m "feat(compare): response models and coverage tier policy

Refs #<C>"
```

---

### Task 5: Comparable field registry (base schema + any JSON Schema)

**Files:**
- Create: `backend/app/compare/fields.py`
- Test: `backend/tests/app/test_compare_fields.py`

**Interfaces:**
- Produces:
  ```python
  @dataclass(frozen=True)
  class FieldSpec: field: str; label: str; kind: Literal["enum","enum_array","boolean"]; source: str = "base"; order: int = 999
  DEFAULT_FIRST = ("appeal_outcome", "offender_gender", "sentence_serve", "plea_point")
  def comparable_fields_from_schema(schema: dict, source: str) -> list[FieldSpec]
  def base_compare_fields() -> list[FieldSpec]          # cached; from BaseSchemaExtractor().schema
  def select_base_fields(requested: list[str] | None) -> list[FieldSpec]   # raises ValueError on unknown/non-comparable names
  ```

- [ ] **Step 1: Write the failing tests**

`backend/tests/app/test_compare_fields.py`:

```python
from __future__ import annotations

import pytest

from app.compare.fields import (
    DEFAULT_FIRST,
    base_compare_fields,
    comparable_fields_from_schema,
    select_base_fields,
)

pytestmark = pytest.mark.unit


def test_comparable_fields_are_enum_array_enum_or_boolean_only():
    schema = {
        "properties": {
            "outcome": {"type": "string", "enum": ["a", "b"], "x-ui-label": "Outcome", "x-ui-order": 2},
            "flags": {"type": "array", "items": {"enum": ["x", "y"]}, "x-ui-order": 1},
            "confessed": {"type": "boolean", "x-ui-order": 3},
            "summary": {"type": "string"},
            "tags": {"type": "array", "items": {"type": "string"}},
            "age": {"type": "number"},
        }
    }
    specs = comparable_fields_from_schema(schema, source="schema:abc")
    assert [(s.field, s.kind) for s in specs] == [
        ("flags", "enum_array"), ("outcome", "enum"), ("confessed", "boolean"),
    ]
    assert specs[1].label == "Outcome"
    assert specs[2].label == "confessed"  # falls back to the property name
    assert all(s.source == "schema:abc" for s in specs)


def test_base_fields_come_from_the_shipped_base_schema():
    names = [s.field for s in base_compare_fields()]
    assert names[:4] == list(DEFAULT_FIRST)
    assert set(names) == {
        "appeal_outcome", "offender_gender", "sentence_serve", "plea_point",
        "did_offender_confess", "remand_decision", "offender_job_offence",
        "offender_home_offence", "offender_intox_offence", "offender_victim_relationship",
        "victim_type", "victim_gender", "victim_intox_offence", "pre_sent_report",
        "vic_impact_statement", "appellant", "appeal_against",
    }
    assert "keywords" not in names and "convict_offences" not in names


def test_select_base_fields_defaults_to_all_and_validates_names():
    assert select_base_fields(None) == base_compare_fields()
    assert [s.field for s in select_base_fields(["plea_point", "appellant"])] == ["plea_point", "appellant"]
    with pytest.raises(ValueError, match="keywords"):
        select_base_fields(["keywords"])
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_compare_fields.py -q
```
Expected: FAIL — `cannot import name ... from 'app.compare.fields'`.

- [ ] **Step 3: Implement**

`backend/app/compare/fields.py`:

```python
"""Which fields can be compared side by side, and in what order.

Comparable = a closed value set: `enum` on the property, `enum` on array items,
or `boolean`. Free-text arrays (keywords, convict_offences) are excluded on
purpose — they are high-cardinality and PL-only in practice (APP_STATUS §4).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

from juddges_search.info_extraction import BaseSchemaExtractor

FieldKind = Literal["enum", "enum_array", "boolean"]

DEFAULT_FIRST: tuple[str, ...] = (
    "appeal_outcome",
    "offender_gender",
    "sentence_serve",
    "plea_point",
)


@dataclass(frozen=True)
class FieldSpec:
    field: str
    label: str
    kind: FieldKind
    source: str = "base"
    order: int = 999


def _kind_of(prop: dict[str, Any]) -> FieldKind | None:
    if prop.get("type") == "boolean":
        return "boolean"
    if "enum" in prop:
        return "enum"
    if prop.get("type") == "array" and isinstance(prop.get("items"), dict) and "enum" in prop["items"]:
        return "enum_array"
    return None


def comparable_fields_from_schema(schema: dict[str, Any], source: str) -> list[FieldSpec]:
    specs: list[FieldSpec] = []
    for name, prop in (schema.get("properties") or {}).items():
        kind = _kind_of(prop)
        if kind is None:
            continue
        specs.append(
            FieldSpec(
                field=name,
                label=prop.get("x-ui-label") or prop.get("title") or name,
                kind=kind,
                source=source,
                order=int(prop.get("x-ui-order", 999)),
            )
        )
    specs.sort(key=lambda s: (s.order, s.field))
    return specs


@lru_cache(maxsize=1)
def _base_fields_tuple() -> tuple[FieldSpec, ...]:
    specs = comparable_fields_from_schema(BaseSchemaExtractor().schema, source="base")
    first = [s for name in DEFAULT_FIRST for s in specs if s.field == name]
    rest = [s for s in specs if s.field not in DEFAULT_FIRST]
    return tuple(first + rest)


def base_compare_fields() -> list[FieldSpec]:
    return list(_base_fields_tuple())


def select_base_fields(requested: list[str] | None) -> list[FieldSpec]:
    """Resolve requested field names against the base registry, keeping request order."""
    if not requested:
        return base_compare_fields()
    by_name = {s.field: s for s in base_compare_fields()}
    unknown = [f for f in requested if f not in by_name]
    if unknown:
        raise ValueError(f"Not comparable base fields: {', '.join(unknown)}")
    return [by_name[f] for f in requested]
```

- [ ] **Step 4: Run tests**

```bash
cd backend && poetry run pytest tests/app/test_compare_fields.py tests/app/test_compare_layout.py -q && poetry run ruff check app/compare && poetry run ruff format --check app/compare
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/compare/fields.py backend/tests/app/test_compare_fields.py
git commit -m "feat(compare): comparable field registry from JSON Schema

Refs #<C>"
```

---

### Task 6: `CompareService` — RPC rows → `CompareResponse`

**Files:**
- Create: `backend/app/compare/service.py`
- Test: `backend/tests/app/test_compare_service.py`

**Interfaces:**
- Consumes: `list_extracted_filter_matches` (Task 1), `get_extracted_facet_counts_by_jurisdiction` (Task 2) via a supabase-py client's `.rpc(name, params).execute().data`; `build_field`, `coverage_ratio` (Task 4); `FieldSpec` (Task 5).
- Produces:
  ```python
  IGNORED_FILTER_KEYS = ("jurisdiction",)
  class CompareService:
      def __init__(self, client) -> None
      def compare(self, filters: dict, text_query: str | None, specs: list[FieldSpec]) -> CompareResponse
      def facet_rows(self, filters: dict, field: str, text_query: str | None) -> list[dict]
  def strip_ignored(filters: dict) -> tuple[dict, list[str]]
  def rows_to_coverage_and_counts(rows: list[dict]) -> tuple[dict[str, CoverageStat], dict[str, dict[str, int]]]
  ```

- [ ] **Step 1: Write the failing tests**

`backend/tests/app/test_compare_service.py`:

```python
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.compare.fields import FieldSpec
from app.compare.service import (
    CompareService,
    rows_to_coverage_and_counts,
    strip_ignored,
)

pytestmark = pytest.mark.unit


class _FakeClient:
    """Records .rpc() calls and returns canned rows per field_path."""

    def __init__(self, rows_by_field: dict[str, list[dict]]):
        self.rows_by_field = rows_by_field
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name: str, params: dict):
        self.calls.append((name, params))
        data = self.rows_by_field.get(params.get("field_path"), [])
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=data))


def _row(j, value, count, total, covered):
    return {"jurisdiction": j, "value": value, "count": count, "total": total,
            "covered": covered, "coverage": None if total == 0 else covered / total}


def test_strip_ignored_removes_jurisdiction_and_reports_it():
    filters, ignored = strip_ignored({"jurisdiction": ["PL"], "plea_point": ["before_trial"]})
    assert filters == {"plea_point": ["before_trial"]} and ignored == ["jurisdiction"]
    assert strip_ignored({"a": 1}) == ({"a": 1}, [])


def test_rows_to_coverage_and_counts_handles_summary_rows():
    rows = [
        _row("PL", "a", 3, 5, 4), _row("PL", "b", 1, 5, 4),
        _row("UK", None, None, 7, 0),  # matched 7, none filled
    ]
    coverage, counts = rows_to_coverage_and_counts(rows)
    assert coverage["PL"].covered == 4 and coverage["PL"].total == 5 and coverage["PL"].ratio == 0.8
    assert coverage["UK"].covered == 0 and coverage["UK"].total == 7 and coverage["UK"].ratio == 0.0
    assert counts == {"PL": {"a": 3, "b": 1}}


def test_compare_calls_rpc_once_per_field_and_builds_totals():
    client = _FakeClient({
        "appeal_outcome": [_row("PL", "x", 2, 2, 2), _row("UK", "x", 1, 3, 3), _row("UK", "y", 2, 3, 3)],
        "plea_point": [_row("PL", None, None, 2, 0), _row("UK", "before_trial", 3, 3, 3)],
    })
    specs = [FieldSpec("appeal_outcome", "Appeal Outcome", "enum_array"),
             FieldSpec("plea_point", "Plea Point", "enum")]
    resp = CompareService(client).compare({"jurisdiction": ["UK"], "appellant": ["offender"]}, "fraud", specs)

    assert [c[0] for c in client.calls] == ["get_extracted_facet_counts_by_jurisdiction"] * 2
    assert client.calls[0][1] == {"p_filters": {"appellant": ["offender"]},
                                  "field_path": "appeal_outcome", "p_text_query": "fraud"}
    assert resp.totals == {"PL": 2, "UK": 3}
    assert resp.ignored_filter_keys == ["jurisdiction"]
    assert resp.filters == {"appellant": ["offender"]} and resp.text_query == "fraud"
    outcome, plea = resp.fields
    assert outcome.tier == "primary" and [v.value for v in outcome.values] == ["x", "y"]
    assert plea.tier == "unavailable" and plea.missing_in == ["PL"]


def test_compare_with_no_matches_reports_zero_totals_and_empty_fields():
    client = _FakeClient({"appeal_outcome": []})
    resp = CompareService(client).compare({}, None, [FieldSpec("appeal_outcome", "Appeal Outcome", "enum_array")])
    assert resp.totals == {"PL": 0, "UK": 0}
    assert resp.fields[0].tier == "empty"
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_compare_service.py -q
```
Expected: FAIL — module `app.compare.service` not found.

- [ ] **Step 3: Implement**

`backend/app/compare/service.py`:

```python
"""Turn per-jurisdiction facet rows into a CompareResponse."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from loguru import logger

from app.compare.fields import FieldSpec
from app.compare.layout import JURISDICTIONS, build_field, coverage_ratio
from app.compare.models import CompareField, CompareResponse, CoverageStat

IGNORED_FILTER_KEYS: tuple[str, ...] = ("jurisdiction",)
FACET_RPC = "get_extracted_facet_counts_by_jurisdiction"


def strip_ignored(filters: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """/compare always splits by jurisdiction; a jurisdiction filter is dropped, not honoured."""
    ignored = [k for k in IGNORED_FILTER_KEYS if k in filters]
    return {k: v for k, v in filters.items() if k not in IGNORED_FILTER_KEYS}, ignored


def rows_to_coverage_and_counts(
    rows: list[dict[str, Any]],
) -> tuple[dict[str, CoverageStat], dict[str, dict[str, int]]]:
    """Split RPC rows into coverage per jurisdiction and {jurisdiction: {value: count}}.

    Summary rows (value IS NULL) carry total/covered only.
    """
    coverage: dict[str, CoverageStat] = {}
    counts: dict[str, dict[str, int]] = defaultdict(dict)
    for row in rows:
        j = row["jurisdiction"]
        total, covered = int(row["total"]), int(row["covered"])
        coverage[j] = CoverageStat(covered=covered, total=total, ratio=coverage_ratio(covered, total))
        if row.get("value") is not None:
            counts[j][str(row["value"])] = int(row["count"])
    return coverage, dict(counts)


class CompareService:
    def __init__(self, client) -> None:
        self._client = client

    def facet_rows(self, filters: dict[str, Any], field: str, text_query: str | None) -> list[dict[str, Any]]:
        response = self._client.rpc(
            FACET_RPC,
            {"p_filters": filters, "field_path": field, "p_text_query": text_query},
        ).execute()
        return list(response.data or [])

    def compare(
        self,
        filters: dict[str, Any],
        text_query: str | None,
        specs: list[FieldSpec],
    ) -> CompareResponse:
        clean, ignored = strip_ignored(filters)
        totals: dict[str, int] = {j: 0 for j in JURISDICTIONS}
        fields: list[CompareField] = []
        for spec in specs:
            rows = self.facet_rows(clean, spec.field, text_query)
            coverage, counts = rows_to_coverage_and_counts(rows)
            for j, stat in coverage.items():
                totals[j] = stat.total  # identical for every field; last write wins harmlessly
            fields.append(build_field(spec, coverage, counts))
        logger.info("compare: {} fields, totals={}", len(fields), totals)
        return CompareResponse(
            totals=totals,
            fields=fields,
            ignored_filter_keys=ignored,
            filters=clean,
            text_query=text_query,
        )
```

- [ ] **Step 4: Run tests + lint**

```bash
cd backend && poetry run pytest tests/app/test_compare_service.py -q && poetry run ruff check app/compare tests/app && poetry run ruff format --check app/compare
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/compare/service.py backend/tests/app/test_compare_service.py
git commit -m "feat(compare): CompareService over the by-jurisdiction facet RPC

Refs #<C>"
```

---

### Task 7: `POST /compare/facets` endpoint + registration

**Files:**
- Create: `backend/app/compare/router.py`
- Modify: `backend/app/server.py:684-710` (add `compare_router` to `API_KEY_PROTECTED_ROUTERS`; import near line 45)
- Test: `backend/tests/app/test_compare_router.py`

**Interfaces:**
- Consumes: `CompareService` (Task 6), `select_base_fields` (Task 5), `app.core.supabase.supabase_client`, `app.core.auth_jwt.get_current_user`.
- Produces: `POST /compare/facets` body `CompareRequest {filters: dict = {}, text_query: str | None, fields: list[str] | None}` → `CompareResponse` (Task 4). Errors: 503 `DATABASE_UNAVAILABLE`, 400 `UNKNOWN_FIELD`, 500 `COMPARE_FAILED` — detail shape `{"error","message","code"}` like `results_router.py`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/app/test_compare_router.py`:

```python
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.api]


def _rows(field: str):
    return [
        {"jurisdiction": "PL", "value": "a", "count": 4, "total": 5, "covered": 5, "coverage": 1.0},
        {"jurisdiction": "UK", "value": "a", "count": 1, "total": 2, "covered": 2, "coverage": 1.0},
    ]


def _client_returning(rows_by_field):
    client = MagicMock()

    def _rpc(name, params):
        m = MagicMock()
        m.execute.return_value = MagicMock(data=rows_by_field.get(params["field_path"], []))
        return m

    client.rpc.side_effect = _rpc
    return client


async def test_facets_requires_bearer_user(client, valid_api_headers):
    response = await client.post("/compare/facets", json={"filters": {}}, headers=valid_api_headers)
    assert response.status_code in (401, 403)


async def test_facets_returns_compare_response(authenticated_client):
    fake = _client_returning({"appeal_outcome": _rows("appeal_outcome")})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets",
            json={"filters": {"appellant": ["offender"]}, "text_query": None,
                  "fields": ["appeal_outcome"]},
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["totals"] == {"PL": 5, "UK": 2}
    assert body["fields"][0]["field"] == "appeal_outcome"
    assert body["fields"][0]["values"][0]["shares"] == {"PL": 0.8, "UK": 0.5}
    fake.rpc.assert_called_once_with(
        "get_extracted_facet_counts_by_jurisdiction",
        {"p_filters": {"appellant": ["offender"]}, "field_path": "appeal_outcome", "p_text_query": None},
    )


async def test_facets_defaults_to_all_base_fields(authenticated_client):
    fake = _client_returning({})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post("/compare/facets", json={"filters": {}})
    assert response.status_code == 200
    assert len(response.json()["fields"]) == 17
    assert fake.rpc.call_count == 17


async def test_facets_rejects_non_comparable_field(authenticated_client):
    with patch("app.compare.router.supabase_client", MagicMock()):
        response = await authenticated_client.post(
            "/compare/facets", json={"filters": {}, "fields": ["keywords"]})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "UNKNOWN_FIELD"


async def test_facets_503_without_database(authenticated_client):
    with patch("app.compare.router.supabase_client", None):
        response = await authenticated_client.post("/compare/facets", json={"filters": {}})
    assert response.status_code == 503
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_compare_router.py -q
```
Expected: FAIL — 404 for `/compare/facets` (router not registered).

- [ ] **Step 3: Implement the router and register it**

`backend/app/compare/router.py`:

```python
"""HTTP surface of the PL/UK comparison: /compare/facets (+ export, pairs later)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field

from app.compare.fields import select_base_fields
from app.compare.models import CompareResponse
from app.compare.service import CompareService
from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.core.supabase import supabase_client

router = APIRouter(prefix="/compare", tags=["compare"])


class CompareRequest(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)
    text_query: str | None = None
    fields: list[str] | None = Field(
        default=None, description="Base-schema field names; defaults to all comparable fields"
    )


def _require_db():
    if not supabase_client:
        raise HTTPException(
            status_code=503,
            detail={"error": "Database Unavailable",
                    "message": "Database connection not available.",
                    "code": "DATABASE_UNAVAILABLE"},
        )
    return supabase_client


def _run_compare(request: CompareRequest) -> CompareResponse:
    client = _require_db()
    try:
        specs = select_base_fields(request.fields)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "Unknown Field", "message": str(exc), "code": "UNKNOWN_FIELD"},
        ) from exc
    try:
        return CompareService(client).compare(request.filters, request.text_query, specs)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — surface as a typed 500 like sibling routers
        logger.exception("compare failed: {}", exc)
        raise HTTPException(
            status_code=500,
            detail={"error": "Compare Failed", "message": str(exc), "code": "COMPARE_FAILED"},
        ) from exc


@router.post(
    "/facets",
    response_model=CompareResponse,
    summary="Side-by-side PL/UK value distributions for base-schema fields",
)
async def compare_facets(
    request: CompareRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> CompareResponse:
    return _run_compare(request)
```

`backend/app/server.py`: add `from app.compare.router import router as compare_router` next to the other router imports (line ≈ 45), and `compare_router,` inside `API_KEY_PROTECTED_ROUTERS` after `collections_router`.

- [ ] **Step 4: Run tests + lint + static DB contract**

```bash
cd backend && poetry run pytest tests/app/test_compare_router.py tests/app/test_db_contract_static.py -q && poetry run ruff check app && poetry run ruff format --check app
```
Expected: PASS (the static contract sees `get_extracted_facet_counts_by_jurisdiction` declared in migration 2).

- [ ] **Step 5: Commit**

```bash
git add backend/app/compare/router.py backend/app/server.py backend/tests/app/test_compare_router.py
git commit -m "feat(api): POST /compare/facets

Refs #<C>"
```

---

### Task 8: CSV export — `POST /compare/export`

**Files:**
- Create: `backend/app/compare/csv_export.py`
- Modify: `backend/app/compare/router.py` (add endpoint)
- Test: `backend/tests/app/test_compare_csv.py`

**Interfaces:**
- Produces: `CSV_COLUMNS = ("field","value","jurisdiction","count","share","coverage","covered","total")`, `to_csv_rows(response: CompareResponse) -> list[dict]`, `csv_bytes(rows) -> bytes` (UTF-8 BOM); `POST /compare/export` (same body as `/compare/facets`) → `StreamingResponse` `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="compare_<YYYY-MM-DD>.csv"`, `X-Rows-Count`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/app/test_compare_csv.py`:

```python
from __future__ import annotations

import csv
import io
from unittest.mock import MagicMock, patch

import pytest

from app.compare.csv_export import CSV_COLUMNS, csv_bytes, to_csv_rows
from app.compare.models import CompareField, CompareResponse, CompareValue, CoverageStat

pytestmark = [pytest.mark.unit]


def _response() -> CompareResponse:
    return CompareResponse(
        totals={"PL": 4, "UK": 2},
        filters={}, text_query=None,
        fields=[
            CompareField(
                field="plea_point", label="Plea Point", source="base", kind="enum",
                coverage={"PL": CoverageStat(covered=4, total=4, ratio=1.0),
                          "UK": CoverageStat(covered=1, total=2, ratio=0.5)},
                tier="partial", missing_in=[],
                values=[CompareValue(value="before_trial", counts={"PL": 3, "UK": 0},
                                     shares={"PL": 0.75, "UK": 0.0})],
            ),
            CompareField(
                field="appellant", label="Appellant", source="base", kind="enum",
                coverage={"PL": CoverageStat(covered=0, total=4, ratio=0.0),
                          "UK": CoverageStat(covered=0, total=2, ratio=0.0)},
                tier="unavailable", missing_in=["PL", "UK"], values=[],
            ),
        ],
    )


def test_long_format_has_one_row_per_field_value_jurisdiction():
    rows = to_csv_rows(_response())
    assert [tuple(r.keys()) for r in rows] == [CSV_COLUMNS] * 2
    assert rows[0] == {"field": "plea_point", "value": "before_trial", "jurisdiction": "PL",
                       "count": 3, "share": 0.75, "coverage": 1.0, "covered": 4, "total": 4}
    assert rows[1]["jurisdiction"] == "UK" and rows[1]["count"] == 0 and rows[1]["coverage"] == 0.5


def test_fields_without_values_produce_no_rows():
    assert all(r["field"] != "appellant" for r in to_csv_rows(_response()))


def test_csv_bytes_has_bom_and_header():
    data = csv_bytes(to_csv_rows(_response()))
    assert data.startswith(b"\xef\xbb\xbf")
    reader = csv.reader(io.StringIO(data.decode("utf-8-sig")))
    assert next(reader) == list(CSV_COLUMNS)


@pytest.mark.anyio
async def test_export_endpoint_streams_csv(authenticated_client):
    fake = MagicMock()
    fake.rpc.return_value.execute.return_value = MagicMock(data=[
        {"jurisdiction": "PL", "value": "a", "count": 1, "total": 1, "covered": 1, "coverage": 1.0},
    ])
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/export", json={"filters": {}, "fields": ["appellant"]})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"].startswith('attachment; filename="compare_')
    assert response.headers["x-rows-count"] == "2"  # PL row + UK row (count 0)
    body = response.content.decode("utf-8-sig").splitlines()
    assert body[0] == ",".join(CSV_COLUMNS)
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_compare_csv.py -q
```
Expected: FAIL — `app.compare.csv_export` not found.

- [ ] **Step 3: Implement**

`backend/app/compare/csv_export.py`:

```python
"""Long-format CSV of a CompareResponse (Spec C AC5)."""

from __future__ import annotations

import csv
import io
from typing import Any

from app.compare.layout import JURISDICTIONS
from app.compare.models import CompareResponse

CSV_COLUMNS: tuple[str, ...] = (
    "field", "value", "jurisdiction", "count", "share", "coverage", "covered", "total",
)


def to_csv_rows(response: CompareResponse) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for field in response.fields:
        for value in field.values:
            for j in JURISDICTIONS:
                cov = field.coverage[j]
                rows.append({
                    "field": field.field,
                    "value": value.value,
                    "jurisdiction": j,
                    "count": value.counts.get(j, 0),
                    "share": value.shares.get(j),
                    "coverage": cov.ratio,
                    "covered": cov.covered,
                    "total": cov.total,
                })
    return rows


def csv_bytes(rows: list[dict[str, Any]]) -> bytes:
    """UTF-8 with BOM so Excel opens Polish labels correctly (same as results export)."""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(CSV_COLUMNS), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return b"\xef\xbb\xbf" + buffer.getvalue().encode("utf-8")
```

Append to `backend/app/compare/router.py`:

```python
from datetime import UTC, datetime
from io import BytesIO

from fastapi.responses import StreamingResponse

from app.compare.csv_export import csv_bytes, to_csv_rows


@router.post("/export", summary="Long-format CSV of the comparison")
async def compare_export(
    request: CompareRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> StreamingResponse:
    response = _run_compare(request)
    rows = to_csv_rows(response)
    filename = f"compare_{datetime.now(UTC).strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        BytesIO(csv_bytes(rows)),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Rows-Count": str(len(rows)),
        },
    )
```
(move the new imports to the top of the file with the others).

- [ ] **Step 4: Run tests + lint**

```bash
cd backend && poetry run pytest tests/app/test_compare_csv.py tests/app/test_compare_router.py -q && poetry run ruff check app/compare && poetry run ruff format --check app/compare
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/compare/csv_export.py backend/app/compare/router.py backend/tests/app/test_compare_csv.py
git commit -m "feat(api): POST /compare/export long CSV

Refs #<C>"
```

---

### Task 9: Collection pairs — DB layer + `/collections/pairs` router

**Files:**
- Create: `backend/packages/juddges_search/juddges_search/db/collection_pairs_db.py`
- Create: `backend/app/collection_pairs.py`
- Modify: `backend/app/server.py:684-710` (register **before** `collections_router`)
- Test: `backend/tests/app/test_collection_pairs_router.py`

**Interfaces:**
- Consumes: `SupabaseClientMixin` (`juddges_search/db/_base.py`), `CollectionsDB.create_collection/bulk_add_documents` (`collections_db.py:158,251`), RPC `list_extracted_filter_matches` (Task 1), `strip_ignored` (Task 6).
- Produces DB layer:
  ```python
  class CollectionPairsDB(SupabaseClientMixin):
      async def create_pair(self, user_id, name, filters, text_query, pl_collection_id, uk_collection_id) -> dict
      async def list_pairs(self, user_id) -> list[dict]
      async def find_pair(self, pair_id, user_id) -> dict | None
      async def delete_pair(self, pair_id, user_id) -> bool
      async def pairs_by_collection(self, user_id) -> dict[str, dict]   # collection_id -> {"id","name","role","partner_collection_id"}
  def get_collection_pairs_db() -> CollectionPairsDB
  ```
- Produces API (prefix `/collections/pairs`):
  - `POST ""` body `CreatePairRequest {name: str(1..200), filters: dict, text_query: str|None}` → 201 `CollectionPair {id, user_id, name, filters, text_query, created_at, sides: [PairSide {jurisdiction, collection_id, document_count}]}`; 413 `PAIR_SIDE_TOO_LARGE` when a side > `MAX_PAIR_SIDE = 5000`.
  - `GET ""` → `list[CollectionPair]`; `GET "/{pair_id}"` → `CollectionPair` (404); `DELETE "/{pair_id}"` → 204 (unlink only).
  - Collection names: `f"{name} — PL"`, `f"{name} — UK"`; description `f"Created from /compare · filter: {json.dumps(filters, ensure_ascii=False)[:900]}"`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/app/test_collection_pairs_router.py`:

```python
"""/collections/pairs: creation from a filter, listing, precedence over /collections/{id}."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.collection_pairs import MAX_PAIR_SIDE, get_collection_pairs_db
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app
from juddges_search.db.supabase_db import get_collections_db

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.collections]

USER = "11111111-1111-4111-8111-111111111111"


class _StubCollectionsDb:
    def __init__(self):
        self.created: list[dict] = []
        self.bulk: list[tuple[str, list[str]]] = []

    async def create_collection(self, user_id, name, description=None):
        cid = f"col-{len(self.created) + 1}"
        row = {"id": cid, "user_id": user_id, "name": name, "description": description,
               "created_at": "2026-09-21T00:00:00Z", "updated_at": "2026-09-21T00:00:00Z"}
        self.created.append(row)
        return row

    async def bulk_add_documents(self, collection_id, judgment_ids, user_id):
        self.bulk.append((collection_id, list(judgment_ids)))
        return {"added": list(judgment_ids), "failed": []}


class _StubPairsDb:
    def __init__(self):
        self.rows: list[dict] = []

    async def create_pair(self, user_id, name, filters, text_query, pl_collection_id, uk_collection_id):
        row = {"id": f"pair-{len(self.rows) + 1}", "user_id": user_id, "name": name,
               "filters": filters, "text_query": text_query,
               "pl_collection_id": pl_collection_id, "uk_collection_id": uk_collection_id,
               "created_at": "2026-09-21T00:00:00Z", "updated_at": "2026-09-21T00:00:00Z"}
        self.rows.append(row)
        return row

    async def list_pairs(self, user_id):
        return [r for r in self.rows if r["user_id"] == user_id]

    async def find_pair(self, pair_id, user_id):
        return next((r for r in self.rows if r["id"] == pair_id and r["user_id"] == user_id), None)

    async def delete_pair(self, pair_id, user_id):
        before = len(self.rows)
        self.rows = [r for r in self.rows if not (r["id"] == pair_id and r["user_id"] == user_id)]
        return len(self.rows) < before


def _matches_client(pl: int, uk: int):
    rows = [{"id": f"pl-{i}", "jurisdiction": "PL"} for i in range(pl)] + \
           [{"id": f"uk-{i}", "jurisdiction": "UK"} for i in range(uk)]
    client = MagicMock()
    client.rpc.return_value.execute.return_value = SimpleNamespace(data=rows)
    return client


@pytest.fixture
def stubs():
    cols, pairs = _StubCollectionsDb(), _StubPairsDb()

    async def _user():
        from app.core.auth_jwt import AuthenticatedUser
        return AuthenticatedUser(user_data={"id": USER, "email": "u@x.test", "role": "authenticated"},
                                 access_token="t")

    app.dependency_overrides[jwt_get_current_user] = _user
    app.dependency_overrides[get_collections_db] = lambda: cols
    app.dependency_overrides[get_collection_pairs_db] = lambda: pairs
    try:
        yield cols, pairs
    finally:
        for dep in (jwt_get_current_user, get_collections_db, get_collection_pairs_db):
            app.dependency_overrides.pop(dep, None)


@pytest.fixture
async def http():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                           headers={"X-API-Key": "test-api-key-12345"}) as ac:
        yield ac


async def test_create_pair_builds_two_collections_from_the_filter(http, stubs):
    cols, pairs = stubs
    with patch("app.collection_pairs.supabase_client", _matches_client(pl=3, uk=2)) as fake:
        response = await http.post("/collections/pairs", json={
            "name": "Fraud, suspended", "filters": {"jurisdiction": ["PL"], "appellant": ["offender"]},
            "text_query": "fraud"})
    assert response.status_code == 201, response.text
    fake.rpc.assert_called_once_with("list_extracted_filter_matches",
                                     {"p_filters": {"appellant": ["offender"]}, "p_text_query": "fraud"})
    body = response.json()
    assert [c["name"] for c in cols.created] == ["Fraud, suspended — PL", "Fraud, suspended — UK"]
    assert cols.bulk == [("col-1", ["pl-0", "pl-1", "pl-2"]), ("col-2", ["uk-0", "uk-1"])]
    assert body["sides"] == [
        {"jurisdiction": "PL", "collection_id": "col-1", "document_count": 3},
        {"jurisdiction": "UK", "collection_id": "col-2", "document_count": 2},
    ]
    assert body["filters"] == {"appellant": ["offender"]}
    assert pairs.rows[0]["pl_collection_id"] == "col-1"


async def test_create_pair_refuses_oversized_side(http, stubs):
    cols, _ = stubs
    with patch("app.collection_pairs.supabase_client", _matches_client(pl=MAX_PAIR_SIDE + 1, uk=1)):
        response = await http.post("/collections/pairs", json={"name": "big", "filters": {}})
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "PAIR_SIDE_TOO_LARGE"
    assert cols.created == []


async def test_create_pair_chunks_bulk_adds_in_1000s(http, stubs):
    cols, _ = stubs
    with patch("app.collection_pairs.supabase_client", _matches_client(pl=2500, uk=0)):
        response = await http.post("/collections/pairs", json={"name": "many", "filters": {}})
    assert response.status_code == 201
    assert [len(ids) for cid, ids in cols.bulk if cid == "col-1"] == [1000, 1000, 500]


async def test_list_get_delete_pair(http, stubs):
    _, pairs = stubs
    await pairs.create_pair(USER, "p", {}, None, "a", "b")
    listed = await http.get("/collections/pairs")
    assert listed.status_code == 200 and listed.json()[0]["id"] == "pair-1"
    one = await http.get("/collections/pairs/pair-1")
    assert one.status_code == 200 and one.json()["name"] == "p"
    gone = await http.delete("/collections/pairs/pair-1")
    assert gone.status_code == 204
    assert (await http.get("/collections/pairs/pair-1")).status_code == 404


async def test_pairs_route_wins_over_collection_id_catch_all(http, stubs):
    """/collections/{collection_id} would otherwise swallow 'pairs' and answer 404."""
    response = await http.get("/collections/pairs")
    assert response.status_code == 200
    assert response.json() == []
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_collection_pairs_router.py -q
```
Expected: FAIL — `ModuleNotFoundError: app.collection_pairs`.

- [ ] **Step 3: Implement the DB layer**

`backend/packages/juddges_search/juddges_search/db/collection_pairs_db.py`:

```python
"""Persistence for PL/UK collection pairs (table public.collection_pairs)."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from loguru import logger
from postgrest.exceptions import APIError as PostgrestAPIError

from juddges_search.db._base import SupabaseClientMixin

_COLS = "id, user_id, name, filters, text_query, pl_collection_id, uk_collection_id, created_at, updated_at"


class CollectionPairsDB(SupabaseClientMixin):
    def __init__(self):
        self._init_client("CollectionPairsDB")

    async def create_pair(self, user_id: str, name: str, filters: dict[str, Any], text_query: str | None,
                          pl_collection_id: str, uk_collection_id: str) -> dict[str, Any]:
        try:
            response = (
                self.client.table("collection_pairs")
                .insert({"user_id": user_id, "name": name, "filters": filters, "text_query": text_query,
                         "pl_collection_id": pl_collection_id, "uk_collection_id": uk_collection_id})
                .execute()
            )
            return response.data[0]
        except PostgrestAPIError as e:
            logger.exception(f"Error creating collection pair: {e}")
            raise HTTPException(status_code=500, detail=f"Database error: {e!s}")

    async def list_pairs(self, user_id: str) -> list[dict[str, Any]]:
        response = (
            self.client.table("collection_pairs").select(_COLS)
            .eq("user_id", user_id).order("created_at", desc=True).execute()
        )
        return list(response.data or [])

    async def find_pair(self, pair_id: str, user_id: str) -> dict[str, Any] | None:
        response = (
            self.client.table("collection_pairs").select(_COLS)
            .eq("id", pair_id).eq("user_id", user_id).limit(1).execute()
        )
        return response.data[0] if response.data else None

    async def delete_pair(self, pair_id: str, user_id: str) -> bool:
        response = (
            self.client.table("collection_pairs").delete()
            .eq("id", pair_id).eq("user_id", user_id).execute()
        )
        return bool(response.data)

    async def pairs_by_collection(self, user_id: str) -> dict[str, dict[str, Any]]:
        """collection_id -> {id, name, role, partner_collection_id} for the user's pairs."""
        out: dict[str, dict[str, Any]] = {}
        for pair in await self.list_pairs(user_id):
            pl, uk = pair["pl_collection_id"], pair["uk_collection_id"]
            out[pl] = {"id": pair["id"], "name": pair["name"], "role": "PL", "partner_collection_id": uk}
            out[uk] = {"id": pair["id"], "name": pair["name"], "role": "UK", "partner_collection_id": pl}
        return out


_pairs_db: CollectionPairsDB | None = None


def get_collection_pairs_db() -> CollectionPairsDB:
    global _pairs_db
    if _pairs_db is None:
        try:
            _pairs_db = CollectionPairsDB()
        except ValueError as e:
            logger.error(f"Collection pairs database not configured: {e}")
            raise HTTPException(status_code=500, detail=f"Database configuration error: {e!s}")
    return _pairs_db
```
(Check `_base.py` for the exact `PostgrestAPIError` import used by `collections_db.py` and mirror it.)

- [ ] **Step 4: Implement the router**

`backend/app/collection_pairs.py`:

```python
"""PL/UK collection pairs: create both sides from one base-schema filter (Spec C AC3)."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Response
from juddges_search.db.collection_pairs_db import get_collection_pairs_db
from juddges_search.db.supabase_db import get_collections_db
from loguru import logger
from pydantic import BaseModel, Field

from app.compare.service import strip_ignored
from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.core.supabase import supabase_client
from app.models import validate_id_format
from app.services.audit_service import log_audit_background

router = APIRouter(prefix="/collections/pairs", tags=["collections"])

MAX_PAIR_SIDE = 5000
BULK_CHUNK = 1000
SIDES: tuple[str, ...] = ("PL", "UK")


class CreatePairRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    filters: dict[str, Any] = Field(default_factory=dict)
    text_query: str | None = None


class PairSide(BaseModel):
    jurisdiction: str
    collection_id: str
    document_count: int


class CollectionPair(BaseModel):
    id: str
    user_id: str
    name: str
    filters: dict[str, Any]
    text_query: str | None = None
    created_at: str
    sides: list[PairSide]


def _to_model(row: dict[str, Any], counts: dict[str, int] | None = None) -> CollectionPair:
    counts = counts or {}
    return CollectionPair(
        id=row["id"], user_id=row["user_id"], name=row["name"], filters=row.get("filters") or {},
        text_query=row.get("text_query"), created_at=row["created_at"],
        sides=[
            PairSide(jurisdiction="PL", collection_id=row["pl_collection_id"], document_count=counts.get("PL", 0)),
            PairSide(jurisdiction="UK", collection_id=row["uk_collection_id"], document_count=counts.get("UK", 0)),
        ],
    )


def _matching_ids(filters: dict[str, Any], text_query: str | None) -> dict[str, list[str]]:
    if not supabase_client:
        raise HTTPException(status_code=503, detail={"error": "Database Unavailable",
                                                     "message": "Database connection not available.",
                                                     "code": "DATABASE_UNAVAILABLE"})
    response = supabase_client.rpc(
        "list_extracted_filter_matches", {"p_filters": filters, "p_text_query": text_query}
    ).execute()
    ids: dict[str, list[str]] = {j: [] for j in SIDES}
    for row in response.data or []:
        if row["jurisdiction"] in ids:
            ids[row["jurisdiction"]].append(str(row["id"]))
    return ids


@router.post("", response_model=CollectionPair, status_code=201)
async def create_pair(
    request: CreatePairRequest,
    background_tasks: BackgroundTasks,
    collections_db=Depends(get_collections_db),
    pairs_db=Depends(get_collection_pairs_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    filters, _ignored = strip_ignored(request.filters)
    ids = _matching_ids(filters, request.text_query)
    too_large = [j for j, v in ids.items() if len(v) > MAX_PAIR_SIDE]
    if too_large:
        raise HTTPException(
            status_code=413,
            detail={"error": "Pair Too Large",
                    "message": f"{', '.join(too_large)} matched more than {MAX_PAIR_SIDE} judgments; narrow the filter.",
                    "code": "PAIR_SIDE_TOO_LARGE"},
        )

    description = f"Created from /compare · filter: {json.dumps(filters, ensure_ascii=False)[:900]}"
    created: dict[str, str] = {}
    for j in SIDES:
        collection = await collections_db.create_collection(user.id, f"{request.name} — {j}", description)
        created[j] = collection["id"]
        for start in range(0, len(ids[j]), BULK_CHUNK):
            await collections_db.bulk_add_documents(collection["id"], ids[j][start:start + BULK_CHUNK], user.id)

    row = await pairs_db.create_pair(user.id, request.name, filters, request.text_query, created["PL"], created["UK"])
    log_audit_background(background_tasks, user_id=user.id, action_type="collection_pair_created",
                         resource_type="collection_pair", resource_id=row["id"],
                         input_data={"pl": created["PL"], "uk": created["UK"]})
    logger.info("pair {} created: PL={} UK={}", row["id"], len(ids["PL"]), len(ids["UK"]))
    return _to_model(row, {j: len(ids[j]) for j in SIDES})


@router.get("", response_model=list[CollectionPair])
async def list_pairs(pairs_db=Depends(get_collection_pairs_db),
                     user: AuthenticatedUser = Depends(get_current_user)):
    return [_to_model(r) for r in await pairs_db.list_pairs(user.id)]


@router.get("/{pair_id}", response_model=CollectionPair)
async def get_pair(pair_id: str = Path(...), pairs_db=Depends(get_collection_pairs_db),
                   user: AuthenticatedUser = Depends(get_current_user)):
    try:
        pair_id = validate_id_format(pair_id, "pair_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    row = await pairs_db.find_pair(pair_id, user.id)
    if not row:
        raise HTTPException(404, "Collection pair not found")
    return _to_model(row)


@router.delete("/{pair_id}", status_code=204)
async def delete_pair(pair_id: str = Path(...), pairs_db=Depends(get_collection_pairs_db),
                      user: AuthenticatedUser = Depends(get_current_user)):
    if not await pairs_db.delete_pair(pair_id, user.id):
        raise HTTPException(404, "Collection pair not found")
    return Response(status_code=204)
```

`backend/app/server.py`: `from app.collection_pairs import router as collection_pairs_router` and insert `collection_pairs_router,` **immediately before** `collections_router,` in `API_KEY_PROTECTED_ROUTERS` (FastAPI matches in registration order; `/collections/{collection_id}` would otherwise capture `pairs`). Add a comment saying so.

`audit_service.log_audit_background`: check its `action_type`/`resource_type` validation (grep `ALLOWED_ACTION_TYPES` or similar in `backend/app/services/audit_service.py`); if there is an allow-list, add `collection_pair_created` and `collection_pair` there.

- [ ] **Step 5: Run tests + lint + static contract**

```bash
cd backend && poetry run pytest tests/app/test_collection_pairs_router.py tests/app/test_collections_batch_cap.py tests/app/test_db_contract_static.py -q && poetry run ruff check app packages/juddges_search/juddges_search/db && poetry run ruff format --check app packages/juddges_search/juddges_search/db
```
Expected: PASS (`collection_pairs` table declared by migration 3; `list_extracted_filter_matches` by migration 1).

- [ ] **Step 6: Commit**

```bash
git add backend/app/collection_pairs.py backend/app/server.py backend/packages/juddges_search/juddges_search/db/collection_pairs_db.py backend/tests/app/test_collection_pairs_router.py backend/app/services/audit_service.py
git commit -m "feat(api): /collections/pairs — PL/UK pair from one filter

Refs #<C>"
```

---

### Task 10: `GET /collections` exposes the pair

**Files:**
- Modify: `backend/app/collections.py:23-25` (`CollectionWithDocuments`), `:47-69` (`transform_collection`), `:72-78` (`list_collections`)
- Test: `backend/tests/app/test_collections_pair_field.py`

**Interfaces:**
- Produces: `CollectionWithDocuments.pair: CollectionPairRef | None` where `class CollectionPairRef(BaseModel): id: str; name: str; role: Literal["PL","UK"]; partner_collection_id: str`. `transform_collection(data, pair=None)`.

- [ ] **Step 1: Write the failing test**

`backend/tests/app/test_collections_pair_field.py`:

```python
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.collection_pairs import get_collection_pairs_db
from app.core.auth_jwt import AuthenticatedUser, get_current_user as jwt_get_current_user
from app.server import app
from juddges_search.db.supabase_db import get_collections_db

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.collections]

USER = "22222222-2222-4222-8222-222222222222"
_ROW = {"user_id": USER, "description": None,
        "created_at": "2026-09-21T00:00:00Z", "updated_at": "2026-09-21T00:00:00Z"}


class _Cols:
    async def get_user_collections(self, user_id):
        return [
            {**_ROW, "id": "c-pl", "name": "Q — PL", "collection_judgments": [{"judgment_id": "a"}], "document_count": 1},
            {**_ROW, "id": "c-uk", "name": "Q — UK", "collection_judgments": [], "document_count": 0},
            {**_ROW, "id": "c-solo", "name": "solo", "collection_judgments": [], "document_count": 0},
        ]


class _Pairs:
    async def pairs_by_collection(self, user_id):
        return {
            "c-pl": {"id": "p1", "name": "Q", "role": "PL", "partner_collection_id": "c-uk"},
            "c-uk": {"id": "p1", "name": "Q", "role": "UK", "partner_collection_id": "c-pl"},
        }


async def test_list_collections_marks_paired_collections():
    async def _user():
        return AuthenticatedUser(user_data={"id": USER, "email": "u@x.test", "role": "authenticated"}, access_token="t")

    app.dependency_overrides[jwt_get_current_user] = _user
    app.dependency_overrides[get_collections_db] = lambda: _Cols()
    app.dependency_overrides[get_collection_pairs_db] = lambda: _Pairs()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                               headers={"X-API-Key": "test-api-key-12345"}) as ac:
            response = await ac.get("/collections")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    by_id = {c["id"]: c for c in response.json()}
    assert by_id["c-pl"]["pair"] == {"id": "p1", "name": "Q", "role": "PL", "partner_collection_id": "c-uk"}
    assert by_id["c-uk"]["pair"]["role"] == "UK"
    assert by_id["c-solo"]["pair"] is None
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_collections_pair_field.py -q
```
Expected: FAIL — `KeyError: 'pair'`.

- [ ] **Step 3: Implement**

In `backend/app/collections.py`:

```python
from typing import Literal

from juddges_search.db.collection_pairs_db import get_collection_pairs_db


class CollectionPairRef(BaseModel):
    id: str
    name: str
    role: Literal["PL", "UK"]
    partner_collection_id: str


class CollectionWithDocuments(Collection):
    documents: list[str] = []
    document_count: int = 0
    pair: CollectionPairRef | None = None
```

`transform_collection(data, pair: dict | None = None)` → add `pair=CollectionPairRef(**pair) if pair else None` to the constructor call.

```python
@router.get("", response_model=list[CollectionWithDocuments])
async def list_collections(
    db=Depends(get_collections_db),
    pairs_db=Depends(get_collection_pairs_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    collections = await db.get_user_collections(user.id)
    pairs = await pairs_db.pairs_by_collection(user.id)
    return [transform_collection(c, pairs.get(c["id"])) for c in collections]
```

- [ ] **Step 4: Run tests**

```bash
cd backend && poetry run pytest tests/app/test_collections_pair_field.py tests/app/test_collections_batch_cap.py tests/app/test_collections_bearer_auth.py -q && poetry run ruff check app/collections.py
```
Expected: PASS. If `test_collections_bearer_auth.py` builds a client without overriding `get_collection_pairs_db` and now fails on `SUPABASE_URL`, override it there with a stub returning `{}` from `pairs_by_collection`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/collections.py backend/tests/app/test_collections_pair_field.py backend/tests/app/test_collections_bearer_auth.py
git commit -m "feat(api): GET /collections carries the PL/UK pair reference

Refs #<C>"
```

---

### Task 11: Pair view — `GET /compare/pairs/{pair_id}` (base fields over membership + extension-schema fields)

**Files:**
- Create: `backend/app/compare/schema_tally.py`
- Modify: `backend/app/compare/router.py` (add endpoint), `backend/app/compare/service.py` (add `compare_collections`)
- Test: `backend/tests/app/test_compare_pair_view.py`

**Interfaces:**
- Consumes: `collection_pairs` row (Task 9 `find_pair`), `extraction_jobs` rows (`id, collection_id, schema_id, status, results, completed_at`; `results = [{document_id, status, extracted_data}]`, `status = 'SUCCESS'`), `extraction_schemas.text` (JSON Schema), `comparable_fields_from_schema` (Task 5), `build_field` (Task 4).
- Produces:
  ```python
  # service.py
  CompareService.compare_collections(self, pl_collection_id: str, uk_collection_id: str, specs) -> CompareResponse
      # = compare({"collection_ids": [pl, uk]}, None, specs)
  # schema_tally.py
  def tally_schema_fields(results_by_jurisdiction: dict[str, list[dict]], specs: list[FieldSpec]) -> list[CompareField]
  def latest_success_jobs(client, collection_ids: list[str]) -> list[dict]   # one job per collection: newest SUCCESS
  ```
  Endpoint `GET /compare/pairs/{pair_id}` → `CompareResponse` with `pair: PairSummary`, `fields = base fields + schema fields` (schema fields only when both sides have a SUCCESS job with the **same** `schema_id`; `source = f"schema:{schema_id}"`).

- [ ] **Step 1: Write the failing tests**

`backend/tests/app/test_compare_pair_view.py`:

```python
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.compare.fields import FieldSpec
from app.compare.schema_tally import tally_schema_fields

pytestmark = [pytest.mark.unit]


def _results(*items):
    return [{"document_id": f"d{i}", "status": "completed", "extracted_data": data}
            for i, data in enumerate(items)]


def test_tally_counts_enum_boolean_and_array_values_with_coverage():
    specs = [FieldSpec("verdict", "Verdict", "enum", source="schema:s1"),
             FieldSpec("appealed", "Appealed", "boolean", source="schema:s1"),
             FieldSpec("grounds", "Grounds", "enum_array", source="schema:s1")]
    fields = tally_schema_fields(
        {"PL": _results({"verdict": "guilty", "appealed": True, "grounds": ["a", "b"]},
                        {"verdict": "", "appealed": None, "grounds": []}),
         "UK": _results({"verdict": "acquitted", "appealed": False, "grounds": ["a"]})},
        specs,
    )
    verdict, appealed, grounds = fields
    assert verdict.coverage["PL"].covered == 1 and verdict.coverage["PL"].total == 2
    assert verdict.coverage["UK"].covered == 1 and verdict.coverage["UK"].total == 1
    assert {v.value: v.counts for v in verdict.values} == {"guilty": {"PL": 1, "UK": 0},
                                                            "acquitted": {"PL": 0, "UK": 1}}
    assert {v.value: v.counts for v in appealed.values} == {"true": {"PL": 1, "UK": 0}, "false": {"PL": 0, "UK": 1}}
    assert {v.value: v.counts for v in grounds.values} == {"a": {"PL": 1, "UK": 1}, "b": {"PL": 1, "UK": 0}}
    assert grounds.coverage["PL"].covered == 1  # the empty list is not covered
    assert verdict.source == "schema:s1"


def test_tally_skips_failed_documents():
    fields = tally_schema_fields(
        {"PL": [{"document_id": "x", "status": "failed", "extracted_data": {"verdict": "guilty"}}], "UK": []},
        [FieldSpec("verdict", "Verdict", "enum", source="schema:s1")],
    )
    assert fields[0].coverage["PL"].total == 0 and fields[0].tier == "empty"


@pytest.mark.anyio
async def test_pair_endpoint_merges_base_and_schema_fields(authenticated_client, mock_user):
    pair_row = {"id": "p1", "user_id": mock_user["id"], "name": "Q", "filters": {}, "text_query": None,
                "pl_collection_id": "c-pl", "uk_collection_id": "c-uk",
                "created_at": "2026-09-21T00:00:00Z", "updated_at": "2026-09-21T00:00:00Z"}

    class _Pairs:
        async def find_pair(self, pair_id, user_id):
            return pair_row if pair_id == "p1" else None

    fake = MagicMock()
    fake.rpc.return_value.execute.return_value = MagicMock(data=[
        {"jurisdiction": "PL", "value": "x", "count": 1, "total": 1, "covered": 1, "coverage": 1.0},
        {"jurisdiction": "UK", "value": "x", "count": 1, "total": 1, "covered": 1, "coverage": 1.0},
    ])
    jobs = [
        {"id": "j1", "collection_id": "c-pl", "schema_id": "s1", "status": "SUCCESS", "completed_at": "2026-09-20",
         "results": [{"document_id": "a", "status": "completed", "extracted_data": {"verdict": "guilty"}}]},
        {"id": "j2", "collection_id": "c-uk", "schema_id": "s1", "status": "SUCCESS", "completed_at": "2026-09-20",
         "results": [{"document_id": "b", "status": "completed", "extracted_data": {"verdict": "acquitted"}}]},
    ]
    schema = {"id": "s1", "text": {"properties": {"verdict": {"type": "string", "enum": ["guilty", "acquitted"]}}}}

    from app.collection_pairs import get_collection_pairs_db
    from app.server import app
    app.dependency_overrides[get_collection_pairs_db] = lambda: _Pairs()
    with patch("app.compare.router.supabase_client", fake), \
         patch("app.compare.router.latest_success_jobs", return_value=jobs), \
         patch("app.compare.router.load_schema", return_value=schema):
        response = await authenticated_client.get("/compare/pairs/p1")
        missing = await authenticated_client.get("/compare/pairs/nope")
    app.dependency_overrides.pop(get_collection_pairs_db, None)

    assert missing.status_code == 404
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["pair"] == {"id": "p1", "name": "Q", "pl_collection_id": "c-pl", "uk_collection_id": "c-uk"}
    assert body["filters"] == {"collection_ids": ["c-pl", "c-uk"]}
    sources = {f["source"] for f in body["fields"]}
    assert sources == {"base", "schema:s1"}
    verdict = next(f for f in body["fields"] if f["field"] == "verdict")
    assert {v["value"]: v["counts"] for v in verdict["values"]} == {"guilty": {"PL": 1, "UK": 0}, "acquitted": {"PL": 0, "UK": 1}}
    # base fields were computed over the pair's membership
    assert fake.rpc.call_args_list[0].args[1]["p_filters"] == {"collection_ids": ["c-pl", "c-uk"]}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_compare_pair_view.py -q
```
Expected: FAIL — `app.compare.schema_tally` not found.

- [ ] **Step 3: Implement**

`backend/app/compare/schema_tally.py`:

```python
"""Side-by-side counts for an extension schema, from extraction_jobs.results (Spec C AC4).

Extension-schema results are JSONB per job, not typed columns, so this is a
Python tally. Coverage uses the same "filled" rule as the SQL: non-empty string,
non-empty list, non-null boolean.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.compare.fields import FieldSpec
from app.compare.layout import JURISDICTIONS, build_field, coverage_ratio
from app.compare.models import CompareField, CoverageStat

_OK_STATUSES = {"completed", "success", "partially_completed"}


def _filled(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() != ""
    if isinstance(value, list):
        return any(_filled(v) for v in value)
    return True


def _values_of(value: Any, kind: str) -> list[str]:
    if kind == "boolean":
        return ["true" if value else "false"]
    if kind == "enum_array":
        return [str(v) for v in value if _filled(v)] if isinstance(value, list) else [str(value)]
    return [str(value)]


def tally_schema_fields(
    results_by_jurisdiction: dict[str, list[dict[str, Any]]],
    specs: list[FieldSpec],
) -> list[CompareField]:
    fields: list[CompareField] = []
    for spec in specs:
        coverage: dict[str, CoverageStat] = {}
        counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for j in JURISDICTIONS:
            total = covered = 0
            for result in results_by_jurisdiction.get(j, []):
                if str(result.get("status", "")).lower() not in _OK_STATUSES:
                    continue
                total += 1
                value = (result.get("extracted_data") or {}).get(spec.field)
                if not _filled(value):
                    continue
                covered += 1
                for v in _values_of(value, spec.kind):
                    counts[j][v] += 1
            coverage[j] = CoverageStat(covered=covered, total=total, ratio=coverage_ratio(covered, total))
        fields.append(build_field(spec, coverage, {j: dict(c) for j, c in counts.items()}))
    return fields


def latest_success_jobs(client, collection_ids: list[str]) -> list[dict[str, Any]]:
    """Newest SUCCESS job per collection (one row each)."""
    response = (
        client.table("extraction_jobs")
        .select("id, collection_id, schema_id, status, results, completed_at")
        .in_("collection_id", collection_ids)
        .eq("status", "SUCCESS")
        .order("completed_at", desc=True)
        .execute()
    )
    newest: dict[str, dict[str, Any]] = {}
    for row in response.data or []:
        newest.setdefault(row["collection_id"], row)
    return list(newest.values())


def load_schema(client, schema_id: str) -> dict[str, Any] | None:
    response = client.table("extraction_schemas").select("id, name, text").eq("id", schema_id).limit(1).execute()
    return response.data[0] if response.data else None
```

In `backend/app/compare/service.py` add:

```python
    def compare_collections(self, pl_collection_id: str, uk_collection_id: str, specs: list[FieldSpec]) -> CompareResponse:
        """Base fields over the pair's actual membership; jurisdiction split comes from the rows."""
        return self.compare({"collection_ids": [pl_collection_id, uk_collection_id]}, None, specs)
```

In `backend/app/compare/router.py` add:

```python
from juddges_search.db.collection_pairs_db import get_collection_pairs_db

from app.compare.fields import base_compare_fields, comparable_fields_from_schema
from app.compare.models import PairSummary
from app.compare.schema_tally import latest_success_jobs, load_schema, tally_schema_fields


@router.get("/pairs/{pair_id}", response_model=CompareResponse,
            summary="Comparison of a saved PL/UK collection pair (base + extension schema fields)")
async def compare_pair(
    pair_id: str,
    pairs_db=Depends(get_collection_pairs_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> CompareResponse:
    client = _require_db()
    pair = await pairs_db.find_pair(pair_id, user.id)
    if not pair:
        raise HTTPException(404, "Collection pair not found")
    pl_id, uk_id = pair["pl_collection_id"], pair["uk_collection_id"]

    response = CompareService(client).compare_collections(pl_id, uk_id, base_compare_fields())

    jobs = {j["collection_id"]: j for j in latest_success_jobs(client, [pl_id, uk_id])}
    pl_job, uk_job = jobs.get(pl_id), jobs.get(uk_id)
    if pl_job and uk_job and pl_job.get("schema_id") and pl_job["schema_id"] == uk_job["schema_id"]:
        schema = load_schema(client, pl_job["schema_id"])
        if schema and isinstance(schema.get("text"), dict):
            specs = comparable_fields_from_schema(schema["text"], source=f"schema:{schema['id']}")
            response.fields.extend(tally_schema_fields(
                {"PL": pl_job.get("results") or [], "UK": uk_job.get("results") or []}, specs))

    response.pair = PairSummary(id=pair["id"], name=pair["name"], pl_collection_id=pl_id, uk_collection_id=uk_id)
    return response
```

- [ ] **Step 4: Run tests + lint + static contract**

```bash
cd backend && poetry run pytest tests/app/test_compare_pair_view.py tests/app/test_compare_router.py tests/app/test_db_contract_static.py -q && poetry run ruff check app/compare && poetry run ruff format --check app/compare
```
Expected: PASS (`extraction_jobs`, `extraction_schemas` tables are declared by migrations; the static test also verifies the `.select(...)` column names exist for `.table()` calls — keep them to real columns).

- [ ] **Step 5: Commit**

```bash
git add backend/app/compare backend/tests/app/test_compare_pair_view.py
git commit -m "feat(api): GET /compare/pairs/{id} with extension-schema fields

Refs #<C>"
```

---

### Task 12: Promote `BivariateBarChart` to `components/charts/` (+ `yTickSuffix`)

**Files:**
- Create: `frontend/components/charts/BivariateBarChart.tsx` (moved from `frontend/app/dataset-comparison/_components/BivariateBarChart.tsx`)
- Modify: `frontend/app/dataset-comparison/_components/BivariateBarChart.tsx` → one-line re-export
- Test: `frontend/tests/unit/components/charts/bivariate-bar-chart.test.tsx`

**Interfaces:**
- Produces: `export interface BivariateBarChartProps { categories: Array<string|number>; ukData: number[]; plData: number[]; ukName?; plName?; xAxisTitle?; yAxisTitle?; height?; tickAngle?; dtick?: number|string; showCounts?: boolean; yTickSuffix?: string; hoverTemplate?: string }` and `export function BivariateBarChart(props)` (+ default export). Existing callers unchanged.

- [ ] **Step 1: Write the failing test**

`frontend/tests/unit/components/charts/bivariate-bar-chart.test.tsx`:

```tsx
/**
 * BivariateBarChart is the shared PL/UK grouped-bar figure. Plotly is
 * dynamically imported and useless under jsdom, so the dynamic loader is
 * mocked with a probe that dumps the props it receives.
 */
import { render, screen } from '@testing-library/react';

jest.mock('next/dynamic', () => () => {
  const Probe = (props: Record<string, unknown>) => (
    <pre data-testid="plot">{JSON.stringify({ data: props.data, layout: props.layout })}</pre>
  );
  Probe.displayName = 'PlotProbe';
  return Probe;
});

import { BivariateBarChart } from '@/components/charts/BivariateBarChart';
import { editorialSeries } from '@/lib/charts/editorial-plot';

function plotProps() {
  return JSON.parse(screen.getByTestId('plot').textContent ?? '{}');
}

describe('BivariateBarChart', () => {
  it('renders one UK trace and one PL trace with editorial colours', () => {
    render(<BivariateBarChart categories={['a', 'b']} ukData={[1, 2]} plData={[3, 4]} />);
    const { data } = plotProps();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('UK');
    expect(data[0].marker.color).toBe(editorialSeries.uk);
    expect(data[1].name).toBe('Poland');
    expect(data[1].marker.color).toBe(editorialSeries.pl);
  });

  it('applies yTickSuffix and hoverTemplate for percentage charts', () => {
    render(
      <BivariateBarChart
        categories={['a']} ukData={[50]} plData={[25]}
        yTickSuffix="%" hoverTemplate="%{y:.1f}%<extra>%{fullData.name}</extra>"
      />,
    );
    const { data, layout } = plotProps();
    expect(layout.yaxis.ticksuffix).toBe('%');
    expect(data[0].hovertemplate).toContain('%{y:.1f}%');
  });

  it('is still importable from the dataset-comparison private folder', async () => {
    const legacy = await import('@/app/dataset-comparison/_components/BivariateBarChart');
    expect(legacy.BivariateBarChart).toBe(BivariateBarChart);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest tests/unit/components/charts/bivariate-bar-chart.test.tsx
```
Expected: FAIL — cannot resolve `@/components/charts/BivariateBarChart`.

- [ ] **Step 3: Move and extend**

```bash
mkdir -p frontend/components/charts
git mv frontend/app/dataset-comparison/_components/BivariateBarChart.tsx frontend/components/charts/BivariateBarChart.tsx
```

Edit `frontend/components/charts/BivariateBarChart.tsx`: export the props interface (`export interface BivariateBarChartProps`), add

```ts
  /** Suffix for Y tick labels, e.g. "%" for share charts. */
  yTickSuffix?: string;
  /** Plotly hovertemplate applied to both traces. */
  hoverTemplate?: string;
```
and pass them through: on each trace `...(hoverTemplate ? { hovertemplate: hoverTemplate } : {})`; in layout `yaxis: { ...editorialPlotLayout.yaxis, title: { text: yAxisTitle }, ...(yTickSuffix ? { ticksuffix: yTickSuffix } : {}) }` (keep the existing merge pattern used in the file — read it first; only add the two spreads).

Create `frontend/app/dataset-comparison/_components/BivariateBarChart.tsx`:

```ts
// Moved to the shared charts folder; kept so the static page's imports stay valid.
export { BivariateBarChart as default, BivariateBarChart } from '@/components/charts/BivariateBarChart';
export type { BivariateBarChartProps } from '@/components/charts/BivariateBarChart';
```

- [ ] **Step 4: Run tests + typecheck**

```bash
cd frontend && npx jest tests/unit/components/charts/bivariate-bar-chart.test.tsx && npm run typecheck
```
Expected: PASS; `app/dataset-comparison/page.tsx` still compiles.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/charts/BivariateBarChart.tsx frontend/app/dataset-comparison/_components/BivariateBarChart.tsx frontend/tests/unit/components/charts/bivariate-bar-chart.test.tsx
git commit -m "refactor(charts): share BivariateBarChart; add yTickSuffix/hoverTemplate

Refs #<C>"
```

---

### Task 13: `lib/compare` — types, API hooks, chart-data transform, permalink

**Files:**
- Create: `frontend/lib/compare/types.ts`, `frontend/lib/compare/api.ts`, `frontend/lib/compare/chart-data.ts`, `frontend/lib/compare/permalink.ts`
- Test: `frontend/tests/unit/lib/compare/chart-data.test.ts`, `frontend/tests/unit/lib/compare/permalink.test.ts`

**Interfaces:**
- `types.ts` mirrors Task 4 models:
  ```ts
  export type Jurisdiction = 'PL' | 'UK';
  export type Tier = 'primary' | 'partial' | 'unavailable' | 'empty';
  export interface CoverageStat { covered: number; total: number; ratio: number | null }
  export interface CompareValue { value: string; counts: Record<string, number>; shares: Record<string, number | null> }
  export interface CompareField { field: string; label: string; source: string; kind: 'enum'|'enum_array'|'boolean'; coverage: Record<string, CoverageStat>; tier: Tier; missing_in: string[]; values: CompareValue[] }
  export interface PairSummary { id: string; name: string; pl_collection_id: string; uk_collection_id: string }
  export interface CompareResponse { jurisdictions: string[]; totals: Record<string, number>; fields: CompareField[]; ignored_filter_keys: string[]; filters: BaseSchemaFilters; text_query: string | null; pair: PairSummary | null }
  export interface CompareRequest { filters: BaseSchemaFilters; text_query?: string | null; fields?: string[] }
  export interface CollectionPair { id: string; user_id: string; name: string; filters: BaseSchemaFilters; text_query: string | null; created_at: string; sides: { jurisdiction: Jurisdiction; collection_id: string; document_count: number }[] }
  ```
- `api.ts`: `fetchCompare(req, signal?)`, `useCompare(req, enabled)` (`queryKey: ['compare', req]`, `staleTime: 60_000`), `fetchComparePair(pairId, signal?)`, `useComparePair(pairId)`, `createCollectionPair({name, filters, text_query}) → CollectionPair`, `downloadCompareCsv(req)` (POST `/api/compare/export`, `blob` → anchor click with the `Content-Disposition` filename).
- `chart-data.ts`: `toShareChart(field, labelOf) → { categories: string[]; plData: number[]; ukData: number[] }` (percent 0–100, one decimal) and `formatCoverage(stat) → 'PL 76 % (153/200)'`-style pieces: `coveragePercent(stat) → number | null`.
- `permalink.ts`: `buildComparePermalink(filters, textQuery, origin?) → string` using `encodeFilters` from `@/lib/extractions/use-extracted-data-filters`; `buildPairPermalink(pairId, origin?)`.

- [ ] **Step 1: Write the failing tests**

`frontend/tests/unit/lib/compare/chart-data.test.ts`:

```ts
import { coveragePercent, toShareChart } from '@/lib/compare/chart-data';
import type { CompareField } from '@/lib/compare/types';

const field: CompareField = {
  field: 'appeal_outcome', label: 'Appeal Outcome', source: 'base', kind: 'enum_array',
  coverage: { PL: { covered: 153, total: 200, ratio: 0.765 }, UK: { covered: 198, total: 200, ratio: 0.99 } },
  tier: 'partial', missing_in: [],
  values: [
    { value: 'outcome_dismissed_or_refused', counts: { PL: 100, UK: 99 }, shares: { PL: 0.6536, UK: 0.5 } },
    { value: 'outcome_other', counts: { PL: 0, UK: 5 }, shares: { PL: 0, UK: 0.0253 } },
  ],
};

describe('toShareChart', () => {
  it('turns shares into percentages with human labels, keeping backend order', () => {
    const chart = toShareChart(field, (f, v) => `${f}:${v}`);
    expect(chart.categories).toEqual(['appeal_outcome:outcome_dismissed_or_refused', 'appeal_outcome:outcome_other']);
    expect(chart.plData).toEqual([65.4, 0]);
    expect(chart.ukData).toEqual([50, 2.5]);
  });

  it('maps a null share to 0 so Plotly draws no bar rather than NaN', () => {
    const chart = toShareChart({ ...field, values: [{ value: 'x', counts: { PL: 0, UK: 1 }, shares: { PL: null, UK: 1 } }] }, (_f, v) => v);
    expect(chart.plData).toEqual([0]);
  });
});

describe('coveragePercent', () => {
  it('rounds to a whole percent and passes null through', () => {
    expect(coveragePercent({ covered: 153, total: 200, ratio: 0.765 })).toBe(77);
    expect(coveragePercent({ covered: 0, total: 0, ratio: null })).toBeNull();
  });
});
```

`frontend/tests/unit/lib/compare/permalink.test.ts`:

```ts
import { buildComparePermalink, buildPairPermalink } from '@/lib/compare/permalink';
import { decodeFilters } from '@/lib/extractions/use-extracted-data-filters';

describe('compare permalinks', () => {
  it('encodes filters with the same blob /search/extractions uses', () => {
    const url = new URL(buildComparePermalink({ appellant: ['offender'] }, 'fraud', 'https://juddges.com'));
    expect(url.pathname).toBe('/compare');
    expect(url.searchParams.get('q')).toBe('fraud');
    expect(decodeFilters(url.searchParams.get('f'))).toEqual({ appellant: ['offender'] });
  });

  it('omits empty params', () => {
    expect(buildComparePermalink({}, '', 'https://juddges.com')).toBe('https://juddges.com/compare');
  });

  it('builds the pair permalink', () => {
    expect(buildPairPermalink('p1', 'https://juddges.com')).toBe('https://juddges.com/compare/p1');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest tests/unit/lib/compare
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`frontend/lib/compare/types.ts`: the interfaces listed above (import `BaseSchemaFilters` from `@/types/base-schema-filter`).

`frontend/lib/compare/chart-data.ts`:

```ts
import type { CompareField, CoverageStat } from './types';

const pct = (share: number | null | undefined) => (share == null ? 0 : Math.round(share * 1000) / 10);

/** Grouped-bar input: one category per value, share as percent (0–100, one decimal). */
export function toShareChart(
  field: CompareField,
  labelOf: (field: string, value: string) => string,
): { categories: string[]; plData: number[]; ukData: number[] } {
  return {
    categories: field.values.map((v) => labelOf(field.field, v.value)),
    plData: field.values.map((v) => pct(v.shares.PL)),
    ukData: field.values.map((v) => pct(v.shares.UK)),
  };
}

export function coveragePercent(stat: CoverageStat): number | null {
  return stat.ratio == null ? null : Math.round(stat.ratio * 100);
}
```

`frontend/lib/compare/permalink.ts`:

```ts
import { encodeFilters } from '@/lib/extractions/use-extracted-data-filters';
import type { BaseSchemaFilters } from '@/types/base-schema-filter';

function base(origin?: string): string {
  return origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
}

/** `/compare?f=<blob>&q=<text>` — same params as /search/extractions, so links are portable. */
export function buildComparePermalink(filters: BaseSchemaFilters, textQuery: string, origin?: string): string {
  const params = new URLSearchParams();
  const blob = encodeFilters(filters);
  if (blob) params.set('f', blob);
  if (textQuery.trim()) params.set('q', textQuery.trim());
  const qs = params.toString();
  return `${base(origin)}/compare${qs ? `?${qs}` : ''}`;
}

export function buildPairPermalink(pairId: string, origin?: string): string {
  return `${base(origin)}/compare/${encodeURIComponent(pairId)}`;
}
```

`frontend/lib/compare/api.ts` (pattern: `frontend/lib/extractions/base-schema-filter-api.ts:60-80`):

```ts
'use client';

import { useQuery } from '@tanstack/react-query';

import type { CollectionPair, CompareRequest, CompareResponse } from './types';

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchCompare(req: CompareRequest, signal?: AbortSignal) {
  return postJson<CompareResponse>('/api/compare/facets', req, signal);
}

export function useCompare(req: CompareRequest, enabled: boolean) {
  return useQuery({
    queryKey: ['compare', req],
    queryFn: ({ signal }) => fetchCompare(req, signal),
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export async function fetchComparePair(pairId: string, signal?: AbortSignal): Promise<CompareResponse> {
  const res = await fetch(`/api/compare/pairs/${encodeURIComponent(pairId)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useComparePair(pairId: string) {
  return useQuery({ queryKey: ['compare-pair', pairId], queryFn: ({ signal }) => fetchComparePair(pairId, signal), staleTime: 60_000 });
}

export function createCollectionPair(body: { name: string; filters: CompareRequest['filters']; text_query: string | null }) {
  return postJson<CollectionPair>('/api/collections/pairs', body);
}

export async function downloadCompareCsv(req: CompareRequest): Promise<void> {
  const res = await fetch('/api/compare/export', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'compare.csv';
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
cd frontend && npx jest tests/unit/lib/compare && npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/compare frontend/tests/unit/lib/compare
git commit -m "feat(compare): client types, hooks, share transform, permalink

Refs #<C>"
```

---

### Task 14: BFF proxy routes

**Files:**
- Create: `frontend/app/api/compare/facets/route.ts` (POST), `frontend/app/api/compare/export/route.ts` (POST, streams bytes), `frontend/app/api/compare/pairs/[pairId]/route.ts` (GET), `frontend/app/api/collections/pairs/route.ts` (GET, POST), `frontend/app/api/collections/pairs/[pairId]/route.ts` (GET, DELETE)
- Test: `frontend/tests/unit/api/compare-bff.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`, `getBackendUrl` from `@/app/api/utils/backend-url`, `UnauthorizedError`/`AppError`/`ErrorCode` from `@/lib/errors`, `logger` from `@/lib/logger` — exactly as `frontend/app/api/extractions/base-schema/facets/[field]/route.ts`.
- Produces: same JSON passthrough; export route forwards `content-type`, `content-disposition`, `x-rows-count` headers and the raw body.

- [ ] **Step 1: Write the failing tests**

`frontend/tests/unit/api/compare-bff.test.ts` (pattern: `tests/unit/api/ai-bff-contracts.test.ts`):

```ts
/** @jest-environment node */
import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: mockGetUser, getSession: mockGetSession } })),
}));
jest.mock('@/lib/logger', () => ({ __esModule: true, default: { child: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }) } }));

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function signedIn() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.API_BASE_URL = 'http://backend.test';
  process.env.BACKEND_API_KEY = 'k';
});

describe('POST /api/compare/facets', () => {
  it('rejects anonymous callers before touching the backend', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import('@/app/api/compare/facets/route');
    const res = await POST(new NextRequest('http://x/api/compare/facets', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the body with API key and bearer', async () => {
    signedIn();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ totals: { PL: 1, UK: 2 } }), { status: 200 }));
    const { POST } = await import('@/app/api/compare/facets/route');
    const res = await POST(new NextRequest('http://x/api/compare/facets', {
      method: 'POST', body: JSON.stringify({ filters: { appellant: ['offender'] }, fields: ['appellant'] }),
    }));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://backend.test/compare/facets');
    expect(init.headers['X-API-Key']).toBe('k');
    expect(init.headers.Authorization).toBe('Bearer jwt');
    expect(JSON.parse(init.body)).toEqual({ filters: { appellant: ['offender'] }, text_query: null, fields: ['appellant'] });
  });
});

describe('POST /api/compare/export', () => {
  it('streams the CSV with its headers', async () => {
    signedIn();
    fetchMock.mockResolvedValue(new Response('﻿field,value\n', {
      status: 200,
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="compare_2026-09-21.csv"', 'x-rows-count': '1' },
    }));
    const { POST } = await import('@/app/api/compare/export/route');
    const res = await POST(new NextRequest('http://x/api/compare/export', { method: 'POST', body: '{"filters":{}}' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('compare_2026-09-21.csv');
    expect(res.headers.get('x-rows-count')).toBe('1');
    expect(await res.text()).toContain('field,value');
  });
});

describe('/api/collections/pairs', () => {
  it('POST forwards to the backend pairs route', async () => {
    signedIn();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'p1' }), { status: 201 }));
    const { POST } = await import('@/app/api/collections/pairs/route');
    const res = await POST(new NextRequest('http://x/api/collections/pairs', {
      method: 'POST', body: JSON.stringify({ name: 'n', filters: {}, text_query: null }),
    }));
    expect(res.status).toBe(201);
    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/collections/pairs');
  });

  it('GET /api/compare/pairs/[pairId] passes the upstream status through', async () => {
    signedIn();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Collection pair not found' }), { status: 404 }));
    const { GET } = await import('@/app/api/compare/pairs/[pairId]/route');
    const res = await GET(new NextRequest('http://x/api/compare/pairs/p9'), { params: Promise.resolve({ pairId: 'p9' }) });
    expect(res.status).toBe(404);
    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/compare/pairs/p9');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest tests/unit/api/compare-bff.test.ts
```
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement the routes**

Each file follows `frontend/app/api/extractions/base-schema/facets/[field]/route.ts` verbatim in structure (requestId, `createClient()`, `getUser`, `getSession`, `UnauthorizedError`, `AppError` catch). Differences only:

`frontend/app/api/compare/facets/route.ts` — `POST(request: NextRequest)`; body parse:
```ts
const { filters = {}, text_query = null, fields } = await request.json();
const response = await fetch(`${API_BASE_URL}/compare/facets`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY, Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ filters, text_query, ...(fields ? { fields } : {}) }),
});
```
Logger child name `'compare-facets-api'`; error fallback code `"COMPARE_ERROR"`.

`frontend/app/api/compare/export/route.ts` — same auth; forward body unchanged; on success return the stream:
```ts
const headers = new Headers();
for (const h of ['content-type', 'content-disposition', 'x-rows-count']) {
  const v = response.headers.get(h);
  if (v) headers.set(h, v);
}
return new NextResponse(response.body, { status: 200, headers });
```

`frontend/app/api/compare/pairs/[pairId]/route.ts` — `GET(request, { params }: { params: Promise<{ pairId: string }> })` → `${API_BASE_URL}/compare/pairs/${encodeURIComponent(pairId)}`; on `!response.ok` return the upstream JSON with the upstream status (as the facets route does).

`frontend/app/api/collections/pairs/route.ts` — `GET` → `${API_BASE_URL}/collections/pairs`; `POST` → same URL, JSON body passthrough, return upstream status (`201`).

`frontend/app/api/collections/pairs/[pairId]/route.ts` — `GET` and `DELETE` (204 → `new NextResponse(null, { status: 204 })`).

- [ ] **Step 4: Run tests + lint**

```bash
cd frontend && npx jest tests/unit/api/compare-bff.test.ts && npm run lint && npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/compare frontend/app/api/collections/pairs frontend/tests/unit/api/compare-bff.test.ts
git commit -m "feat(bff): proxy routes for /compare and /collections/pairs

Refs #<C>"
```

---

### Task 15: i18n namespace `compare` + navigation key

**Files:**
- Modify: `frontend/lib/i18n/types.ts:108-183` (`NavigationTranslations`: add `compare: string;`), `:670-683` (`Translations`: add `compare: CompareTranslations;`), `:689-701` (`TranslationKey` union), new `export interface CompareTranslations`
- Modify: `frontend/lib/i18n/translations/en.ts`, `frontend/lib/i18n/translations/pl.ts`
- Test: `frontend/tests/unit/lib/i18n/compare-namespace.test.ts`

**Interfaces:**
- Produces keys (all `string`): `compare.pageTitle`, `pageSubtitle`, `emptyTitle`, `emptyBody`, `askQuestion`, `matching`, `matchingPl`, `matchingUk`, `shareAxis`, `coverageBadge` (`'coverage PL {{pl}} % / UK {{uk}} %'`), `sectionPrimary`, `sectionPartial`, `sectionUnavailable`, `unavailableOne` (`'{{field}} is not filled for {{jurisdiction}} documents in this result ({{covered}} of {{total}}).'`), `unavailableBoth`, `noMatchesTitle`, `noMatchesBody`, `jurisdictionIgnored`, `savePair`, `savePairTitle`, `savePairName`, `savePairHint` (`'Creates "{{name}} — PL" and "{{name}} — UK".'`), `savePairTooLarge`, `saved`, `openCollections`, `exportCsv`, `copyLink`, `linkCopied`, `pairEyebrow`, `pairSchemaSection`, `pairNoSchema`, `extractOnBoth`, `dataNote`; `navigation.compare`.

- [ ] **Step 1: Write the failing test**

`frontend/tests/unit/lib/i18n/compare-namespace.test.ts`:

```ts
import { en } from '@/lib/i18n/translations/en';
import { pl } from '@/lib/i18n/translations/pl';

describe('compare i18n namespace', () => {
  it('exists in both locales with identical keys', () => {
    expect(Object.keys(en.compare).sort()).toEqual(Object.keys(pl.compare).sort());
    expect(Object.keys(en.compare).length).toBeGreaterThanOrEqual(30);
  });

  it('keeps interpolation placeholders in sync', () => {
    for (const key of Object.keys(en.compare) as Array<keyof typeof en.compare>) {
      const holes = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
      expect(holes(pl.compare[key])).toEqual(holes(en.compare[key]));
    }
  });

  it('has the sidebar label', () => {
    expect(en.navigation.compare).toBe('Compare PL / UK');
    expect(pl.navigation.compare).toBe('Porównaj PL / UK');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest tests/unit/lib/i18n/compare-namespace.test.ts
```
Expected: FAIL — `en.compare` undefined.

- [ ] **Step 3: Add the namespace**

`types.ts`: `export interface CompareTranslations { pageTitle: string; pageSubtitle: string; … dataNote: string; }` (all keys from Interfaces), `compare: CompareTranslations;` in `Translations`, `` | `compare.${keyof CompareTranslations}` `` in `TranslationKey`, `compare: string;` in `NavigationTranslations` (under "Analysis section").

`en.ts` (`compare:` block; `navigation.compare: 'Compare PL / UK'`):

```ts
  compare: {
    pageTitle: 'Compare PL / UK',
    pageSubtitle: 'One research question, the same structured filter run for Polish and UK judgments, coded fields side by side.',
    emptyTitle: 'Ask a research question',
    emptyBody: 'Describe the cases in plain language or pick filters. Jurisdiction is always split here — leave it out.',
    askQuestion: 'Describe the cases',
    matching: 'Matching judgments',
    matchingPl: 'Poland',
    matchingUk: 'United Kingdom',
    shareAxis: '% of coded documents',
    coverageBadge: 'coverage PL {{pl}} % / UK {{uk}} %',
    sectionPrimary: 'Comparable fields',
    sectionPartial: 'Partial coverage — read with care',
    sectionUnavailable: 'Not available for one jurisdiction',
    unavailableOne: '{{field}} is not filled for {{jurisdiction}} documents in this result ({{covered}} of {{total}}).',
    unavailableBoth: '{{field}} is not filled for any matching document.',
    noMatchesTitle: 'Nothing matched',
    noMatchesBody: 'No completed judgment matches this filter in either jurisdiction. Loosen a condition.',
    jurisdictionIgnored: 'The jurisdiction condition was ignored — this page always shows PL and UK.',
    savePair: 'Save as collection pair',
    savePairTitle: 'Save both result sets',
    savePairName: 'Name',
    savePairHint: 'Creates "{{name}} — PL" and "{{name}} — UK".',
    savePairTooLarge: 'One side exceeds 5 000 judgments. Narrow the filter first.',
    saved: 'Pair saved',
    openCollections: 'Open collections',
    exportCsv: 'Export CSV',
    copyLink: 'Copy link',
    linkCopied: 'Link copied',
    pairEyebrow: 'Saved pair',
    pairSchemaSection: 'Extended schema fields',
    pairNoSchema: 'Run the same extraction schema on both collections to compare its fields here.',
    extractOnBoth: 'Extract on {{jurisdiction}} collection',
    dataNote: 'Shares are computed over documents where the field is coded. Coverage differs between jurisdictions; free-text topics are Polish-only and are not compared.',
  },
```

`pl.ts` — the same keys in Polish (`navigation.compare: 'Porównaj PL / UK'`), e.g. `coverageBadge: 'pokrycie PL {{pl}} % / UK {{uk}} %'`, `unavailableOne: 'Pole {{field}} nie jest wypełnione dla orzeczeń {{jurisdiction}} w tym wyniku ({{covered}} z {{total}}).'`, `savePair: 'Zapisz jako parę kolekcji'`, `savePairHint: 'Utworzy „{{name}} — PL” i „{{name}} — UK”.'`, `exportCsv: 'Eksportuj CSV'`, `copyLink: 'Kopiuj link'`, `dataNote: 'Udziały liczone są wśród dokumentów, w których pole zostało zakodowane. Pokrycie różni się między jurysdykcjami; tematy tekstowe są tylko polskie i nie są porównywane.'`.

- [ ] **Step 4: Run tests + typecheck**

```bash
cd frontend && npx jest tests/unit/lib/i18n && npm run typecheck
```
Expected: PASS (typecheck forces both locale objects to carry every key).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/i18n frontend/tests/unit/lib/i18n/compare-namespace.test.ts
git commit -m "feat(i18n): compare namespace (en, pl)

Refs #<C>"
```

---

### Task 16: `/compare` page — filter bar, totals, figures, coverage tiers, export

**Files:**
- Create: `frontend/lib/extractions/drawer-adapter.ts` (extracted from `frontend/app/search/extractions/page.tsx:35-120`)
- Modify: `frontend/app/search/extractions/page.tsx:35-120` → import the two functions
- Create: `frontend/app/compare/page.tsx`, `frontend/app/compare/_components/CompareContent.tsx`, `CompareFilterBar.tsx`, `CompareTotals.tsx`, `FieldComparisonFigure.tsx`, `CoverageBadge.tsx`, `UnavailableFields.tsx`, `ExportMenu.tsx`
- Test: `frontend/tests/unit/lib/extractions/drawer-adapter.test.ts`, `frontend/tests/unit/app/compare/compare-content.test.tsx`

**Interfaces:**
- `drawer-adapter.ts`: `export function toDrawerFilters(filters: BaseSchemaFilters): BaseFilters` and `export function applyDrawerChange(filters: BaseSchemaFilters, field: string, value: BaseFilterValue | undefined): BaseSchemaFilters` — bodies moved verbatim from the search page.
- `CompareContent` props: none (reads `useExtractedDataFilters()`); renders `CompareFilterBar`, then `CompareView`.
- `CompareView` (inside `CompareContent.tsx`, exported for tests): `{ data: CompareResponse; onSavePair?: () => void; request: CompareRequest }`.
- `CompareFilterBar`: `{ filters: BaseSchemaFilters; textQuery: string; onApply(filters, textQuery); onRemove(field); onClearText(); onClearAll(); onDrawerChange(field, value) }`.
- `CompareTotals`: `{ totals: Record<string, number> }` → `DualStatCard label={t('compare.matching')} ukValue plValue leftLabel="UK" rightLabel="PL"`.
- `FieldComparisonFigure`: `{ field: CompareField; index: number }` → `ChartFigure figure={String(index).padStart(2,'0')} eyebrow={field.source === 'base' ? 'Base schema' : 'Extended schema'} title={field.label} caption={<CoverageBadge …/> when tier==='partial'} source={…}` wrapping `BivariateBarChart` with `toShareChart(field, formatEnumOptionLabel)` (`@/lib/extractions/base-schema-filter-config`), `yAxisTitle={t('compare.shareAxis')}`, `yTickSuffix="%"`, `hoverTemplate="%{y:.1f}%<extra>%{fullData.name}</extra>"`, `showCounts`.
- `CoverageBadge`: `{ coverage: Record<string, CoverageStat> }` → `<Eyebrow tone="oxblood" noRule>{t('compare.coverageBadge', { pl, uk })}</Eyebrow>` with `coveragePercent`.
- `UnavailableFields`: `{ fields: CompareField[] }` → list of `t('compare.unavailableOne'|'unavailableBoth', …)` lines in a `bg-parchment-deep border border-rule` panel.
- `ExportMenu`: `{ request: CompareRequest; permalink: string }` → two `EditorialButton`s: CSV (`downloadCompareCsv`), copy link (`navigator.clipboard.writeText` → toast `t('compare.linkCopied')`).

- [ ] **Step 1: Failing test for the adapter extraction**

`frontend/tests/unit/lib/extractions/drawer-adapter.test.ts`:

```ts
import { applyDrawerChange, toDrawerFilters } from '@/lib/extractions/drawer-adapter';

describe('drawer adapter', () => {
  it('round-trips enum, boolean and numeric range filters', () => {
    const filters = {
      appellant: ['offender' as const],
      did_offender_confess: true,
      num_victims: { min: 1, max: 3 },
    };
    const drawer = toDrawerFilters(filters);
    expect(drawer.appellant).toEqual({ kind: 'enum_multi', values: ['offender'] });
    expect(drawer.did_offender_confess).toEqual({ kind: 'boolean_tri', value: true });
    expect(drawer.num_victims?.kind).toBe('numeric_range');
    expect(applyDrawerChange(filters, 'appellant', undefined)).toEqual({ did_offender_confess: true, num_victims: { min: 1, max: 3 } });
    expect(applyDrawerChange({}, 'appellant', { kind: 'enum_multi', values: ['other'] })).toEqual({ appellant: ['other'] });
  });
});
```

Run: `cd frontend && npx jest tests/unit/lib/extractions/drawer-adapter.test.ts` → FAIL (module missing).

- [ ] **Step 2: Extract the adapter**

Create `frontend/lib/extractions/drawer-adapter.ts` with the two functions cut from `frontend/app/search/extractions/page.tsx:35-120` (keep their bodies; add the imports they need: `BaseSchemaFilters` from `@/types/base-schema-filter`, `BaseFilters`, `BaseFilterValue` from `@/lib/store/searchStore`, `FILTER_FIELD_BY_NAME` if referenced). In the search page replace the local definitions with `import { applyDrawerChange, toDrawerFilters } from '@/lib/extractions/drawer-adapter';`. Adjust the test's expectations to what the moved code actually returns for `num_victims` if the range shape differs (read the code; the test must describe real behaviour, not invent it).

Run: `npx jest tests/unit/lib/extractions/drawer-adapter.test.ts tests/unit/lib/extractions && npm run typecheck` → PASS.

- [ ] **Step 3: Failing test for the compare view**

`frontend/tests/unit/app/compare/compare-content.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';

jest.mock('@/components/charts/BivariateBarChart', () => ({
  BivariateBarChart: (props: { categories: string[]; plData: number[]; ukData: number[] }) => (
    <div data-testid="bivariate" data-categories={props.categories.join('|')} data-pl={props.plData.join('|')} data-uk={props.ukData.join('|')} />
  ),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(' ')}` : key,
    locale: 'en',
  }),
}));
jest.mock('@/lib/compare/api', () => ({ downloadCompareCsv: jest.fn(), createCollectionPair: jest.fn() }));

import { CompareView } from '@/app/compare/_components/CompareContent';
import type { CompareResponse } from '@/lib/compare/types';

const data: CompareResponse = {
  jurisdictions: ['PL', 'UK'],
  totals: { PL: 812, UK: 430 },
  ignored_filter_keys: ['jurisdiction'],
  filters: { appellant: ['offender'] }, text_query: null, pair: null,
  fields: [
    { field: 'appeal_outcome', label: 'Appeal Outcome', source: 'base', kind: 'enum_array',
      coverage: { PL: { covered: 812, total: 812, ratio: 1 }, UK: { covered: 430, total: 430, ratio: 1 } },
      tier: 'primary', missing_in: [],
      values: [{ value: 'outcome_dismissed_or_refused', counts: { PL: 500, UK: 200 }, shares: { PL: 0.6158, UK: 0.4651 } }] },
    { field: 'sentence_serve', label: 'Sentence Type', source: 'base', kind: 'enum_array',
      coverage: { PL: { covered: 600, total: 812, ratio: 0.7389 }, UK: { covered: 420, total: 430, ratio: 0.9767 } },
      tier: 'partial', missing_in: [],
      values: [{ value: 'serve_concurrent', counts: { PL: 300, UK: 200 }, shares: { PL: 0.5, UK: 0.4762 } }] },
    { field: 'plea_point', label: 'Plea Point', source: 'base', kind: 'enum',
      coverage: { PL: { covered: 700, total: 812, ratio: 0.8621 }, UK: { covered: 0, total: 430, ratio: 0 } },
      tier: 'unavailable', missing_in: ['UK'], values: [] },
  ],
};

describe('CompareView', () => {
  beforeEach(() => render(<CompareView data={data} request={{ filters: data.filters, text_query: null }} />));

  it('shows N_PL and N_UK', () => {
    expect(screen.getByText('812')).toBeInTheDocument();
    expect(screen.getByText('430')).toBeInTheDocument();
  });

  it('renders primary fields as share charts in percent', () => {
    const charts = screen.getAllByTestId('bivariate');
    expect(charts[0]).toHaveAttribute('data-pl', '61.6');
    expect(charts[0]).toHaveAttribute('data-uk', '46.5');
  });

  it('badges partial-coverage fields and keeps them out of the first section', () => {
    expect(screen.getByText('compare.coverageBadge pl=74 uk=98')).toBeInTheDocument();
    const primary = screen.getByRole('region', { name: 'compare.sectionPrimary' });
    const partial = screen.getByRole('region', { name: 'compare.sectionPartial' });
    expect(primary).not.toHaveTextContent('Sentence Type');
    expect(partial).toHaveTextContent('Sentence Type');
  });

  it('hides zero-coverage fields behind a message instead of drawing 0', () => {
    expect(screen.getAllByTestId('bivariate')).toHaveLength(2);
    expect(screen.getByText('compare.unavailableOne field=Plea Point jurisdiction=UK covered=0 total=430')).toBeInTheDocument();
  });

  it('tells the user the jurisdiction condition was ignored', () => {
    expect(screen.getByText('compare.jurisdictionIgnored')).toBeInTheDocument();
  });
});
```

Run: `npx jest tests/unit/app/compare` → FAIL (module missing).

- [ ] **Step 4: Build the page and components**

`frontend/app/compare/page.tsx`:

```tsx
import { Suspense } from 'react';

import { CompareContent } from './_components/CompareContent';

export const metadata = { title: 'Compare PL / UK' };

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-ink-soft">…</div>}>
      <CompareContent />
    </Suspense>
  );
}
```

`frontend/app/compare/_components/CompareContent.tsx` (client):

```tsx
'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ChartFigure, DualStatCard, Eyebrow, Headline, Masthead, PaperBackground, Rule } from '@/components/editorial';
import { useTranslation } from '@/contexts/LanguageContext';
import { useCompare } from '@/lib/compare/api';
import { buildComparePermalink } from '@/lib/compare/permalink';
import type { CompareField, CompareRequest, CompareResponse } from '@/lib/compare/types';
import { applyDrawerChange } from '@/lib/extractions/drawer-adapter';
import { countActive, useExtractedDataFilters } from '@/lib/extractions/use-extracted-data-filters';

import { CompareFilterBar } from './CompareFilterBar';
import { CompareTotals } from './CompareTotals';
import { ExportMenu } from './ExportMenu';
import { FieldComparisonFigure } from './FieldComparisonFigure';
import { SavePairDialog } from './SavePairDialog';
import { UnavailableFields } from './UnavailableFields';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} role="region" className="space-y-6">
      <Eyebrow id={id} as="p">{title}</Eyebrow>
      {children}
    </section>
  );
}

export function CompareView({ data, request, onSavePair }: { data: CompareResponse; request: CompareRequest; onSavePair?: () => void }) {
  const { t } = useTranslation();
  const byTier = (tier: CompareField['tier']) => data.fields.filter((f) => f.tier === tier);
  const primary = byTier('primary');
  const partial = byTier('partial');
  const unavailable = [...byTier('unavailable'), ...byTier('empty')];
  const nothing = data.totals.PL === 0 && data.totals.UK === 0;
  let figure = 0;

  return (
    <div className="space-y-12">
      {data.ignored_filter_keys.includes('jurisdiction') && (
        <p className="border border-rule bg-parchment-deep px-3 py-2 text-xs text-ink">{t('compare.jurisdictionIgnored')}</p>
      )}
      <CompareTotals totals={data.totals} />
      <div className="flex flex-wrap gap-3">
        <ExportMenu request={request} permalink={buildComparePermalink(request.filters, request.text_query ?? '')} />
        {onSavePair && !nothing && (
          <button type="button" onClick={onSavePair} className="border border-ink px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-ink hover:bg-ink hover:text-parchment">
            {t('compare.savePair')}
          </button>
        )}
      </div>
      {nothing ? (
        <div className="border border-rule p-6">
          <Headline as="h2" size="sm">{t('compare.noMatchesTitle')}</Headline>
          <p className="mt-2 text-sm text-ink-soft">{t('compare.noMatchesBody')}</p>
        </div>
      ) : (
        <>
          {primary.length > 0 && (
            <Section id="compare-primary" title={t('compare.sectionPrimary')}>
              <div className="grid gap-8 lg:grid-cols-2">
                {primary.map((f) => <FieldComparisonFigure key={f.field} field={f} index={++figure} />)}
              </div>
            </Section>
          )}
          {partial.length > 0 && (
            <Section id="compare-partial" title={t('compare.sectionPartial')}>
              <div className="grid gap-8 lg:grid-cols-2">
                {partial.map((f) => <FieldComparisonFigure key={f.field} field={f} index={++figure} />)}
              </div>
            </Section>
          )}
          {unavailable.length > 0 && (
            <Section id="compare-unavailable" title={t('compare.sectionUnavailable')}>
              <UnavailableFields fields={unavailable} />
            </Section>
          )}
        </>
      )}
      <Rule spaced />
      <p className="text-xs text-ink-soft">{t('compare.dataNote')}</p>
    </div>
  );
}

export function CompareContent() {
  const { t } = useTranslation();
  const { filters, textQuery, setFilters, setTextQuery, removeFilter, clearAll } = useExtractedDataFilters();
  const [saveOpen, setSaveOpen] = useState(false);
  const active = countActive(filters) > 0 || textQuery.trim() !== '';
  const request = useMemo<CompareRequest>(() => ({ filters, text_query: textQuery.trim() || null }), [filters, textQuery]);
  const query = useCompare(request, active);

  return (
    <PaperBackground grain>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
        <Masthead badge={<Eyebrow noRule>PL · UK</Eyebrow>}>
          <Headline as="h1" size="lg">{t('compare.pageTitle')}</Headline>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">{t('compare.pageSubtitle')}</p>
        </Masthead>
        <CompareFilterBar
          filters={filters} textQuery={textQuery}
          onApply={(f, q) => { setFilters(f); setTextQuery(q); }}
          onRemove={removeFilter} onClearText={() => setTextQuery('')} onClearAll={clearAll}
          onDrawerChange={(field, value) => setFilters(applyDrawerChange(filters, field, value))}
        />
        {!active && (
          <div className="border border-rule p-8 text-center">
            <Headline as="h2" size="sm">{t('compare.emptyTitle')}</Headline>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{t('compare.emptyBody')}</p>
          </div>
        )}
        {query.isError && <p role="alert" className="text-sm text-oxblood">{String(query.error)}</p>}
        {query.data && <CompareView data={query.data} request={request} onSavePair={() => setSaveOpen(true)} />}
        <SavePairDialog open={saveOpen} onOpenChange={setSaveOpen} request={request}
          onSaved={(pair) => { toast.success(t('compare.saved')); setSaveOpen(false); window.location.assign(`/compare/${pair.id}`); }} />
      </div>
    </PaperBackground>
  );
}
```
(`SavePairDialog` is Task 17; for this task create a stub file exporting a component that renders `null`, replaced in Task 17.)

`CompareFilterBar.tsx`: composes `NlFilterDialog` (`@/components/search/NlFilterDialog`, `onApply`), `ActiveFilterChips` (`@/components/filters/extracted-search-filters`, props `filters, textQuery, onRemove, onClearText, onClearAll`), and a "Filters" toggle that mounts `BaseFiltersDrawer` (`@/components/search/BaseFiltersDrawer`) with `filters={toDrawerFilters(filters)} onChange={onDrawerChange} onReset={onClearAll} hideToggle defaultOpen`. Hide the `jurisdiction` control in the drawer if B added one (pass `filters` without the key).

`CompareTotals.tsx`:
```tsx
<DualStatCard label={t('compare.matching')} ukValue={totals.UK ?? 0} plValue={totals.PL ?? 0} leftLabel={t('compare.matchingUk')} rightLabel={t('compare.matchingPl')} />
```

`FieldComparisonFigure.tsx`, `CoverageBadge.tsx`, `UnavailableFields.tsx`, `ExportMenu.tsx`: as specified under Interfaces. `UnavailableFields` emits, per field, `missing_in.length === 2 ? t('compare.unavailableBoth', { field: label }) : t('compare.unavailableOne', { field: label, jurisdiction: missing_in[0], covered: coverage[missing_in[0]].covered, total: coverage[missing_in[0]].total })`.

- [ ] **Step 5: Run tests, lint, typecheck**

```bash
cd frontend && npx jest tests/unit/app/compare tests/unit/lib && npm run validate && npm run typecheck
```
Expected: PASS. `npm run validate` runs `lint:banned-classes` — no banned classes may appear in the new files.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/compare frontend/lib/extractions/drawer-adapter.ts frontend/app/search/extractions/page.tsx frontend/tests/unit/app/compare frontend/tests/unit/lib/extractions/drawer-adapter.test.ts
git commit -m "feat(compare): /compare page with side-by-side share charts and coverage tiers

Refs #<C>"
```

---

### Task 17: Save as collection pair (dialog)

**Files:**
- Modify: `frontend/app/compare/_components/SavePairDialog.tsx` (replace stub)
- Test: `frontend/tests/unit/app/compare/save-pair-dialog.test.tsx`

**Interfaces:**
- `SavePairDialog` props: `{ open: boolean; onOpenChange(open: boolean): void; request: CompareRequest; onSaved(pair: CollectionPair): void }`. Default name = `request.text_query` or a joined chip summary (`Object.keys(filters).join(', ')`), editable. Calls `createCollectionPair({ name, filters, text_query })`; 413 → `t('compare.savePairTooLarge')` inline error.

- [ ] **Step 1: Failing test**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/contexts/LanguageContext', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'en' }) }));
const createCollectionPair = jest.fn();
jest.mock('@/lib/compare/api', () => ({ createCollectionPair: (...a: unknown[]) => createCollectionPair(...a) }));

import { SavePairDialog } from '@/app/compare/_components/SavePairDialog';

describe('SavePairDialog', () => {
  it('pre-fills the name from the question and posts filters + text', async () => {
    createCollectionPair.mockResolvedValue({ id: 'p1', sides: [] });
    const onSaved = jest.fn();
    render(<SavePairDialog open onOpenChange={() => {}} onSaved={onSaved}
      request={{ filters: { appellant: ['offender'] }, text_query: 'fraud suspended' }} />);
    const input = screen.getByLabelText('compare.savePairName') as HTMLInputElement;
    expect(input.value).toBe('fraud suspended');
    fireEvent.change(input, { target: { value: 'Fraud' } });
    fireEvent.click(screen.getByRole('button', { name: 'compare.savePair' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'p1', sides: [] }));
    expect(createCollectionPair).toHaveBeenCalledWith({ name: 'Fraud', filters: { appellant: ['offender'] }, text_query: 'fraud suspended' });
  });

  it('shows the too-large message on 413', async () => {
    createCollectionPair.mockRejectedValue(Object.assign(new Error('too large'), { status: 413 }));
    render(<SavePairDialog open onOpenChange={() => {}} onSaved={() => {}} request={{ filters: {}, text_query: 'x' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'compare.savePair' }));
    expect(await screen.findByText('compare.savePairTooLarge')).toBeInTheDocument();
  });
});
```
Run: `npx jest tests/unit/app/compare/save-pair-dialog.test.tsx` → FAIL (stub renders null).

- [ ] **Step 2: Implement**

Use `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription` from `@/components/ui/dialog`, `Input` + `Label` from `@/components/ui/*` (as `frontend/app/collections/page.tsx:8,14` does). Body: `<Label htmlFor="pair-name">{t('compare.savePairName')}</Label><Input id="pair-name" …/>`, hint `t('compare.savePairHint', { name })`, submit button text `t('compare.savePair')`. In `api.ts` make `postJson` attach `status` to the thrown error (`Object.assign(new Error(msg), { status: res.status })`) so the dialog can branch on 413.

Run: `npx jest tests/unit/app/compare && npm run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/compare/_components/SavePairDialog.tsx frontend/lib/compare/api.ts frontend/tests/unit/app/compare/save-pair-dialog.test.tsx
git commit -m "feat(compare): save result as PL/UK collection pair

Refs #<C>"
```

---

### Task 18: `/compare/[pairId]` page

**Files:**
- Create: `frontend/app/compare/[pairId]/page.tsx`, `frontend/app/compare/_components/PairContent.tsx`
- Test: `frontend/tests/unit/app/compare/pair-content.test.tsx`

**Interfaces:**
- `PairContent` props `{ pairId: string }`; uses `useComparePair(pairId)`; renders `Masthead` with `Eyebrow` `t('compare.pairEyebrow')` + pair name, links to both collections (`/collections/<id>`), `CompareView` (Task 16) with `request = { filters: data.filters, text_query: null }` — the backend returns `filters = {"collection_ids": [pl, uk]}` for a pair and `list_extracted_filter_matches` accepts that key, so the CSV export and permalink of a pair view run over the same membership. Below the base fields, section `t('compare.pairSchemaSection')`: if no field has `source.startsWith('schema:')`, show `t('compare.pairNoSchema')` plus two links `t('compare.extractOnBoth', { jurisdiction })` → `/extract?collection=<id>` (param name verified in `frontend/app/extract/_components/useExtract.ts:74-105`).

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';

jest.mock('@/contexts/LanguageContext', () => ({ useTranslation: () => ({ t: (k: string, v?: Record<string, unknown>) => (v ? `${k} ${JSON.stringify(v)}` : k), locale: 'en' }) }));
jest.mock('@/components/charts/BivariateBarChart', () => ({ BivariateBarChart: () => <div data-testid="bivariate" /> }));
const useComparePair = jest.fn();
jest.mock('@/lib/compare/api', () => ({ useComparePair: (id: string) => useComparePair(id), downloadCompareCsv: jest.fn() }));

import { PairContent } from '@/app/compare/_components/PairContent';

const base = { jurisdictions: ['PL', 'UK'], totals: { PL: 3, UK: 2 }, ignored_filter_keys: [], text_query: null,
  filters: { collection_ids: ['c-pl', 'c-uk'] }, pair: { id: 'p1', name: 'Fraud', pl_collection_id: 'c-pl', uk_collection_id: 'c-uk' } };

describe('PairContent', () => {
  it('links both collections and invites extraction when no schema fields exist', () => {
    useComparePair.mockReturnValue({ data: { ...base, fields: [] }, isLoading: false, isError: false });
    render(<PairContent pairId="p1" />);
    expect(screen.getByRole('link', { name: /Fraud — PL/ })).toHaveAttribute('href', '/collections/c-pl');
    expect(screen.getByText('compare.pairNoSchema')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /extractOnBoth.*PL/ })).toHaveAttribute('href', '/extract?collection=c-pl');
  });

  it('renders extension-schema fields in their own section', () => {
    useComparePair.mockReturnValue({ data: { ...base, fields: [
      { field: 'verdict', label: 'Verdict', source: 'schema:s1', kind: 'enum', tier: 'primary', missing_in: [],
        coverage: { PL: { covered: 3, total: 3, ratio: 1 }, UK: { covered: 2, total: 2, ratio: 1 } },
        values: [{ value: 'guilty', counts: { PL: 2, UK: 1 }, shares: { PL: 0.67, UK: 0.5 } }] },
    ] }, isLoading: false, isError: false });
    render(<PairContent pairId="p1" />);
    expect(screen.getByRole('region', { name: 'compare.pairSchemaSection' })).toHaveTextContent('Verdict');
  });
});
```
Run → FAIL (module missing).

- [ ] **Step 2: Implement**

`frontend/app/compare/[pairId]/page.tsx`:

```tsx
import { PairContent } from '../_components/PairContent';

export default async function ComparePairPage({ params }: { params: Promise<{ pairId: string }> }) {
  const { pairId } = await params;
  return <PairContent pairId={pairId} />;
}
```

`PairContent.tsx`: client component; split `data.fields` into `base = fields.filter(f => f.source === 'base')` and `schema = fields.filter(f => f.source.startsWith('schema:'))`; render `<CompareView data={{ ...data, fields: base }} request={{ filters: data.filters, text_query: null }} />` then `<section role="region" aria-labelledby="pair-schema">` with the schema fields through `FieldComparisonFigure` (same tier grouping — reuse `CompareView` with `{...data, fields: schema}` inside the section when `schema.length > 0`), else the `pairNoSchema` text and the two `/extract?collection=` links. Loading → `EditorialCardSkeleton`; error → `role="alert"`.

Run: `npx jest tests/unit/app/compare && npm run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/compare
git commit -m "feat(compare): /compare/[pairId] with extension-schema section

Refs #<C>"
```

---

### Task 19: Navigation, `/collections` pair badge, static-page link

**Files:**
- Modify: `frontend/components/app-sidebar.tsx:328-356` (Phase 3 — Analyze group), `:16-33` (icon import `GitCompareArrows`)
- Modify: `frontend/components/command-palette.tsx:96-104` (add entry after `dataset-comparison`)
- Modify: `frontend/app/dataset-comparison/page.tsx` (one `Link` to `/compare` under the masthead)
- Modify: `frontend/types/collection.ts` (`pair?: CollectionPairRef | null`), `frontend/app/collections/page.tsx:445-500` (badge + link)
- Modify: `frontend/tests/unit/navigation/route-reachability.test.ts:56-67` (`NAV_LINKED_ROUTES` += `'/compare'`)
- Test: `frontend/__tests__/components/app-sidebar.public-menu.test.tsx` (extend), `frontend/tests/unit/app/collections/pair-badge.test.tsx`

**Interfaces:**
- `frontend/types/collection.ts`: `export interface CollectionPairRef { id: string; name: string; role: 'PL' | 'UK'; partner_collection_id: string }`; `CollectionWithDocuments.pair?: CollectionPairRef | null`.

- [ ] **Step 1: Failing tests**

In `route-reachability.test.ts` add `'/compare',` to `NAV_LINKED_ROUTES`. In `app-sidebar.public-menu.test.tsx`, in the authenticated-user `it` (line ≈ 130-140) add `'/compare'` to the list of hrefs expected present; in the anonymous `it` (≈ 91-95) add `expect(container.querySelector('a[href="/compare"]')).not.toBeInTheDocument();`.

`frontend/tests/unit/app/collections/pair-badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';

import { CollectionPairBadge } from '@/app/collections/_components/CollectionPairBadge';

describe('CollectionPairBadge', () => {
  it('names the role and links to the comparison', () => {
    render(<CollectionPairBadge pair={{ id: 'p1', name: 'Fraud', role: 'PL', partner_collection_id: 'c-uk' }} />);
    const link = screen.getByRole('link', { name: /Fraud.*PL/ });
    expect(link).toHaveAttribute('href', '/compare/p1');
  });
});
```

Run: `cd frontend && npx jest tests/unit/navigation tests/unit/app/collections __tests__/components/app-sidebar.public-menu.test.tsx` → FAIL (route not linked; badge missing).

- [ ] **Step 2: Implement**

Sidebar — after the `/reasoning-lines` item (line 345-354), same markup:
```tsx
 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.compare')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname.startsWith("/compare")}>
 <Link href="/compare">
 <GitCompareArrows />
 <span>{t('navigation.compare')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>
```
The item must sit inside the block that renders only for signed-in users (the same guard `/collections` uses — check how `/collections` is gated at line ≈ 240 and mirror it).

Command palette entry:
```ts
  {
    id: "compare",
    label: "Compare PL / UK",
    description: "Run one structured filter for Polish and UK judgments side by side",
    icon: <GitCompareArrows className="h-4 w-4" />,
    href: "/compare",
    keywords: ["compare", "comparison", "pl", "uk", "jurisdiction", "coverage", "porównaj"],
    category: "navigation",
  },
```

`frontend/app/collections/_components/CollectionPairBadge.tsx`:
```tsx
import Link from 'next/link';
import { GitCompareArrows } from 'lucide-react';

import type { CollectionPairRef } from '@/types/collection';

export function CollectionPairBadge({ pair }: { pair: CollectionPairRef }) {
  return (
    <Link href={`/compare/${pair.id}`} onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 border border-oxblood px-2 py-0.5 font-mono text-xs text-oxblood hover:bg-oxblood hover:text-parchment">
      <GitCompareArrows className="h-3 w-3" />
      {pair.name} · {pair.role}
    </Link>
  );
}
```
In `collections/page.tsx` inside the badge row (`<div className="flex gap-2 flex-wrap">`, line ≈ 473) add `{collection.pair && <CollectionPairBadge pair={collection.pair} />}`.

`dataset-comparison/page.tsx`: under the `Masthead`, `<Link href="/compare" className="font-mono text-xs uppercase tracking-wider text-oxblood hover:underline">Live comparison on your own filter →</Link>`.

- [ ] **Step 3: Run**

```bash
cd frontend && npx jest tests/unit/navigation tests/unit/app __tests__/components && npm run validate && npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/app-sidebar.tsx frontend/components/command-palette.tsx frontend/app/dataset-comparison/page.tsx frontend/types/collection.ts frontend/app/collections frontend/tests/unit/navigation/route-reachability.test.ts frontend/tests/unit/app/collections frontend/__tests__/components/app-sidebar.public-menu.test.tsx
git commit -m "feat(nav): /compare in sidebar and palette; pair badge on collections

Refs #<C>"
```

---

### Task 20: Docs + final verification

**Files:**
- Create: `docs/how-to/compare-pl-uk.md`
- Modify: `docs/reference/sidebar-map.md:11-17` (new row), `docs/api/API_REFERENCE.md` (new endpoints), `docs/tutorials/first-30-minutes.md:131-135` (point the "Comparative" pattern at `/compare`)

- [ ] **Step 1: Write the how-to**

`docs/how-to/compare-pl-uk.md` — sections: *Goal*, *Steps* (1 open `/compare`; 2 describe the question or pick chips; 3 read N_PL/N_UK and the three sections; 4 badge meaning — coverage = documents where the field is coded / matched documents, 80 % rule, "not available" rule; 5 Save as pair → `/collections` shows `name · PL/UK`; 6 run the same extension schema on both via *Extract on … collection*, revisit `/compare/<id>`; 7 Export CSV — column dictionary `field, value, jurisdiction, count, share (= count/covered), coverage (= covered/total), covered, total`; 8 Copy link — `?f=` blob is identical to `/search/extractions`), *Caveats* (case_type/court_level defects; free-text topics PL-only; shares are descriptive, no significance test).

`sidebar-map.md`: row `| **Compare PL / UK** | \`/compare\` | Same base-schema filter for PL and UK, coded fields side by side with coverage; save as a collection pair. | [How-to](../how-to/compare-pl-uk.md) |`.

`API_REFERENCE.md`: `POST /compare/facets`, `POST /compare/export`, `GET /compare/pairs/{pair_id}`, `POST|GET /collections/pairs`, `GET|DELETE /collections/pairs/{pair_id}` with request/response shapes from Tasks 7-11.

`first-30-minutes.md:133-135`: replace the manual "run identical searches under each filter" sentence with a pointer to `/compare` and the how-to.

- [ ] **Step 2: Full verification**

```bash
cd backend && poetry run poe check-all
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres poetry run pytest -m db -q
cd frontend && npm run validate && npm run typecheck && npx jest
cd frontend && npm run test:e2e:smoke   # UI-only smoke; must not regress on the new sidebar item
```
Expected: all green. Then open `/compare` locally (`npm run dev` + backend on :8004), enter "kobiety skazane za oszustwo" via the NL dialog, confirm N_PL/N_UK, a badge on `sentence_serve`/`convict`-adjacent fields, CSV download, permalink round-trip, pair creation and `/collections` badge.

- [ ] **Step 3: Commit**

```bash
git add docs/how-to/compare-pl-uk.md docs/reference/sidebar-map.md docs/api/API_REFERENCE.md docs/tutorials/first-30-minutes.md
git commit -m "docs(compare): how-to, sidebar map, API reference

Refs #<C>"
```

Open the PR against `main` (`gh pr create`), body: Spec C acceptance criteria as a checklist, links to `#<C>`, `#537`, Spec B's PR.

---

## Risks and open issues

| Risk | Impact | Mitigation in this plan |
|---|---|---|
| **`case_type = 'Civil'` on every UK row, `court_level = 'Crown Court'`** (APP_STATUS §4 defects 2-3) | Any comparison on those columns is wrong | They are `judgments` columns, not base fields; `/compare` never exposes them (field registry is base-schema-only). Documented in the how-to caveats. Out of scope to fix. |
| **`legal_topics`/`keywords` PL-only (0/300 UK)** | Topic comparison would show UK at 0 % | `keywords` is a free-text array → excluded from the registry by construction; `dataNote` says so. If someone requests `fields=["keywords"]`, `select_base_fields` returns 400. |
| **Coverage asymmetry** (`base_convict_offences` PL 153/200 vs UK 198/200, `sentences_received` PL 153 vs UK 179) | Users read distribution differences that are coverage artefacts | Shares use `covered` as denominator; `partial` tier + badge at < 80 %; CSV carries both denominators. |
| **Spec B drift** (clause text / key names) | Task 1's verbatim copy diverges | Step 1 verifies B; Step 4 diffs the three regions; db-tier test `test_shared_function_honours_spec_b_jurisdiction_key`. |
| **Wrapper refactor changes `filter_documents_by_extracted_data` behaviour** | Regression on `/search/extractions` | Same ORDER BY/LIMIT/OFFSET; `test_wrapper_returns_the_same_rows_as_the_shared_function`, `test_wrapper_pagination_and_order_are_unchanged`; `test_base_schema_route_regressions.py` stays green. |
| **17 RPC calls per compare** | Latency on a busy DB | 12k rows; each call is an index-backed filter + one GROUP BY; measured target < 1.5 s total. If it grows, add `p_fields TEXT[]` variant later (interface already isolated in `CompareService.facet_rows`). |
| **Route order** `/collections/pairs` vs `/collections/{collection_id}` | 404 on every pairs call | Separate router registered first; `test_pairs_route_wins_over_collection_id_catch_all`. |
| **`extraction_schemas` empty in production (#537)** | AC4 has nothing to show until seeds exist | `pairNoSchema` empty state with deep links to `/extract?collection=`; link #537 in the PR. |
| **Audit `action_type` allow-list** | `collection_pair_created` rejected at runtime | Task 9 Step 4 checks `audit_service.py`. |
| **Route reachability + sidebar tests** | Frontend Unit Tests red | Task 19 updates both lists. |
| **Frontend E2E Smoke crawls the sidebar** | New item breaks a smoke assertion | Task 20 runs `test:e2e:smoke` locally before the PR. |

Issues to link: `#<C>` (this spec), Spec B's issue, `#537` (schema seed — AC4 demo data), `#507` (end-to-end pipeline), `#583`/`#575` (extractions Playwright coverage — a `/compare` E2E belongs in the same follow-up).

---

## Shared building blocks

Honest split: **(S)** genuinely shareable now, **(F)** feature-specific.

| Block | Where | Interface sketch | Reusable by NL-filter→collection (`/search/extractions`) | Reusable by research-flow epic (collection→extract→sample→export) |
|---|---|---|---|---|
| **(S)** RPC `list_extracted_filter_matches` | migration 1 | `(p_filters JSONB, p_text_query TEXT) → TABLE(id UUID, jurisdiction TEXT)`; accepts every base-filter key + `collection_ids` | Yes — "save result as collection" can fetch **all** matching ids server-side in one call instead of paging `filter_documents_by_extracted_data` 200 at a time | Yes — "sample N from a collection" / "facets over a collection" via `collection_ids` |
| **(S)** RPC `get_extracted_facet_counts_by_jurisdiction` | migration 2 | `(p_filters, field_path, p_text_query) → (jurisdiction, value, count, total, covered, coverage)`; summary row when `value IS NULL` | Yes — filtered facet counts for chips (`jurisdiction` split is free; sum both for a global count) | Yes — coverage-per-field of a collection before choosing an extraction schema |
| **(S)** `collection_ids` key in `p_filters` | migration 1 | `{"collection_ids": ["uuid", …]}` → membership predicate | Indirectly (after B) | Yes — every "within this collection" query |
| **(S)** `backend/app/compare/fields.py` | Task 5 | `comparable_fields_from_schema(schema, source) → list[FieldSpec]`, `base_compare_fields()`, `select_base_fields(names)` | Partly — a registry of enum/boolean base fields for chip rendering | Yes — "which fields of this schema can be aggregated" for the sample/export step |
| **(S)** `backend/app/compare/layout.py` | Task 4 | `coverage_ratio`, `share`, `tier_for`, `build_field(spec, coverage, counts) → CompareField`; `LOW_COVERAGE_THRESHOLD` | No (single-population UI has no tiers) — but `coverage_ratio` is generic | Yes — coverage badges on extraction results per field |
| **(S)** `backend/app/compare/schema_tally.py` | Task 11 | `tally_schema_fields({"PL": results, "UK": results}, specs) → list[CompareField]`; `latest_success_jobs(client, collection_ids)`; `load_schema(client, id)` | No | Yes — per-field value counts of any extraction job (`results` JSONB), single population by passing one key |
| **(S)** `backend/app/compare/csv_export.py` | Task 8 | `to_csv_rows(CompareResponse) → rows`, `csv_bytes(rows) → bytes` (BOM) | No | Yes — long-format aggregate export of any `CompareField` list; `csv_bytes` is generic |
| **(S)** `collection_pairs` table + `CollectionPairsDB` + `/collections/pairs` | Tasks 3, 9 | `create_pair`, `list_pairs`, `find_pair`, `delete_pair`, `pairs_by_collection(user_id)`; `POST /collections/pairs {name, filters, text_query}` | Yes — B's "save as collection" could call `POST /collections/pairs` when the NL filter names both jurisdictions | Yes — a pair is a first-class input for a comparative research flow |
| **(S)** Server-side "collections from a filter" in `collection_pairs.create_pair` | Task 9 | `_matching_ids(filters, text_query) → {PL: ids, UK: ids}` + chunked `bulk_add_documents` | **Yes, directly** — extract into `app/collections_from_filter.py::create_collection_from_filter(user, name, filters, text_query) → collection` and let B's single-collection save reuse it (5 000 cap, 1 000-row chunks) | Yes — step 1 of the flow |
| **(S)** `frontend/components/charts/BivariateBarChart` | Task 12 | `{categories, plData, ukData, yTickSuffix?, hoverTemplate?, …}` | No | Yes — any PL/UK grouped bar (statistics, reasoning lines) |
| **(S)** `frontend/lib/extractions/drawer-adapter.ts` | Task 16 | `toDrawerFilters(BaseSchemaFilters) → BaseFilters`, `applyDrawerChange(filters, field, value) → BaseSchemaFilters` | **Yes** — it is the search page's own code, now importable by any page mounting `BaseFiltersDrawer` | Yes — filter step of the flow |
| **(S)** `frontend/lib/compare/permalink.ts` | Task 13 | `buildComparePermalink(filters, text, origin?)` on top of `encodeFilters` | Yes — B's "URL encodes the filter" is the same blob; a `/search/extractions` permalink builder is one line away | Yes |
| **(S)** `frontend/lib/compare/chart-data.ts` | Task 13 | `toShareChart(field, labelOf)`, `coveragePercent(stat)` | No | Yes — with `schema_tally` output |
| **(F)** `CompareService.compare/compare_collections`, `router.py` | Tasks 6-11 | `POST /compare/facets`, `POST /compare/export`, `GET /compare/pairs/{id}` | No | Partly — `GET /compare/pairs/{id}` is the "compare" terminal step of a comparative flow |
| **(F)** `/compare` pages and `_components/*` (`CompareView`, `CoverageBadge`, `UnavailableFields`, `SavePairDialog`, `PairContent`) | Tasks 16-18 | React components bound to `CompareResponse` | No | Partly — `CoverageBadge` and `UnavailableFields` are presentational and could be lifted to `components/editorial` if a second consumer appears; not before |
| **(F)** i18n `compare.*` | Task 15 | — | No | No |

Not shared on purpose: the 80 % threshold and the hide rule stay in `layout.py` — consumers that want them import the module; nobody copies the number.
