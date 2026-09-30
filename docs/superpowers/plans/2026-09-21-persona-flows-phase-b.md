# Persona Flows — Phase B (Statistics over a cohort) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer "how many judgments in this cohort have X, and how are Y and Z distributed at 10 / 50 / 100 / 1,000 / 5,000 / all" from the 51 pre-extracted base fields, without an LLM call — one aggregate RPC and a Statistics view on `/search/extractions`.

**Architecture:** One SQL function `aggregate_extracted_data` reuses #682's `list_extracted_filter_matches` (the cohort), draws a seeded deterministic sample from it, and returns per-field distributions (categorical / numeric / year) as one JSONB. A login-gated FastAPI endpoint validates fields against a shared allowlist and calls it; a BFF route proxies it. On the page, a `List | Statistics` toggle stored in the existing filter URL codec switches the body to field cards drawn with the existing Plotly `HorizontalBarChart`; every bar drills back to the list. Two branches: **B1** backend (#707) then **B2** frontend (#708).

**Tech Stack:** Postgres 16 plpgsql (dynamic `EXECUTE format()` like `get_numeric_field_histogram`), FastAPI + Pydantic v2, supabase-py, Next.js 15 App Router + React Query, Plotly via `react-plotly.js/factory`, Jest + Testing Library, Playwright route-contract harness.

**Spec:** `docs/superpowers/specs/2026-09-20-persona-flows-design.md` §5 (Phase B). Task 0 amends §5.1. Issues: #707 (B1), #708 (B2); parent #687; foundation #682 / PR #701 (merged `e3386c5e`).

## Global Constraints

- The cohort is always `list_extracted_filter_matches(p_filters, p_text_query)` (`supabase/migrations/20260920000001_shared_extracted_filter_matches.sql:17-27`). No predicate is re-implemented anywhere in this plan.
- `collection_ids` in `filters` is rejected with HTTP 400 `COLLECTION_IDS_NOT_ALLOWED`, byte-identical to `backend/app/extraction_domain/results_router.py:475-487` (the RPC is SECURITY INVOKER and the backend calls it with the service-role client). Statistics over a saved collection is a named gap for #685.
- The aggregable-field allowlist is one list in three places — `frontend/lib/extractions/aggregable-fields.json` (canonical), `backend/app/extraction_domain/aggregate_fields.py`, and the SQL kind dispatch — and a test proves the Python set equals the JSON. Meta fields (`extraction_status`, `extraction_model`, `extracted_at`, `case_number`, `neutral_citation_number`) and free-text (`substring`) fields are never aggregable.
- Default field set, in this order: `offender_age_offence`, `offender_gender`, `convict_offences`, `sentences_received`, `appeal_outcome`, `did_offender_confess`, `court_name`, `decision_date`.
- Sampling is `ORDER BY md5(id::text || seed::text) LIMIT n`: same cohort + same seed = same sample. `p_seed` is required whenever `p_sample_size` is set. This is simple random sampling for descriptive statistics; #685's `stratified_sample` (Python, per-jurisdiction strata for extraction populations) is a different tool and stays separate.
- Grants on the new function: `REVOKE ALL ON FUNCTION … FROM PUBLIC;` then `GRANT EXECUTE … TO authenticated, service_role;` — never `anon`. The function is declared `SECURITY INVOKER` explicitly (the #682 RPC relies on the default); as `authenticated` via PostgREST it runs under the caller's RLS, so the direct-RPC path cannot read more than `/base-schema/filter` already exposes. Grants are narrower than #682's (`anon, authenticated, service_role` at `20260920000001_shared_extracted_filter_matches.sql:384-387`) on purpose: statistics are a signed-in feature.
- Performance: default 8 fields over the whole corpus (12,907 rows) **≤ 1.5 s p95** on the dev database; `EXPLAIN ANALYZE` output goes in the B1 PR body. A slow field is dropped from the default set, not the target relaxed.
- Endpoint auth: `Depends(get_current_user)` from `app.core.auth_jwt` (Bearer JWT), like `/collections/from-filter`.
- Frontend URL state: `view`, `n`, `seed`, `fields` are added to `FilterUrlState` in `frontend/lib/extractions/use-extracted-data-filters.ts` — the hook's `writeUrl` replaces the whole query string on every change (`use-extracted-data-filters.ts:150-157`), so a second codec would be wiped. No other permalink builder.
- Charts: one series per card, one hue (`--pwr-red`, `#9A342D`; "other"/null bars in `--pwr-grey`, `#5A5A5A`), no legend for a single series, hover tooltip on every bar, no dual axis, text in ink tokens. Horizontal bars for every kind (year and numeric buckets are ordered items). Run `node <dataviz-skill>/scripts/validate_palette.js "#9A342D,#5A5A5A" --mode light` once in B2 and paste the result in the PR.
- Editorial design system only (`frontend/components/editorial/`, tokens in `frontend/app/globals.css`). New user-facing copy goes through i18n (`extraction.stats*` keys in `en.ts` and `pl.ts`; `pl: Translations` typing enforces symmetry).
- Worktrees: B1 `.worktrees/feat-707-aggregate-rpc` (branch `feat/707-aggregate-rpc`, from `origin/main` ≥ `e3386c5e`); B2 `.worktrees/feat-708-statistics-view` (branch `feat/708-statistics-view`, from `origin/main` **after #707 merges**). `frontend/node_modules` via `cp -al` from the main checkout; backend via the main checkout's Poetry env (`cd backend && poetry run …` works from the worktree because the venv is per-project; run `poetry install` only if imports fail).
- Commits: Conventional Commits, footer `Refs #707` (B1) / `Refs #708` (B2), no AI attribution. `docs/superpowers/` is tracked and no longer ignored (#688).
- Commands: backend from `backend/` — `poetry run pytest -q -m unit <path>`, `poetry run pytest -q -m db <path>` (needs `DATABASE_URL`, see `backend/tests/db/conftest.py`), `poetry run ruff check . && poetry run ruff format --check .`; frontend from `frontend/` — `npx jest <path>`, `npx eslint --max-warnings 0 <files>`, `npm run typecheck`, `npm run validate`.

---

## File Structure

### B1 — backend (#707)

| File | Responsibility |
|---|---|
| `docs/superpowers/specs/2026-09-20-persona-flows-design.md` (modify §5.1) | Spec says what the RPC builds on and how `collection_ids` is treated. |
| `frontend/lib/extractions/aggregable-fields.json` (create) | Canonical allowlist + default set. Plain JSON so both languages read it. |
| `backend/app/extraction_domain/aggregate_fields.py` (create) | `AGGREGABLE_FIELDS`, `DEFAULT_AGGREGATE_FIELDS`, `CORE_AGGREGATE_FIELDS` — Python mirror + validator. |
| `supabase/migrations/20260921000003_aggregate_extracted_data.sql` (create) | The RPC. (`20260921000001/02` are reserved by #684.) |
| `backend/app/models.py` (modify) | `AggregateRequest`, `AggregateResponse`. |
| `backend/app/extraction_domain/results_router.py` (modify) | `POST /base-schema/aggregate`. |
| `frontend/app/api/extractions/base-schema/aggregate/route.ts` (create) | BFF via `proxyToBackend`. |
| Tests | `backend/tests/app/test_aggregate_fields.py`, `backend/tests/app/test_aggregate_router.py`, `backend/tests/db/test_aggregate_contract.py`, `backend/tests/db/test_migration_chain.py` (modify `EXPECTED_RPC_ARGS`). |

### B2 — frontend (#708)

| File | Responsibility |
|---|---|
| `frontend/components/charts/HorizontalBarChart.tsx`, `BivariateBarChart.tsx` (move) + re-export shims in `frontend/app/dataset-comparison/_components/` | Shared chart primitives (coordinates with #684). |
| `frontend/types/base-schema-filter.ts` (modify) | `AggregateRequest`, `AggregateResponse`, `FieldAggregate` types. |
| `frontend/lib/extractions/aggregate-fields.ts` (create) | Reads the JSON; labels for core fields; `isAggregableField`. |
| `frontend/lib/extractions/base-schema-filter-api.ts` (modify) | `postAggregate`, `useExtractionAggregate`. |
| `frontend/lib/extractions/use-extracted-data-filters.ts` (modify) | `view`, `sampleSize`, `seed`, `fields` in `FilterUrlState` + hook setters. |
| `frontend/lib/extractions/stats-export.ts` (create) | Pure: aggregate → CSV rows, cohort.json payload. |
| `frontend/app/search/extractions/_components/StatisticsView.tsx`, `ScaleSlider.tsx`, `FieldCard.tsx`, `ViewToggle.tsx` (create) | The statistics body. |
| `frontend/app/search/extractions/page.tsx` (modify) | Mount toggle + view. |
| `frontend/lib/navigation/flows.ts` (modify) | Explore step 2: Statistics (`/search/extractions?view=stats`). |
| `frontend/lib/i18n/types.ts`, `translations/en.ts`, `translations/pl.ts` (modify) | `extraction.stats*` keys. |
| `frontend/tests/route-contract-e2e/stub-services.mjs` (modify), `frontend/tests/route-contract-e2e/statistics-view.spec.ts` (create) | Stubbed aggregate endpoint + one E2E path. |
| Tests | `frontend/__tests__/lib/extractions/aggregate-fields.test.ts`, `use-extracted-data-filters.stats.test.ts`, `stats-export.test.ts`; `frontend/__tests__/app/search/extractions/{ScaleSlider,FieldCard,StatisticsView}.test.tsx`; `frontend/__tests__/lib/navigation/flows.test.ts` (modify). |

---

# Part B1 — backend (#707), branch `feat/707-aggregate-rpc`

### Task 0: Amend spec §5.1 and add the canonical allowlist

**Files:**
- Modify: `docs/superpowers/specs/2026-09-20-persona-flows-design.md:88` (the "duplicates the predicate block" bullet) and `:94` (grants bullet — unchanged, keep)
- Create: `frontend/lib/extractions/aggregable-fields.json`

**Interfaces:**
- Produces: the JSON shape every later task reads:

```json
{ "fields": ["…"], "default": ["…"], "core": ["jurisdiction", "decision_date", "court_name"] }
```

- [ ] **Step 1: Replace the spec bullet at line 88**

Replace the whole bullet that begins "`filter_documents_by_extracted_data` is static plpgsql" with:

```markdown
- The cohort is `list_extracted_filter_matches(p_filters, p_text_query)` from #682 (`supabase/migrations/20260920000001_shared_extracted_filter_matches.sql`): the aggregate function selects its ids in a CTE, orders them by `md5(id::text || p_seed::text)`, keeps the first `p_sample_size`, and runs one dynamic per-field aggregate over `judgments WHERE id = ANY(sample)`. No predicate is re-implemented; a Database Contract test asserts `aggregate_extracted_data(...)->>'total'` equals `filter_documents_by_extracted_data(...).total_count` for a fixed set of filter payloads, so the two cannot disagree on the cohort.
- `collection_ids` is rejected by the aggregate endpoint exactly as `/base-schema/filter` rejects it (`results_router.py:475-487`, HTTP 400 `COLLECTION_IDS_NOT_ALLOWED`): the RPC is SECURITY INVOKER and the backend calls it with the service-role client, so honouring the key would let any signed-in caller probe any collection's membership. "Statistics over a saved collection" is therefore a named gap, owned by #685 together with the auth deferral. The spec's earlier "accept a collection" wording in §5.2 is withdrawn.
- Aggregable fields are one allowlist in three places — `frontend/lib/extractions/aggregable-fields.json` (canonical), `backend/app/extraction_domain/aggregate_fields.py`, and the SQL kind dispatch — with a test that the Python set equals the JSON. Free-text fields and extraction metadata are never aggregable.
```

Also in §5.2 item 6 ("Export") leave as is; in §5.2 item 1 replace "with a 'Show judgments' link" sentence — no change needed. In §9 Non-goals add one bullet: `- Statistics over a saved collection (blocked on the collection_ids auth deferral; #685).`

- [ ] **Step 2: Create the canonical allowlist**

`frontend/lib/extractions/aggregable-fields.json`:

```json
{
  "fields": [
    "appeal_against", "appeal_outcome", "appellant", "offender_gender", "offender_home_offence",
    "offender_intox_offence", "offender_job_offence", "offender_victim_relationship", "plea_point",
    "pre_sent_report", "remand_decision", "sentence_serve", "victim_gender", "victim_intox_offence",
    "victim_type",
    "did_offender_confess", "vic_impact_statement",
    "acquit_offences", "agg_fact_sent", "appeal_ground", "conv_court_names", "convict_offences",
    "def_evid_type_trial", "keywords", "mit_fact_sent", "pros_evid_type_trial", "reason_dismiss",
    "reason_quash_conv", "reason_sent_excessive", "reason_sent_lenient", "sent_court_name",
    "sentences_received", "sent_guide_which", "victim_home_offence", "victim_job_offence",
    "what_ancilliary_orders",
    "co_def_acc_num", "num_victims", "victim_age_offence",
    "offender_age_offence",
    "date_of_appeal_court_judgment",
    "jurisdiction", "decision_date", "court_name",
    "deep_complexity_score", "deep_reasoning_quality_score", "deep_legal_domains",
    "deep_reasoning_patterns", "deep_judicial_tone", "deep_precedential_value"
  ],
  "default": [
    "offender_age_offence", "offender_gender", "convict_offences", "sentences_received",
    "appeal_outcome", "did_offender_confess", "court_name", "decision_date"
  ],
  "core": ["jurisdiction", "decision_date", "court_name"]
}
```

Derivation (write this as a comment in Task 1's Python module, JSON has no comments): every `FILTER_FIELDS` entry in `frontend/lib/extractions/base-schema-filter-config.ts` whose `control` is `enum_multi`, `boolean_tri`, `tag_array`, `numeric_range` or `date_range`, minus metadata (`extraction_status`, `extraction_model`, `extracted_at`, `case_number`, `convict_plea_dates`); plus `offender_age_offence` (a `base_*` TEXT column with no filter control); plus the three core columns; plus the six `deep_*` columns that are scores or enums (labelled "model score" in the UI).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-20-persona-flows-design.md frontend/lib/extractions/aggregable-fields.json
git commit -m "docs(stats): build the aggregate on list_extracted_filter_matches; canonical aggregable-field list

Refs #707"
```

---

### Task 1: Python allowlist module

**Files:**
- Create: `backend/app/extraction_domain/aggregate_fields.py`
- Test: `backend/tests/app/test_aggregate_fields.py`

**Interfaces:**
- Produces:

```python
AGGREGABLE_FIELDS: frozenset[str]
DEFAULT_AGGREGATE_FIELDS: tuple[str, ...]
CORE_AGGREGATE_FIELDS: frozenset[str]
def validate_fields(fields: list[str] | None) -> list[str]   # raises ValueError naming the bad field
```

- [ ] **Step 1: Write the failing test**

`backend/tests/app/test_aggregate_fields.py`:

```python
"""The aggregable-field allowlist lives in three places (JSON, Python, SQL).
These tests pin the Python mirror to the canonical JSON so the two cannot
drift; the SQL side is pinned by tests/db/test_aggregate_contract.py."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.extraction_domain.aggregate_fields import (
    AGGREGABLE_FIELDS,
    CORE_AGGREGATE_FIELDS,
    DEFAULT_AGGREGATE_FIELDS,
    validate_fields,
)

pytestmark = pytest.mark.unit

CANONICAL = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "lib"
    / "extractions"
    / "aggregable-fields.json"
)


def test_python_allowlist_equals_canonical_json() -> None:
    data = json.loads(CANONICAL.read_text(encoding="utf-8"))
    assert AGGREGABLE_FIELDS == frozenset(data["fields"])
    assert DEFAULT_AGGREGATE_FIELDS == tuple(data["default"])
    assert CORE_AGGREGATE_FIELDS == frozenset(data["core"])


def test_default_set_is_a_subset_of_the_allowlist() -> None:
    assert set(DEFAULT_AGGREGATE_FIELDS) <= AGGREGABLE_FIELDS


def test_validate_fields_none_returns_default() -> None:
    assert validate_fields(None) == list(DEFAULT_AGGREGATE_FIELDS)


def test_validate_fields_keeps_order_and_dedupes() -> None:
    assert validate_fields(["court_name", "appeal_outcome", "court_name"]) == [
        "court_name",
        "appeal_outcome",
    ]


def test_validate_fields_rejects_unknown_field_by_name() -> None:
    with pytest.raises(ValueError, match="case_name"):
        validate_fields(["appeal_outcome", "case_name"])


def test_validate_fields_rejects_empty_list() -> None:
    with pytest.raises(ValueError, match="at least one"):
        validate_fields([])
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && poetry run pytest -q -m unit tests/app/test_aggregate_fields.py`
Expected: FAIL — `ModuleNotFoundError: app.extraction_domain.aggregate_fields`.

- [ ] **Step 3: Write the module**

`backend/app/extraction_domain/aggregate_fields.py`:

```python
"""Aggregable-field allowlist for ``aggregate_extracted_data`` (#707).

Canonical list: frontend/lib/extractions/aggregable-fields.json. Derived from
FILTER_FIELDS (base-schema-filter-config.ts) — every field whose control is
enum_multi / boolean_tri / tag_array / numeric_range / date_range — minus
extraction metadata (extraction_status, extraction_model, extracted_at) and
identifiers (case_number, convict_plea_dates); plus offender_age_offence (a
base_* TEXT column without a filter control), the three core judgment
columns, and the deep_* scores and enums. Free-text (substring) fields are
never aggregable. tests/app/test_aggregate_fields.py asserts this module
equals the JSON; tests/db/test_aggregate_contract.py asserts the SQL kind
dispatch accepts every entry.
"""

from __future__ import annotations

AGGREGABLE_FIELDS: frozenset[str] = frozenset(
    {
        # enum_multi
        "appeal_against", "appeal_outcome", "appellant", "offender_gender",
        "offender_home_offence", "offender_intox_offence", "offender_job_offence",
        "offender_victim_relationship", "plea_point", "pre_sent_report",
        "remand_decision", "sentence_serve", "victim_gender", "victim_intox_offence",
        "victim_type",
        # boolean_tri
        "did_offender_confess", "vic_impact_statement",
        # tag_array
        "acquit_offences", "agg_fact_sent", "appeal_ground", "conv_court_names",
        "convict_offences", "def_evid_type_trial", "keywords", "mit_fact_sent",
        "pros_evid_type_trial", "reason_dismiss", "reason_quash_conv",
        "reason_sent_excessive", "reason_sent_lenient", "sent_court_name",
        "sentences_received", "sent_guide_which", "victim_home_offence",
        "victim_job_offence", "what_ancilliary_orders",
        # numeric_range
        "co_def_acc_num", "num_victims", "victim_age_offence",
        # base TEXT without a filter control
        "offender_age_offence",
        # date_range
        "date_of_appeal_court_judgment",
        # core judgment columns
        "jurisdiction", "decision_date", "court_name",
        # deep_* model scores / enums
        "deep_complexity_score", "deep_reasoning_quality_score", "deep_legal_domains",
        "deep_reasoning_patterns", "deep_judicial_tone", "deep_precedential_value",
    }
)

DEFAULT_AGGREGATE_FIELDS: tuple[str, ...] = (
    "offender_age_offence",
    "offender_gender",
    "convict_offences",
    "sentences_received",
    "appeal_outcome",
    "did_offender_confess",
    "court_name",
    "decision_date",
)

CORE_AGGREGATE_FIELDS: frozenset[str] = frozenset({"jurisdiction", "decision_date", "court_name"})


def validate_fields(fields: list[str] | None) -> list[str]:
    """Return the ordered, de-duplicated field list to aggregate.

    ``None`` means the default set. Raises ``ValueError`` naming the first
    field that is not aggregable, or when the list is empty.
    """
    if fields is None:
        return list(DEFAULT_AGGREGATE_FIELDS)
    if not fields:
        raise ValueError("fields must contain at least one field")
    seen: list[str] = []
    for field in fields:
        if field not in AGGREGABLE_FIELDS:
            raise ValueError(f"field {field!r} is not aggregable")
        if field not in seen:
            seen.append(field)
    return seen
```

- [ ] **Step 4: Run tests, lint**

Run: `cd backend && poetry run pytest -q -m unit tests/app/test_aggregate_fields.py && poetry run ruff check app/extraction_domain/aggregate_fields.py tests/app/test_aggregate_fields.py && poetry run ruff format --check app/extraction_domain/aggregate_fields.py tests/app/test_aggregate_fields.py`
Expected: 6 passed; ruff clean. (If `ruff format --check` complains about the set literal's line wrapping, run `poetry run ruff format` on the two files and re-check.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/extraction_domain/aggregate_fields.py backend/tests/app/test_aggregate_fields.py
git commit -m "feat(stats): add the aggregable-field allowlist and validator

Refs #707"
```

---

### Task 2: Migration — `aggregate_extracted_data`

**Files:**
- Create: `supabase/migrations/20260921000003_aggregate_extracted_data.sql`
- Modify: `backend/tests/db/test_migration_chain.py:99` (`EXPECTED_RPC_ARGS`)
- Test: `backend/tests/db/test_aggregate_contract.py`

**Interfaces:**
- Produces the RPC (signature is the contract for Task 3 and for B2's types):

```sql
public.aggregate_extracted_data(
  p_filters JSONB DEFAULT '{}'::jsonb,
  p_text_query TEXT DEFAULT NULL,
  p_fields TEXT[] DEFAULT NULL,
  p_sample_size INT DEFAULT NULL,
  p_seed INT DEFAULT NULL,
  p_top_n INT DEFAULT 20
) RETURNS JSONB
```

Return shape:

```json
{
  "total": 4312, "sample_n": 1000, "seed": 42,
  "fields": {
    "convict_offences": {"kind": "categorical", "values": [{"value": "possession", "count": 812}], "other": 44, "null": 130, "covered": 870, "multi": true},
    "offender_gender":  {"kind": "categorical", "values": [...], "other": 0, "null": 12, "covered": 988, "multi": true},
    "num_victims":      {"kind": "numeric", "buckets": [{"lo": 0, "hi": 1, "count": 12}], "null": 3, "covered": 997, "min": 0, "max": 9},
    "decision_date":    {"kind": "year", "values": [{"value": "2019", "count": 301}], "null": 0, "covered": 1000}
  }
}
```

`covered` = `sample_n − null`. `multi` is true for array columns (a judgment can appear under several values, so value counts can sum to more than `covered`).

- [ ] **Step 1: Write the failing DB contract test**

`backend/tests/db/test_aggregate_contract.py` (same fixture style as `test_extracted_filter_contract.py`; reuse its `_exec` / `_seed` helpers by importing them):

```python
"""Database contract for aggregate_extracted_data (#707).

Pins: (1) the cohort is list_extracted_filter_matches — totals agree with the
filter wrapper; (2) sampling is deterministic per seed and bounded by the
cohort; (3) every allowlisted field aggregates without error and with the
documented shape; (4) categorical "other"/null arithmetic; (5) grants.
"""

from __future__ import annotations

import json

import pytest

from app.extraction_domain.aggregate_fields import AGGREGABLE_FIELDS
from tests.db.test_extracted_filter_contract import _exec, _seed

pytestmark = pytest.mark.db


@pytest.fixture
def cohort(conn):
    token = "agg-contract"
    ids = []
    for i in range(12):
        ids.append(
            _seed(
                conn,
                token,
                "PL" if i % 2 == 0 else "UK",
                f"20{10 + i // 3:02d}-01-15",
                appeal_outcome=["allowed"] if i < 4 else ["dismissed"],
                convict_offences=["possession", "supply"] if i % 3 == 0 else ["possession"],
                num_victims=i % 4,
                did_offender_confess=(i % 2 == 0),
            )
        )
    # one row outside the cohort keyword, must never be counted
    _seed(conn, "other-token", "PL", "2015-01-01", appeal_outcome=["allowed"])
    return {"token": token, "ids": ids}


def _agg(conn, filters, **kw):
    params = {"p_filters": json.dumps(filters), "p_text_query": None, "p_fields": None,
              "p_sample_size": None, "p_seed": None, "p_top_n": 20}
    params.update(kw)
    row = _exec(
        conn,
        "SELECT public.aggregate_extracted_data(%(p_filters)s::jsonb, %(p_text_query)s, "
        "%(p_fields)s::text[], %(p_sample_size)s, %(p_seed)s, %(p_top_n)s)",
        params,
    )
    return row[0][0]


def _wrapper_total(conn, filters):
    rows = _exec(
        conn,
        "SELECT total_count FROM public.filter_documents_by_extracted_data(%s::jsonb, NULL, 1, 0)",
        (json.dumps(filters),),
    )
    return rows[0][0] if rows else 0


def test_total_equals_filter_wrapper_total(conn, cohort):
    for filters in (
        {"keywords": [cohort["token"]]},
        {"keywords": [cohort["token"]], "jurisdiction": ["PL"]},
        {"keywords": [cohort["token"]], "appeal_outcome": ["allowed"]},
        {"keywords": [cohort["token"]], "decision_date": {"from": "2011-01-01", "to": "2012-12-31"}},
    ):
        assert _agg(conn, filters)["total"] == _wrapper_total(conn, filters)


def test_sample_is_deterministic_per_seed_and_bounded(conn, cohort):
    f = {"keywords": [cohort["token"]]}
    a = _agg(conn, f, p_sample_size=5, p_seed=42)
    b = _agg(conn, f, p_sample_size=5, p_seed=42)
    c = _agg(conn, f, p_sample_size=5, p_seed=43)
    assert a == b
    assert a["sample_n"] == 5 and a["total"] == 12 and a["seed"] == 42
    assert a["fields"] != c["fields"] or a["fields"]["decision_date"] != c["fields"]["decision_date"]
    big = _agg(conn, f, p_sample_size=500, p_seed=1)
    assert big["sample_n"] == 12


def test_seed_required_with_sample_size(conn, cohort):
    with pytest.raises(Exception, match="p_seed"):
        _agg(conn, {"keywords": [cohort["token"]]}, p_sample_size=3)


def test_every_allowlisted_field_aggregates(conn, cohort):
    out = _agg(conn, {"keywords": [cohort["token"]]}, p_fields=sorted(AGGREGABLE_FIELDS))
    assert set(out["fields"]) == AGGREGABLE_FIELDS
    for name, agg in out["fields"].items():
        assert agg["kind"] in {"categorical", "numeric", "year"}, name
        assert agg["null"] + agg["covered"] == out["sample_n"], name


def test_unknown_field_is_rejected(conn, cohort):
    with pytest.raises(Exception, match="not aggregable"):
        _agg(conn, {"keywords": [cohort["token"]]}, p_fields=["case_name"])


def test_categorical_other_and_null_arithmetic(conn, cohort):
    out = _agg(conn, {"keywords": [cohort["token"]]}, p_fields=["convict_offences", "appeal_outcome"], p_top_n=1)
    co = out["fields"]["convict_offences"]
    assert co["multi"] is True
    assert [v["value"] for v in co["values"]] == ["possession"]
    assert co["values"][0]["count"] == 12
    assert co["other"] == 4          # "supply" on rows 0,3,6,9 folded into other
    assert co["null"] == 0 and co["covered"] == 12
    ao = out["fields"]["appeal_outcome"]
    assert ao["values"] == [{"value": "dismissed", "count": 8}]
    assert ao["other"] == 4


def test_numeric_and_year_shapes(conn, cohort):
    out = _agg(conn, {"keywords": [cohort["token"]]}, p_fields=["num_victims", "decision_date", "did_offender_confess"])
    nv = out["fields"]["num_victims"]
    assert nv["kind"] == "numeric" and nv["min"] == 0 and nv["max"] == 3
    assert sum(b["count"] for b in nv["buckets"]) == nv["covered"] == 12
    yr = out["fields"]["decision_date"]
    assert yr["kind"] == "year"
    assert [v["value"] for v in yr["values"]] == ["2010", "2011", "2012", "2013"]
    assert [v["count"] for v in yr["values"]] == [3, 3, 3, 3]
    conf = out["fields"]["did_offender_confess"]
    assert conf["kind"] == "categorical" and conf["multi"] is False
    assert sorted(v["value"] for v in conf["values"]) == ["false", "true"]


def test_grants_exclude_anon_and_public(conn):
    rows = _exec(
        conn,
        """
        SELECT grantee FROM information_schema.routine_privileges
        WHERE routine_schema = 'public' AND routine_name = 'aggregate_extracted_data'
        """,
    )
    grantees = {r[0] for r in rows}
    assert "authenticated" in grantees and "service_role" in grantees
    assert "anon" not in grantees and "PUBLIC" not in grantees
```

And in `backend/tests/db/test_migration_chain.py`, inside `EXPECTED_RPC_ARGS`, add:

```python
    # backend/app/extraction_domain/results_router.py — POST /base-schema/aggregate (#707)
    "aggregate_extracted_data": [
        "p_filters",
        "p_text_query",
        "p_fields",
        "p_sample_size",
        "p_seed",
        "p_top_n",
    ],
```

`_exec` (`test_extracted_filter_contract.py:20-23`) runs `cur.execute(sql, params)` and returns `cur.fetchall()` — psycopg accepts a dict for `%(name)s` placeholders, so the dict form above works. `_seed(conn, token, jurisdiction, decision_date, **base)` (`:26-58`) maps each `**base` kwarg to a `base_<name>` column; list values need the `%s::text[]` cast it already applies to `keywords` — pass `appeal_outcome=["allowed"]` etc. as Python lists and, if psycopg complains about the array parameter type, extend `_seed`'s placeholder for kwargs to `%s::text[]` when the value is a list (one-line change, keep the existing tests green).

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && poetry run pytest -q -m db tests/db/test_aggregate_contract.py`
Expected: every test FAILS with `function public.aggregate_extracted_data(...) does not exist`. (The migration-chain test also fails on the new `EXPECTED_RPC_ARGS` entry.)

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260921000003_aggregate_extracted_data.sql`:

```sql
-- aggregate_extracted_data (#707, spec §5.1)
--
-- Per-field distributions over a cohort, optionally over a seeded random
-- sample of it. The cohort is list_extracted_filter_matches (#682) — no
-- predicate is repeated here. Field → column → kind dispatch follows
-- get_numeric_field_histogram (20260514000001): information_schema udt_name
-- decides how a column is aggregated, format(%I) quotes it.
--
-- Return shape (JSONB):
-- { total, sample_n, seed,
--   fields: { <field>: {kind:'categorical', values:[{value,count}], other, null, covered, multi}
--                   | {kind:'numeric', buckets:[{lo,hi,count}], null, covered, min, max}
--                   | {kind:'year', values:[{value,count}], null, covered} } }

CREATE OR REPLACE FUNCTION public._aggregate_column_for_field(p_field TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_field IN ('jurisdiction', 'decision_date', 'court_name') THEN p_field
        WHEN p_field LIKE 'deep\_%' ESCAPE '\' THEN p_field
        ELSE public._base_field_to_column(p_field)
    END;
$$;

CREATE OR REPLACE FUNCTION public.aggregate_extracted_data(
    p_filters     JSONB   DEFAULT '{}'::jsonb,
    p_text_query  TEXT    DEFAULT NULL,
    p_fields      TEXT[]  DEFAULT NULL,
    p_sample_size INT     DEFAULT NULL,
    p_seed        INT     DEFAULT NULL,
    p_top_n       INT     DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_fields   TEXT[] := COALESCE(p_fields, ARRAY[
        'offender_age_offence', 'offender_gender', 'convict_offences', 'sentences_received',
        'appeal_outcome', 'did_offender_confess', 'court_name', 'decision_date']);
    v_ids      UUID[];
    v_total    BIGINT := 0;
    v_sample_n INT := 0;
    v_field    TEXT;
    v_column   TEXT;
    v_udt      TEXT;
    v_part     JSONB;
    v_out      JSONB := '{}'::jsonb;
BEGIN
    IF p_sample_size IS NOT NULL AND p_seed IS NULL THEN
        RAISE EXCEPTION 'p_seed is required when p_sample_size is set' USING ERRCODE = '22023';
    END IF;
    IF p_sample_size IS NOT NULL AND p_sample_size < 1 THEN
        RAISE EXCEPTION 'p_sample_size must be >= 1' USING ERRCODE = '22023';
    END IF;
    IF p_top_n < 1 OR p_top_n > 100 THEN
        RAISE EXCEPTION 'p_top_n must be between 1 and 100' USING ERRCODE = '22023';
    END IF;

    -- Cohort + deterministic order. Same cohort and seed => same sample.
    SELECT COUNT(*), array_agg(m.id ORDER BY md5(m.id::text || COALESCE(p_seed::text, '')), m.id)
      INTO v_total, v_ids
      FROM public.list_extracted_filter_matches(p_filters, p_text_query) m;

    IF v_ids IS NULL THEN
        v_ids := ARRAY[]::UUID[];
    END IF;
    IF p_sample_size IS NOT NULL THEN
        v_ids := v_ids[1:p_sample_size];
    END IF;
    v_sample_n := COALESCE(array_length(v_ids, 1), 0);

    FOREACH v_field IN ARRAY v_fields LOOP
        v_column := public._aggregate_column_for_field(v_field);
        SELECT c.udt_name INTO v_udt
          FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = 'judgments' AND c.column_name = v_column;
        IF v_udt IS NULL THEN
            RAISE EXCEPTION 'field % is not aggregable', v_field USING ERRCODE = '22023';
        END IF;

        IF v_udt = '_text' THEN
            -- array column: one row per value; "multi": a judgment can appear under several values
            EXECUTE format($q$
                WITH s AS (SELECT j.%1$I AS col FROM public.judgments j WHERE j.id = ANY($1)),
                     v AS (SELECT x AS value, COUNT(*) AS cnt FROM s, LATERAL unnest(s.col) AS x GROUP BY x),
                     r AS (SELECT value, cnt, ROW_NUMBER() OVER (ORDER BY cnt DESC, value) AS rn FROM v)
                SELECT jsonb_build_object(
                    'kind', 'categorical', 'multi', true,
                    'values', COALESCE((SELECT jsonb_agg(jsonb_build_object('value', value, 'count', cnt) ORDER BY rn) FROM r WHERE rn <= $2), '[]'::jsonb),
                    'other', COALESCE((SELECT SUM(cnt) FROM r WHERE rn > $2), 0),
                    'null', (SELECT COUNT(*) FROM s WHERE col IS NULL OR cardinality(col) = 0),
                    'covered', (SELECT COUNT(*) FROM s WHERE col IS NOT NULL AND cardinality(col) > 0))
            $q$, v_column) INTO v_part USING v_ids, p_top_n;

        ELSIF v_udt IN ('text', 'bool', 'varchar') THEN
            EXECUTE format($q$
                WITH s AS (SELECT j.%1$I::text AS col FROM public.judgments j WHERE j.id = ANY($1)),
                     v AS (SELECT col AS value, COUNT(*) AS cnt FROM s WHERE col IS NOT NULL AND col <> '' GROUP BY col),
                     r AS (SELECT value, cnt, ROW_NUMBER() OVER (ORDER BY cnt DESC, value) AS rn FROM v)
                SELECT jsonb_build_object(
                    'kind', 'categorical', 'multi', false,
                    'values', COALESCE((SELECT jsonb_agg(jsonb_build_object('value', value, 'count', cnt) ORDER BY rn) FROM r WHERE rn <= $2), '[]'::jsonb),
                    'other', COALESCE((SELECT SUM(cnt) FROM r WHERE rn > $2), 0),
                    'null', (SELECT COUNT(*) FROM s WHERE col IS NULL OR col = ''),
                    'covered', (SELECT COUNT(*) FROM s WHERE col IS NOT NULL AND col <> ''))
            $q$, v_column) INTO v_part USING v_ids, p_top_n;

        ELSIF v_udt IN ('int2', 'int4', 'int8', 'numeric', 'float4', 'float8') THEN
            -- 20 equal-width buckets between min and max of the sample; a single
            -- distinct value yields one bucket [v, v].
            EXECUTE format($q$
                WITH s AS (SELECT j.%1$I::numeric AS col FROM public.judgments j WHERE j.id = ANY($1)),
                     b AS (SELECT MIN(col) AS lo, MAX(col) AS hi FROM s WHERE col IS NOT NULL),
                     w AS (SELECT lo, hi, CASE WHEN hi > lo THEN 20 ELSE 1 END AS n FROM b),
                     k AS (SELECT s.col,
                                  CASE WHEN w.hi > w.lo
                                       THEN LEAST(width_bucket(s.col, w.lo, w.hi, w.n), w.n)
                                       ELSE 1 END AS bk
                             FROM s, w WHERE s.col IS NOT NULL),
                     g AS (SELECT bk, COUNT(*) AS cnt FROM k GROUP BY bk),
                     e AS (SELECT gs AS bk,
                                  w.lo + (w.hi - w.lo) * (gs - 1) / w.n AS lo,
                                  CASE WHEN gs = w.n THEN w.hi ELSE w.lo + (w.hi - w.lo) * gs / w.n END AS hi
                             FROM w, generate_series(1, w.n) AS gs)
                SELECT jsonb_build_object(
                    'kind', 'numeric',
                    'buckets', COALESCE((SELECT jsonb_agg(jsonb_build_object('lo', e.lo, 'hi', e.hi, 'count', COALESCE(g.cnt, 0)) ORDER BY e.bk)
                                         FROM e LEFT JOIN g USING (bk)), '[]'::jsonb),
                    'min', (SELECT lo FROM b), 'max', (SELECT hi FROM b),
                    'null', (SELECT COUNT(*) FROM s WHERE col IS NULL),
                    'covered', (SELECT COUNT(*) FROM s WHERE col IS NOT NULL))
            $q$, v_column) INTO v_part USING v_ids;

        ELSIF v_udt IN ('date', 'timestamp', 'timestamptz') THEN
            EXECUTE format($q$
                WITH s AS (SELECT j.%1$I AS col FROM public.judgments j WHERE j.id = ANY($1)),
                     y AS (SELECT EXTRACT(YEAR FROM col)::int AS yr, COUNT(*) AS cnt FROM s WHERE col IS NOT NULL GROUP BY 1)
                SELECT jsonb_build_object(
                    'kind', 'year',
                    'values', COALESCE((SELECT jsonb_agg(jsonb_build_object('value', yr::text, 'count', cnt) ORDER BY yr) FROM y), '[]'::jsonb),
                    'null', (SELECT COUNT(*) FROM s WHERE col IS NULL),
                    'covered', (SELECT COUNT(*) FROM s WHERE col IS NOT NULL))
            $q$, v_column) INTO v_part USING v_ids;

        ELSE
            RAISE EXCEPTION 'field % is not aggregable (column type %)', v_field, v_udt USING ERRCODE = '22023';
        END IF;

        v_out := v_out || jsonb_build_object(v_field, v_part);
    END LOOP;

    RETURN jsonb_build_object('total', v_total, 'sample_n', v_sample_n, 'seed', p_seed, 'fields', v_out);
END;
$$;

REVOKE ALL ON FUNCTION public._aggregate_column_for_field(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._aggregate_column_for_field(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.aggregate_extracted_data(JSONB, TEXT, TEXT[], INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggregate_extracted_data(JSONB, TEXT, TEXT[], INT, INT, INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.aggregate_extracted_data(JSONB, TEXT, TEXT[], INT, INT, INT) IS
    'Per-field distributions over list_extracted_filter_matches, optionally over a seeded sample (#707).';
```

Notes for the implementer: `_base_field_to_column` (`20260226000001…sql:437`) returns `NULL` for names it does not know, so unknown fields fail at the `information_schema` lookup with the "not aggregable" message — that is what `test_unknown_field_is_rejected` expects. `base_did_offender_confess` is `BOOLEAN` (udt `bool`), so it takes the scalar-categorical branch and yields `"true"`/`"false"` values. `jsonb_build_object(v_field, v_part)` with a variable key requires `v_field` to be `TEXT` (it is).

- [ ] **Step 4: Apply the migration to the dev DB and run the contract tests**

Run: from the repo root, the same command `backend/tests/db/conftest.py` uses to migrate (read its top: it either applies `supabase/migrations/*.sql` in order against `DATABASE_URL` or expects `supabase db reset`). Then: `cd backend && poetry run pytest -q -m db tests/db/test_aggregate_contract.py tests/db/test_migration_chain.py`
Expected: all pass. If `test_sample_is_deterministic_per_seed_and_bounded` fails on the `a["fields"] != c["fields"]` line, the two seeds happened to draw the same 5 of 12 rows — change `p_seed=43` to `44` in the test (and note it in the commit body).

- [ ] **Step 5: Measure**

Run against the dev DB (all rows, default fields):

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT public.aggregate_extracted_data('{}'::jsonb, NULL, NULL, NULL, NULL, 20);
```

Expected: total execution time ≤ 1500 ms. Paste the `Execution Time` line into the PR body. If over: check that `judgments.id` is the PK (it is) so `= ANY($1)` hash-joins; if one field dominates, drop it from the default set in Task 0's JSON + Task 1's Python + this SQL (all three) and say so.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260921000003_aggregate_extracted_data.sql backend/tests/db/test_aggregate_contract.py backend/tests/db/test_migration_chain.py
git commit -m "feat(db): add aggregate_extracted_data over the shared filter cohort

Refs #707"
```

---

### Task 3: Endpoint `POST /extractions/base-schema/aggregate` + BFF route

**Files:**
- Modify: `backend/app/models.py` (after `ExtractedDataFilterRequest`, line ~380)
- Modify: `backend/app/extraction_domain/results_router.py` (new handler after `filter_by_extracted_data`, line ~520)
- Create: `frontend/app/api/extractions/base-schema/aggregate/route.ts`
- Test: `backend/tests/app/test_aggregate_router.py`

**Interfaces:**
- Consumes: `validate_fields` (Task 1); RPC (Task 2); `get_current_user`, `AuthenticatedUser` from `app.core.auth_jwt`.
- Produces (B2 mirrors these in TS):

```python
class AggregateRequest(BaseModel):
    filters: dict[str, Any] = {}
    text_query: str | None = None
    fields: list[str] | None = None        # None = default set
    sample_size: int | None = None         # ge=1, le=20000
    seed: int | None = None                # required when sample_size is set
    top_n: int = 20                        # ge=1, le=100

class AggregateResponse(BaseModel):
    total: int
    sample_n: int
    seed: int | None
    fields: dict[str, dict[str, Any]]
```

- [ ] **Step 1: Write the failing tests**

`backend/tests/app/test_aggregate_router.py` (same fixtures as `test_extraction_results_router.py`: `client`, `valid_api_headers`, `_install_jwt_user_override`):

```python
"""POST /extractions/base-schema/aggregate (#707)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from tests.app.conftest import _install_jwt_user_override

pytestmark = pytest.mark.unit

URL = "/extractions/base-schema/aggregate"
RPC_RESULT = {"total": 3, "sample_n": 2, "seed": 7, "fields": {"appeal_outcome": {"kind": "categorical", "multi": True, "values": [], "other": 0, "null": 0, "covered": 2}}}


def _supabase(data):
    mock_response = MagicMock()
    mock_response.data = data
    mock_supabase = MagicMock()
    mock_supabase.rpc.return_value.execute.return_value = mock_response
    return mock_supabase


@pytest.fixture(autouse=True)
def _user():
    _install_jwt_user_override("11111111-1111-4111-8111-111111111111")


class TestAggregate:
    @pytest.mark.asyncio
    async def test_calls_rpc_with_defaults_and_returns_payload(self, client, valid_api_headers):
        sb = _supabase(RPC_RESULT)
        with patch("app.extraction_domain.results_router.supabase", sb):
            r = await client.post(URL, json={"filters": {"appeal_outcome": ["allowed"]}}, headers=valid_api_headers)
        assert r.status_code == 200, r.text
        assert r.json() == RPC_RESULT
        name, params = sb.rpc.call_args.args
        assert name == "aggregate_extracted_data"
        assert params["p_filters"] == {"appeal_outcome": ["allowed"]}
        assert params["p_text_query"] is None
        assert params["p_fields"][:2] == ["offender_age_offence", "offender_gender"]
        assert params["p_sample_size"] is None and params["p_seed"] is None and params["p_top_n"] == 20

    @pytest.mark.asyncio
    async def test_unwraps_a_one_element_list_from_the_client(self, client, valid_api_headers):
        # supabase-py returns a scalar-returning function's value as the value
        # itself; some client versions wrap it in a one-element list.
        sb = _supabase([RPC_RESULT])
        with patch("app.extraction_domain.results_router.supabase", sb):
            r = await client.post(URL, json={}, headers=valid_api_headers)
        assert r.status_code == 200 and r.json()["total"] == 3

    @pytest.mark.asyncio
    async def test_passes_sampling_and_fields_through(self, client, valid_api_headers):
        sb = _supabase(RPC_RESULT)
        with patch("app.extraction_domain.results_router.supabase", sb):
            r = await client.post(URL, json={"fields": ["appeal_outcome", "court_name"], "sample_size": 100, "seed": 7, "top_n": 5}, headers=valid_api_headers)
        assert r.status_code == 200
        params = sb.rpc.call_args.args[1]
        assert params["p_fields"] == ["appeal_outcome", "court_name"]
        assert (params["p_sample_size"], params["p_seed"], params["p_top_n"]) == (100, 7, 5)

    @pytest.mark.asyncio
    async def test_sample_size_without_seed_is_422(self, client, valid_api_headers):
        with patch("app.extraction_domain.results_router.supabase", _supabase(RPC_RESULT)):
            r = await client.post(URL, json={"sample_size": 10}, headers=valid_api_headers)
        assert r.status_code == 422
        assert "seed" in r.text

    @pytest.mark.asyncio
    async def test_unknown_field_is_422_and_names_it(self, client, valid_api_headers):
        with patch("app.extraction_domain.results_router.supabase", _supabase(RPC_RESULT)):
            r = await client.post(URL, json={"fields": ["case_name"]}, headers=valid_api_headers)
        assert r.status_code == 422
        assert "case_name" in r.text

    @pytest.mark.asyncio
    async def test_collection_ids_rejected_like_filter_endpoint(self, client, valid_api_headers):
        sb = _supabase(RPC_RESULT)
        with patch("app.extraction_domain.results_router.supabase", sb):
            r = await client.post(URL, json={"filters": {"collection_ids": ["x"]}}, headers=valid_api_headers)
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "COLLECTION_IDS_NOT_ALLOWED"
        sb.rpc.assert_not_called()

    @pytest.mark.asyncio
    async def test_database_unavailable_is_503(self, client, valid_api_headers):
        with patch("app.extraction_domain.results_router.supabase", None):
            r = await client.post(URL, json={}, headers=valid_api_headers)
        assert r.status_code == 503


@pytest.mark.asyncio
async def test_requires_bearer_user(client, valid_api_headers):
    # Remove the autouse override for this one test by resolving the real dependency.
    from app.core.auth_jwt import get_current_user
    from app.server import app

    app.dependency_overrides.pop(get_current_user, None)
    try:
        with patch("app.extraction_domain.results_router.supabase", _supabase(RPC_RESULT)):
            r = await client.post(URL, json={}, headers=valid_api_headers)
        assert r.status_code in (401, 403)
    finally:
        _install_jwt_user_override("11111111-1111-4111-8111-111111111111")
```

Check `backend/tests/app/conftest.py` for the exact `client` fixture (httpx `AsyncClient` — the existing router tests use `await client.post`) and whether `_install_jwt_user_override` registers on `app.server.app.dependency_overrides`; adjust the last test's import to whatever module owns `app`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && poetry run pytest -q -m unit tests/app/test_aggregate_router.py`
Expected: all FAIL with 404 (route missing) or 405.

- [ ] **Step 3: Add the models**

In `backend/app/models.py`, directly after `ExtractedDataFilterRequest`:

```python
class AggregateRequest(BaseModel):
    """Request for POST /extractions/base-schema/aggregate (#707)."""

    filters: dict[str, Any] = Field(
        default_factory=dict,
        description="Same shape as ExtractedDataFilterRequest.filters (list_extracted_filter_matches keys)",
    )
    text_query: str | None = Field(default=None, description="Full-text query across text fields")
    fields: list[str] | None = Field(
        default=None,
        description="Fields to aggregate; null = the default set. Must be aggregable (see aggregate_fields.py).",
    )
    sample_size: int | None = Field(default=None, ge=1, le=20000, description="Seeded random sample size; null = whole cohort")
    seed: int | None = Field(default=None, description="Required when sample_size is set")
    top_n: int = Field(default=20, ge=1, le=100, description="Values kept per categorical field; the rest fold into 'other'")

    @model_validator(mode="after")
    def _seed_required_with_sample(self) -> "AggregateRequest":
        if self.sample_size is not None and self.seed is None:
            raise ValueError("seed is required when sample_size is set")
        return self


class AggregateResponse(BaseModel):
    """Response for POST /extractions/base-schema/aggregate — mirrors the RPC's JSONB."""

    total: int
    sample_n: int
    seed: int | None = None
    fields: dict[str, dict[str, Any]]
```

Add `model_validator` to the existing `from pydantic import …` line at the top of `models.py` if it is not already imported.

- [ ] **Step 4: Add the handler**

In `backend/app/extraction_domain/results_router.py`, add to the imports:

```python
from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.extraction_domain.aggregate_fields import validate_fields
from app.models import AggregateRequest, AggregateResponse
```

(merge into the existing `from app.models import (...)` block.) Then, directly after the `filter_by_extracted_data` handler:

```python
@router.post(
    "/base-schema/aggregate",
    response_model=AggregateResponse,
    summary="Aggregate extracted data over a cohort",
    description=(
        "Per-field distributions (categorical / numeric / year) over the judgments "
        "matching the filters, optionally over a seeded random sample. Login required."
    ),
)
async def aggregate_extracted_data(
    request: AggregateRequest,
    user: AuthenticatedUser = Depends(get_current_user),  # noqa: ARG001 — gate only; the cohort is corpus-wide
):
    # Same rationale as filter_by_extracted_data: the RPC is SECURITY INVOKER and
    # we call it with the service-role client, so `collection_ids` would let any
    # signed-in caller probe any collection's membership. #685 owns lifting this.
    if "collection_ids" in request.filters:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Filter Not Allowed",
                "message": (
                    "The 'collection_ids' filter is not allowed on this endpoint. "
                    "Use POST /collections/from-filter, which authenticates the "
                    "caller and verifies collection ownership."
                ),
                "code": "COLLECTION_IDS_NOT_ALLOWED",
            },
        )
    try:
        fields = validate_fields(request.fields)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": "Invalid Fields", "message": str(exc), "code": "FIELD_NOT_AGGREGABLE"}) from exc
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail={"error": "Database Unavailable", "message": "Database connection not available.", "code": "DATABASE_UNAVAILABLE"},
        )
    try:
        response = supabase.rpc(
            "aggregate_extracted_data",
            {
                "p_filters": request.filters,
                "p_text_query": request.text_query,
                "p_fields": fields,
                "p_sample_size": request.sample_size,
                "p_seed": request.seed,
                "p_top_n": request.top_n,
            },
        ).execute()
    except Exception as exc:  # supabase-py raises APIError on RPC failure
        logger.exception("aggregate_extracted_data failed")
        raise HTTPException(
            status_code=500,
            detail={"error": "Aggregation Failed", "message": "The statistics could not be computed.", "code": "AGGREGATE_FAILED"},
        ) from exc
    payload = response.data
    # A JSONB-returning function comes back as the value itself; some client
    # versions wrap scalar results in a one-element list.
    if isinstance(payload, list):
        payload = payload[0] if payload else None
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=500,
            detail={"error": "Aggregation Failed", "message": "Unexpected response from the database.", "code": "AGGREGATE_FAILED"},
        )
    return AggregateResponse(**payload)
```

Confirm `logger` and `HTTPException`/`Depends` are already imported in this file (they are used by the neighbouring handlers).

- [ ] **Step 5: BFF route**

`frontend/app/api/extractions/base-schema/aggregate/route.ts`:

```ts
import { NextRequest } from "next/server";

import { proxyToBackend } from "@/app/api/utils/backend-proxy";

/**
 * POST /api/extractions/base-schema/aggregate → backend
 * POST /extractions/base-schema/aggregate (#707). proxyToBackend requires a
 * signed-in session and forwards the Bearer token, which the backend's
 * get_current_user dependency checks.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend({ path: "/extractions/base-schema/aggregate", method: "POST", body });
}
```

- [ ] **Step 6: Run tests, lint, OpenAPI**

Run: `cd backend && poetry run pytest -q -m unit tests/app/test_aggregate_router.py tests/app/test_extraction_results_router.py && poetry run ruff check . && poetry run ruff format --check .`
Expected: all pass, ruff clean.

The `OpenAPI Type Drift` check compares `scripts/openapi-snapshot.json` and `frontend/lib/api/generated/openapi.ts` against the live schema. Regenerate both with `scripts/regen_openapi_types.sh` from the repo root (it writes the snapshot, then runs `npm run gen:openapi` in `frontend/`); PR #701's last commit `d2180b07 chore(openapi): regenerate snapshot and types for POST /collections/from-filter` is the precedent. Commit the regenerated files in the same commit.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/app/extraction_domain/results_router.py backend/tests/app/test_aggregate_router.py frontend/app/api/extractions/base-schema/aggregate/route.ts scripts/openapi-snapshot.json frontend/lib/api/generated/openapi.ts
git commit -m "feat(stats): add POST /extractions/base-schema/aggregate and its BFF route

Refs #707"
```

---

### Task 4: B1 verification, PR, merge

- [ ] **Step 1: Full gates**

Run: `cd backend && poetry run poe check-all` (lint + format + unit tests) and `cd backend && poetry run pytest -q -m db` (whole db tier); `cd frontend && npm run validate`.
Expected: all green. Quote the pytest summary lines in the PR body.

- [ ] **Step 2: Reviewer, push, PR**

Spawn a reviewer on `git diff origin/main...HEAD`. Then:

```bash
git push -u origin feat/707-aggregate-rpc
gh pr create --base main --title "feat(stats): aggregate_extracted_data RPC and POST /extractions/base-schema/aggregate" --body-file <body>
```

PR body: summary, the `EXPLAIN ANALYZE` execution time from Task 2 Step 5, test summaries, "`collection_ids` rejected — same rationale as `/base-schema/filter`; statistics over a collection tracked in #685", `Closes #707`, `Refs #687 #682`.

- [ ] **Step 3: Merge**

When the seven required checks are green: `gh pr merge <n> --merge --delete-branch`; remove the worktree. **B2 starts from `origin/main` after this merge.**

---

# Part B2 — frontend (#708), branch `feat/708-statistics-view`

Create the worktree only after #707 is on `main`:

```bash
git fetch origin && git worktree add .worktrees/feat-708-statistics-view -b feat/708-statistics-view origin/main
cp -al frontend/node_modules .worktrees/feat-708-statistics-view/frontend/node_modules
```

### Task 5: Move chart primitives to `components/charts/`

**Files:**
- Move: `frontend/app/dataset-comparison/_components/HorizontalBarChart.tsx` → `frontend/components/charts/HorizontalBarChart.tsx`; same for `BivariateBarChart.tsx`
- Create: `frontend/components/charts/index.ts`; re-export shims at the old paths
- Test: existing `dataset-comparison` tests (if any: `grep -rl "HorizontalBarChart\|BivariateBarChart" frontend/__tests__`) must pass unchanged

- [ ] **Step 1: Move with history**

```bash
cd frontend
mkdir -p components/charts
git mv app/dataset-comparison/_components/HorizontalBarChart.tsx components/charts/HorizontalBarChart.tsx
git mv app/dataset-comparison/_components/BivariateBarChart.tsx components/charts/BivariateBarChart.tsx
```

`frontend/components/charts/index.ts`:

```ts
export { HorizontalBarChart } from "./HorizontalBarChart";
export type { HorizontalBarChartProps, HorizontalBarItem } from "./HorizontalBarChart";
export { BivariateBarChart } from "./BivariateBarChart";
export type { BivariateBarChartProps } from "./BivariateBarChart";
```

If `HorizontalBarChartProps` / `HorizontalBarItem` / `BivariateBarChartProps` are not exported from the component files, add `export` to those `interface` declarations (they are declared at `HorizontalBarChart.tsx:18-41` and `BivariateBarChart.tsx:19-40`).

Shims — `frontend/app/dataset-comparison/_components/HorizontalBarChart.tsx`:

```ts
// Moved to components/charts (#708). Kept so /dataset-comparison and #684's
// compare view import from either path until both are migrated.
export { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
export type { HorizontalBarChartProps, HorizontalBarItem } from "@/components/charts/HorizontalBarChart";
```

and the same shape for `BivariateBarChart.tsx`. Any relative imports inside the moved files (e.g. `../…`) must be rewritten to `@/…` aliases.

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck && npx eslint --max-warnings 0 components/charts app/dataset-comparison/_components && npx jest dataset-comparison`
Expected: typecheck 0; eslint clean; any existing dataset-comparison suites pass (or "no tests found", which is fine).

- [ ] **Step 3: Commit**

```bash
git add -A frontend/components/charts frontend/app/dataset-comparison/_components
git commit -m "refactor(charts): move bar chart primitives to components/charts

Refs #708"
```

---

### Task 6: Types, allowlist module, API hook, URL codec

**Files:**
- Modify: `frontend/types/base-schema-filter.ts` (append)
- Create: `frontend/lib/extractions/aggregate-fields.ts`
- Modify: `frontend/lib/extractions/base-schema-filter-api.ts` (append)
- Modify: `frontend/lib/extractions/use-extracted-data-filters.ts` (`FilterUrlState`, `buildFilterSearchParams`, hook state + setters)
- Tests: `frontend/__tests__/lib/extractions/aggregate-fields.test.ts`, `frontend/__tests__/lib/extractions/use-extracted-data-filters.stats.test.ts`

**Interfaces:**
- Produces:

```ts
// types/base-schema-filter.ts
export type FieldAggregate =
  | { kind: "categorical"; multi: boolean; values: { value: string; count: number }[]; other: number; null: number; covered: number }
  | { kind: "numeric"; buckets: { lo: number; hi: number; count: number }[]; null: number; covered: number; min: number | null; max: number | null }
  | { kind: "year"; values: { value: string; count: number }[]; null: number; covered: number };
export interface AggregateRequest { filters: BaseSchemaFilters; text_query?: string; fields?: string[]; sample_size?: number; seed?: number; top_n?: number }
export interface AggregateResponse { total: number; sample_n: number; seed: number | null; fields: Record<string, FieldAggregate> }

// lib/extractions/aggregate-fields.ts
export const AGGREGABLE_FIELDS: readonly string[]; export const DEFAULT_AGGREGATE_FIELDS: readonly string[];
export function isAggregableField(f: string): boolean; export function aggregateFieldLabel(f: string): string;
export const SCALE_STOPS: readonly number[] = [10, 50, 100, 1000, 5000];   // "all" = undefined

// lib/extractions/base-schema-filter-api.ts
export function useExtractionAggregate(request: AggregateRequest, enabled?: boolean): UseQueryResult<AggregateResponse>;

// lib/extractions/use-extracted-data-filters.ts
export type ResultView = "list" | "stats";
export interface FilterUrlState { …existing; view?: ResultView; sampleSize?: number; seed?: number; fields?: string[] }
// hook returns additionally: view, sampleSize, seed, statsFields, setView, setSampling(sampleSize?, seed?), setStatsFields, reshuffle()
```

URL params: `view=stats` (omitted for list), `n=<int>` (omitted for all), `seed=<int>`, `fields=a,b,c` (omitted when equal to the default set).

- [ ] **Step 1: Write the failing tests**

`frontend/__tests__/lib/extractions/aggregate-fields.test.ts`:

```ts
import canonical from "@/lib/extractions/aggregable-fields.json";
import {
  AGGREGABLE_FIELDS,
  DEFAULT_AGGREGATE_FIELDS,
  SCALE_STOPS,
  aggregateFieldLabel,
  isAggregableField,
} from "@/lib/extractions/aggregate-fields";
import { FILTER_FIELDS } from "@/lib/extractions/base-schema-filter-config";

describe("aggregate-fields", () => {
  it("mirrors the canonical JSON", () => {
    expect([...AGGREGABLE_FIELDS]).toEqual(canonical.fields);
    expect([...DEFAULT_AGGREGATE_FIELDS]).toEqual(canonical.default);
  });

  it("never lists a free-text (substring) filter field", () => {
    const substring = FILTER_FIELDS.filter((f) => f.control === "substring").map((f) => f.field);
    for (const f of substring) expect(isAggregableField(f)).toBe(false);
  });

  it("labels filter fields from the filter config and core fields from its own map", () => {
    expect(aggregateFieldLabel("appeal_outcome")).toBe(FILTER_FIELDS.find((f) => f.field === "appeal_outcome")!.label);
    expect(aggregateFieldLabel("court_name")).toBe("Court");
    expect(aggregateFieldLabel("deep_complexity_score")).toMatch(/model score/i);
    expect(aggregateFieldLabel("no_such_field")).toBe("no_such_field");
  });

  it("has ascending scale stops below the corpus size", () => {
    expect(SCALE_STOPS).toEqual([10, 50, 100, 1000, 5000]);
  });
});
```

`frontend/__tests__/lib/extractions/use-extracted-data-filters.stats.test.ts`:

```ts
/**
 * The statistics view keeps its state (view, sample size, seed, fields) in the
 * same URL codec as the filters (#708). The hook's writeUrl replaces the whole
 * query string, so these MUST live in FilterUrlState or they would be wiped on
 * every filter change.
 */
import { buildFilterHref, buildFilterSearchParams } from "@/lib/extractions/use-extracted-data-filters";

describe("stats params in the filter URL codec", () => {
  it("omits every stats param at defaults", () => {
    const qs = buildFilterSearchParams({ filters: {} }).toString();
    expect(qs).toBe("");
  });

  it("writes view, n, seed and fields", () => {
    const qs = buildFilterSearchParams({
      filters: { appeal_outcome: ["allowed"] },
      view: "stats",
      sampleSize: 1000,
      seed: 42,
      fields: ["court_name", "appeal_outcome"],
    });
    expect(qs.get("view")).toBe("stats");
    expect(qs.get("n")).toBe("1000");
    expect(qs.get("seed")).toBe("42");
    expect(qs.get("fields")).toBe("court_name,appeal_outcome");
    expect(qs.get("f")).toBeTruthy();
  });

  it("omits fields when they equal the default set, and n when undefined (all)", () => {
    const qs = buildFilterSearchParams({
      filters: {},
      view: "stats",
      seed: 1,
      fields: ["offender_age_offence", "offender_gender", "convict_offences", "sentences_received", "appeal_outcome", "did_offender_confess", "court_name", "decision_date"],
    });
    expect(qs.has("fields")).toBe(false);
    expect(qs.has("n")).toBe(false);
    expect(qs.get("view")).toBe("stats");
  });

  it("buildFilterHref carries the stats params", () => {
    expect(buildFilterHref("/search/extractions", { filters: {}, view: "stats", seed: 7 })).toBe(
      "/search/extractions?view=stats&seed=7",
    );
  });
});
```

Plus, in the same file, a hook test using `renderHook` from `@testing-library/react` with `next/navigation` mocked so `useSearchParams` returns `new URLSearchParams("view=stats&n=50&seed=9&fields=court_name")` and `useRouter().replace` is a `jest.fn()`:

```ts
import { act, renderHook } from "@testing-library/react";

const replace = jest.fn();
let search = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useExtractedDataFilters } = require("@/lib/extractions/use-extracted-data-filters");

describe("useExtractedDataFilters stats state", () => {
  beforeEach(() => { replace.mockClear(); });

  it("reads view, n, seed, fields from the URL", () => {
    search = "view=stats&n=50&seed=9&fields=court_name";
    const { result } = renderHook(() => useExtractedDataFilters());
    expect(result.current.view).toBe("stats");
    expect(result.current.sampleSize).toBe(50);
    expect(result.current.seed).toBe(9);
    expect(result.current.statsFields).toEqual(["court_name"]);
  });

  it("defaults to list / all / default fields, and reshuffle assigns a new seed", () => {
    search = "";
    const { result } = renderHook(() => useExtractedDataFilters());
    expect(result.current.view).toBe("list");
    expect(result.current.sampleSize).toBeUndefined();
    expect(result.current.statsFields.length).toBe(8);
    const before = result.current.seed;
    act(() => result.current.reshuffle());
    expect(result.current.seed).not.toBe(before);
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining("seed="), { scroll: false });
  });

  it("setFilters keeps the view and sampling but resets the page", () => {
    search = "view=stats&n=100&seed=3&page=2";
    const { result } = renderHook(() => useExtractedDataFilters());
    act(() => result.current.setFilters({ appeal_outcome: ["allowed"] }));
    expect(result.current.view).toBe("stats");
    expect(result.current.sampleSize).toBe(100);
    expect(result.current.page).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx jest __tests__/lib/extractions/aggregate-fields.test.ts __tests__/lib/extractions/use-extracted-data-filters.stats.test.ts`
Expected: FAIL — module not found / `view` undefined.

- [ ] **Step 3: Types**

Append to `frontend/types/base-schema-filter.ts`:

```ts
// ---------------------------------------------------------------------------
// Statistics over a cohort (#707 / #708) — mirrors backend AggregateRequest /
// AggregateResponse and the RPC's JSONB.
// ---------------------------------------------------------------------------

export interface AggregateValueCount {
  value: string;
  count: number;
}

export interface AggregateBucket {
  lo: number;
  hi: number;
  count: number;
}

export type FieldAggregate =
  | { kind: "categorical"; multi: boolean; values: AggregateValueCount[]; other: number; null: number; covered: number }
  | { kind: "numeric"; buckets: AggregateBucket[]; null: number; covered: number; min: number | null; max: number | null }
  | { kind: "year"; values: AggregateValueCount[]; null: number; covered: number };

export interface AggregateRequest {
  filters: BaseSchemaFilters;
  text_query?: string;
  fields?: string[];
  sample_size?: number;
  seed?: number;
  top_n?: number;
}

export interface AggregateResponse {
  total: number;
  sample_n: number;
  seed: number | null;
  fields: Record<string, FieldAggregate>;
}
```

- [ ] **Step 4: Allowlist module**

`frontend/lib/extractions/aggregate-fields.ts`:

```ts
/**
 * Aggregable fields for the Statistics view (#708). The canonical list is
 * aggregable-fields.json (shared with the backend, which has a test pinning
 * its Python mirror to the same file). Labels come from the filter config
 * where a filter exists, otherwise from CORE_LABELS.
 */
import canonical from "./aggregable-fields.json";
import { ALL_FILTER_FIELD_BY_NAME } from "./base-schema-filter-config";

export const AGGREGABLE_FIELDS: readonly string[] = canonical.fields;
export const DEFAULT_AGGREGATE_FIELDS: readonly string[] = canonical.default;

/** Sample sizes offered by the scale slider; `undefined` means the whole cohort. */
export const SCALE_STOPS: readonly number[] = [10, 50, 100, 1000, 5000];

const CORE_LABELS: Record<string, string> = {
  court_name: "Court",
  offender_age_offence: "Offender age at offence",
  deep_complexity_score: "Complexity (model score)",
  deep_reasoning_quality_score: "Reasoning quality (model score)",
  deep_legal_domains: "Legal domains (model)",
  deep_reasoning_patterns: "Reasoning patterns (model)",
  deep_judicial_tone: "Judicial tone (model)",
  deep_precedential_value: "Precedential value (model)",
};

const SET = new Set(AGGREGABLE_FIELDS);

export function isAggregableField(field: string): boolean {
  return SET.has(field);
}

export function aggregateFieldLabel(field: string): string {
  return ALL_FILTER_FIELD_BY_NAME[field]?.label ?? CORE_LABELS[field] ?? field;
}
```

If `tsconfig.json` lacks `"resolveJsonModule": true`, add it (Next.js templates have it on by default — check before editing).

- [ ] **Step 5: API hook**

Append to `frontend/lib/extractions/base-schema-filter-api.ts` (extend the type import at the top with `AggregateRequest, AggregateResponse`):

```ts
const AGGREGATE_URL = "/api/extractions/base-schema/aggregate";

async function postAggregate(
  request: AggregateRequest,
  signal?: AbortSignal,
): Promise<AggregateResponse> {
  const response = await fetch(AGGREGATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Aggregate request failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as AggregateResponse;
}

/** Statistics over the cohort defined by `request.filters` (#708). */
export function useExtractionAggregate(request: AggregateRequest, enabled: boolean = true) {
  return useQuery({
    queryKey: ["base-schema-aggregate", request],
    queryFn: ({ signal }) => postAggregate(request, signal),
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  });
}
```

Match `useExtractionResults`'s options exactly for `staleTime`/`placeholderData` (read `base-schema-filter-api.ts:61-73`) so both views behave the same while refetching.

- [ ] **Step 6: URL codec + hook**

In `frontend/lib/extractions/use-extracted-data-filters.ts`:

1. Add near the top: `import { DEFAULT_AGGREGATE_FIELDS, isAggregableField } from "./aggregate-fields";` and

```ts
export type ResultView = "list" | "stats";

function sameFields(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function parseFields(raw: string | null): string[] {
  if (!raw) return [...DEFAULT_AGGREGATE_FIELDS];
  const fields = raw.split(",").map((s) => s.trim()).filter(isAggregableField);
  return fields.length > 0 ? fields : [...DEFAULT_AGGREGATE_FIELDS];
}

function parseInt1(raw: string | null): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
```

2. Extend `FilterUrlState`:

```ts
export interface FilterUrlState {
  filters: BaseSchemaFilters;
  textQuery?: string;
  page?: number;
  nlQuestion?: string;
  /** Statistics view state (#708). All optional; omitted at defaults. */
  view?: ResultView;
  sampleSize?: number;
  seed?: number;
  fields?: string[];
}
```

3. In `buildFilterSearchParams`, after the `nl` line:

```ts
  if (state.view === "stats") params.set("view", "stats");
  if (state.sampleSize !== undefined) params.set("n", String(state.sampleSize));
  if (state.seed !== undefined) params.set("seed", String(state.seed));
  if (state.fields && !sameFields(state.fields, DEFAULT_AGGREGATE_FIELDS)) params.set("fields", state.fields.join(","));
```

4. In the hook: extend `FilterState` (the internal type near line ~30) with `view: ResultView; sampleSize?: number; seed: number; statsFields: string[]`, parse them in `initial`:

```ts
      view: searchParams.get("view") === "stats" ? "stats" : "list",
      sampleSize: parseInt1(searchParams.get("n")),
      seed: parseInt1(searchParams.get("seed")) ?? newSeed(),
      statsFields: parseFields(searchParams.get("fields")),
```

In `writeUrl`, pass them through: `buildFilterSearchParams({ ...next, fields: next.statsFields })` — and only emit `seed` when `view === "stats"` so list URLs stay as they are today:

```ts
      const queryString = buildFilterSearchParams({
        ...next,
        seed: next.view === "stats" ? next.seed : undefined,
        fields: next.view === "stats" ? next.statsFields : undefined,
        sampleSize: next.view === "stats" ? next.sampleSize : undefined,
      }).toString();
```

Add setters next to `setPage`:

```ts
  const setView = useCallback((view: ResultView) => {
    setState((prev) => ({ ...prev, view }));
  }, []);
  const setSampling = useCallback((sampleSize: number | undefined, seed?: number) => {
    setState((prev) => ({ ...prev, sampleSize, seed: seed ?? prev.seed }));
  }, []);
  const reshuffle = useCallback(() => {
    setState((prev) => ({ ...prev, seed: newSeed() }));
  }, []);
  const setStatsFields = useCallback((fields: string[]) => {
    setState((prev) => ({ ...prev, statsFields: fields.filter(isAggregableField) }));
  }, []);
```

and return them (`view`, `sampleSize`, `seed`, `statsFields`, `setView`, `setSampling`, `reshuffle`, `setStatsFields`) — extend `UseExtractedDataFiltersResult` accordingly. `setFilters`, `setTextQuery`, `removeFilter`, `clearAll` spread `prev`, so they keep the stats state automatically (the test "setFilters keeps the view" pins this).

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `cd frontend && npx jest __tests__/lib/extractions && npm run typecheck && npx eslint --max-warnings 0 types/base-schema-filter.ts lib/extractions/aggregate-fields.ts lib/extractions/base-schema-filter-api.ts lib/extractions/use-extracted-data-filters.ts __tests__/lib/extractions/aggregate-fields.test.ts __tests__/lib/extractions/use-extracted-data-filters.stats.test.ts`
Expected: all `__tests__/lib/extractions` suites pass (including #682's existing `use-extracted-data-filters.test.ts` and `drawer-adapter.test.ts` — the codec must stay backward-compatible); typecheck 0; eslint clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/types/base-schema-filter.ts frontend/lib/extractions/aggregate-fields.ts frontend/lib/extractions/base-schema-filter-api.ts frontend/lib/extractions/use-extracted-data-filters.ts frontend/__tests__/lib/extractions/aggregate-fields.test.ts frontend/__tests__/lib/extractions/use-extracted-data-filters.stats.test.ts
git commit -m "feat(stats): aggregate types, field allowlist, query hook and URL state

Refs #708"
```

---

### Task 7: Export helpers (pure)

**Files:**
- Create: `frontend/lib/extractions/stats-export.ts`
- Test: `frontend/__tests__/lib/extractions/stats-export.test.ts`

**Interfaces:**

```ts
export interface CohortDefinition { filters: BaseSchemaFilters; text_query?: string; sample_size?: number; seed: number | null; corpus_total: number; cohort_total: number; sample_n: number; fields: string[]; schema_version: "base-v1"; generated_at: string; app_version?: string }
export function buildCohortDefinition(args: { filters; textQuery?; response: AggregateResponse; fields: string[]; corpusTotal: number; now?: Date }): CohortDefinition;
export function aggregateToCsv(response: AggregateResponse, labels: (field: string) => string): string;
```

- [ ] **Step 1: Failing test**

`frontend/__tests__/lib/extractions/stats-export.test.ts`:

```ts
import { aggregateToCsv, buildCohortDefinition } from "@/lib/extractions/stats-export";
import type { AggregateResponse } from "@/types/base-schema-filter";

const response: AggregateResponse = {
  total: 120,
  sample_n: 50,
  seed: 42,
  fields: {
    appeal_outcome: { kind: "categorical", multi: true, values: [{ value: "dismissed", count: 30 }, { value: "allowed", count: 15 }], other: 2, null: 3, covered: 47 },
    num_victims: { kind: "numeric", buckets: [{ lo: 0, hi: 1, count: 20 }, { lo: 1, hi: 2, count: 27 }], null: 3, covered: 47, min: 0, max: 2 },
    decision_date: { kind: "year", values: [{ value: "2019", count: 50 }], null: 0, covered: 50 },
  },
};

describe("aggregateToCsv", () => {
  it("emits one row per value/bucket plus other and null rows, with label, share of covered", () => {
    const csv = aggregateToCsv(response, (f) => f.toUpperCase());
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("field,label,kind,value,count,share_of_covered,covered,null");
    expect(lines).toContain('appeal_outcome,APPEAL_OUTCOME,categorical,dismissed,30,0.6383,47,3');
    expect(lines).toContain('appeal_outcome,APPEAL_OUTCOME,categorical,__other__,2,0.0426,47,3');
    expect(lines).toContain('num_victims,NUM_VICTIMS,numeric,0–1,20,0.4255,47,3');
    expect(lines).toContain('decision_date,DECISION_DATE,year,2019,50,1.0000,50,0');
  });

  it("quotes values containing commas or quotes", () => {
    const r: AggregateResponse = { ...response, fields: { court_name: { kind: "categorical", multi: false, values: [{ value: 'Court of Appeal, "Criminal"', count: 1 }], other: 0, null: 0, covered: 1 } } };
    expect(aggregateToCsv(r, (f) => f)).toContain('"Court of Appeal, ""Criminal"""');
  });
});

describe("buildCohortDefinition", () => {
  it("captures everything needed to reproduce the sample", () => {
    const def = buildCohortDefinition({
      filters: { appeal_outcome: ["allowed"] },
      textQuery: "narkotyki",
      response,
      fields: ["appeal_outcome", "num_victims", "decision_date"],
      corpusTotal: 12907,
      now: new Date("2026-09-21T10:00:00Z"),
    });
    expect(def).toEqual({
      filters: { appeal_outcome: ["allowed"] },
      text_query: "narkotyki",
      sample_size: 50,
      seed: 42,
      corpus_total: 12907,
      cohort_total: 120,
      sample_n: 50,
      fields: ["appeal_outcome", "num_victims", "decision_date"],
      schema_version: "base-v1",
      generated_at: "2026-09-21T10:00:00.000Z",
    });
  });

  it("omits sample_size when the whole cohort was used", () => {
    const def = buildCohortDefinition({ filters: {}, response: { ...response, sample_n: 120, seed: null }, fields: [], corpusTotal: 12907 });
    expect(def.sample_size).toBeUndefined();
    expect(def.seed).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `cd frontend && npx jest __tests__/lib/extractions/stats-export.test.ts` → module not found.

- [ ] **Step 3: Implement**

`frontend/lib/extractions/stats-export.ts`:

```ts
/**
 * Export helpers for the Statistics view (#708): a flat CSV of the aggregate
 * and a cohort.json that reproduces the sample (spec §5.2 item 6 — the
 * "replicability of case selection" artefact).
 */
import type { AggregateResponse, BaseSchemaFilters } from "@/types/base-schema-filter";

export interface CohortDefinition {
  filters: BaseSchemaFilters;
  text_query?: string;
  sample_size?: number;
  seed: number | null;
  corpus_total: number;
  cohort_total: number;
  sample_n: number;
  fields: string[];
  schema_version: "base-v1";
  generated_at: string;
}

export function buildCohortDefinition(args: {
  filters: BaseSchemaFilters;
  textQuery?: string;
  response: AggregateResponse;
  fields: string[];
  corpusTotal: number;
  now?: Date;
}): CohortDefinition {
  const { filters, textQuery, response, fields, corpusTotal } = args;
  const sampled = response.sample_n < response.total;
  const def: CohortDefinition = {
    filters,
    seed: response.seed,
    corpus_total: corpusTotal,
    cohort_total: response.total,
    sample_n: response.sample_n,
    fields,
    schema_version: "base-v1",
    generated_at: (args.now ?? new Date()).toISOString(),
  };
  if (textQuery && textQuery.trim() !== "") def.text_query = textQuery.trim();
  if (sampled) def.sample_size = response.sample_n;
  // key order matters for readers diffing two exports; rebuild in a fixed order
  return {
    filters: def.filters,
    ...(def.text_query !== undefined ? { text_query: def.text_query } : {}),
    ...(def.sample_size !== undefined ? { sample_size: def.sample_size } : {}),
    seed: def.seed,
    corpus_total: def.corpus_total,
    cohort_total: def.cohort_total,
    sample_n: def.sample_n,
    fields: def.fields,
    schema_version: def.schema_version,
    generated_at: def.generated_at,
  };
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function share(count: number, covered: number): string {
  return covered === 0 ? "0.0000" : (count / covered).toFixed(4);
}

export function aggregateToCsv(response: AggregateResponse, label: (field: string) => string): string {
  const rows: string[] = ["field,label,kind,value,count,share_of_covered,covered,null"];
  for (const [field, agg] of Object.entries(response.fields)) {
    const push = (value: string, count: number) =>
      rows.push([field, label(field), agg.kind, value, count, share(count, agg.covered), agg.covered, agg.null].map(csvCell).join(","));
    if (agg.kind === "numeric") {
      for (const b of agg.buckets) push(`${b.lo}–${b.hi}`, b.count);
    } else {
      for (const v of agg.values) push(v.value, v.count);
      if (agg.kind === "categorical" && agg.other > 0) push("__other__", agg.other);
    }
    if (agg.null > 0) push("__null__", agg.null);
  }
  return rows.join("\n") + "\n";
}
```

- [ ] **Step 4: Run, lint, commit**

Run: `cd frontend && npx jest __tests__/lib/extractions/stats-export.test.ts && npx eslint --max-warnings 0 lib/extractions/stats-export.ts __tests__/lib/extractions/stats-export.test.ts`

```bash
git add frontend/lib/extractions/stats-export.ts frontend/__tests__/lib/extractions/stats-export.test.ts
git commit -m "feat(stats): CSV and cohort.json export helpers

Refs #708"
```

---

### Task 8: i18n keys, `ScaleSlider`, `FieldCard`, `ViewToggle`

**Files:**
- Modify: `frontend/lib/i18n/types.ts` (`ExtractionTranslations`), `translations/en.ts`, `translations/pl.ts` (`extraction:` block)
- Create: `frontend/app/search/extractions/_components/ScaleSlider.tsx`, `FieldCard.tsx`, `ViewToggle.tsx`
- Tests: `frontend/__tests__/app/search/extractions/ScaleSlider.test.tsx`, `FieldCard.test.tsx`

**Interfaces:**

```ts
// ScaleSlider
export interface ScaleSliderProps { cohortTotal: number; sampleSize: number | undefined; seed: number; onChange: (sampleSize: number | undefined) => void; onReshuffle: () => void }
// FieldCard
export interface FieldCardProps { field: string; aggregate: FieldAggregate; sampleN: number; yAxis: "count" | "percent"; onBarClick?: (field: string, value: string) => void; onRemove?: (field: string) => void }
// ViewToggle
export interface ViewToggleProps { view: ResultView; onChange: (view: ResultView) => void }
```

i18n keys (add to `ExtractionTranslations` in `types.ts`, then to both translation files inside `extraction: { … }`):

```ts
    statsView: 'Statistics',            // pl: 'Statystyki'
    listView: 'List',                   // pl: 'Lista'
    statsCohortLine: '{{matched}} of {{corpus}} judgments match',   // pl: '{{matched}} z {{corpus}} orzeczeń pasuje'
    statsSampleLine: 'showing a random sample of {{n}} (seed {{seed}})', // pl: 'losowa próbka {{n}} (seed {{seed}})'
    statsShowJudgments: 'Show judgments', // pl: 'Pokaż orzeczenia'
    statsScale: 'Sample size',          // pl: 'Wielkość próbki'
    statsAll: 'all',                    // pl: 'wszystkie'
    statsReshuffle: 'Reshuffle',        // pl: 'Losuj ponownie'
    statsYAxisCount: 'Count',           // pl: 'Liczba'
    statsYAxisPercent: '% of sample',   // pl: '% próbki'
    statsOther: 'other',                // pl: 'inne'
    statsMissing: 'missing',            // pl: 'brak danych'
    statsMultiNote: 'Counts are per value; a judgment can appear in more than one bar.', // pl: 'Liczby dotyczą wartości; orzeczenie może wystąpić w kilku słupkach.'
    statsModelScore: 'model score',     // pl: 'ocena modelu'
    statsAddField: 'Add field',         // pl: 'Dodaj pole'
    statsRemoveField: 'Remove',         // pl: 'Usuń'
    statsExportCsv: 'Export CSV',       // pl: 'Eksport CSV'
    statsExportCohort: 'Export cohort definition', // pl: 'Eksport definicji kohorty'
    statsEmpty: 'No judgments match these filters.', // pl: 'Żadne orzeczenie nie pasuje do filtrów.'
    statsError: 'Statistics could not be computed.', // pl: 'Nie udało się policzyć statystyk.'
```

- [ ] **Step 1: Failing tests**

`frontend/__tests__/app/search/extractions/ScaleSlider.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

jest.mock("@/contexts/LanguageContext", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ScaleSlider } = require("@/app/search/extractions/_components/ScaleSlider");

describe("ScaleSlider", () => {
  it("disables stops above the cohort size and marks the current one", () => {
    const onChange = jest.fn();
    render(<ScaleSlider cohortTotal={320} sampleSize={100} seed={7} onChange={onChange} onReshuffle={() => {}} />);
    expect(screen.getByRole("radio", { name: "10" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "100" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "1,000" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "5,000" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "extraction.statsAll" })).toBeEnabled();
  });

  it("reports a stop as a number and 'all' as undefined", () => {
    const onChange = jest.fn();
    render(<ScaleSlider cohortTotal={9000} sampleSize={undefined} seed={7} onChange={onChange} onReshuffle={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "1,000" }));
    expect(onChange).toHaveBeenCalledWith(1000);
    fireEvent.click(screen.getByRole("radio", { name: "extraction.statsAll" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("shows the seed and reshuffles only when sampling", () => {
    const onReshuffle = jest.fn();
    const { rerender } = render(<ScaleSlider cohortTotal={9000} sampleSize={50} seed={42} onChange={() => {}} onReshuffle={onReshuffle} />);
    fireEvent.click(screen.getByRole("button", { name: /statsReshuffle/ }));
    expect(onReshuffle).toHaveBeenCalled();
    expect(screen.getByText(/42/)).toBeInTheDocument();
    rerender(<ScaleSlider cohortTotal={9000} sampleSize={undefined} seed={42} onChange={() => {}} onReshuffle={onReshuffle} />);
    expect(screen.queryByRole("button", { name: /statsReshuffle/ })).not.toBeInTheDocument();
  });
});
```

`frontend/__tests__/app/search/extractions/FieldCard.test.tsx` (Plotly cannot render in jsdom — mock the chart and assert the items it receives):

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

jest.mock("@/contexts/LanguageContext", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const chartProps: unknown[] = [];
jest.mock("@/components/charts", () => ({
  HorizontalBarChart: (props: { items: { name: string; count: number }[]; onBarClick?: (name: string) => void }) => {
    chartProps.push(props);
    return (
      <ul data-testid="chart">
        {props.items.map((i) => (
          <li key={i.name}>
            <button onClick={() => props.onBarClick?.(i.name)}>{i.name}: {i.count}</button>
          </li>
        ))}
      </ul>
    );
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FieldCard } = require("@/app/search/extractions/_components/FieldCard");

const categorical = { kind: "categorical" as const, multi: true, values: [{ value: "dismissed", count: 30 }, { value: "allowed", count: 15 }], other: 2, null: 3, covered: 47 };

describe("FieldCard", () => {
  beforeEach(() => { chartProps.length = 0; });

  it("renders values then other and missing, as counts", () => {
    render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="count" />);
    const items = (chartProps[0] as { items: { name: string; count: number }[] }).items;
    expect(items.map((i) => i.name)).toEqual(["dismissed", "allowed", "extraction.statsOther", "extraction.statsMissing"]);
    expect(items.map((i) => i.count)).toEqual([30, 15, 2, 3]);
    expect(screen.getByText("extraction.statsMultiNote")).toBeInTheDocument();
  });

  it("converts to percent of sample when asked", () => {
    render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="percent" />);
    const items = (chartProps[0] as { items: { count: number }[] }).items;
    expect(items[0].count).toBe(60);
  });

  it("bar click reports the real value, not the other/missing rows", () => {
    const onBarClick = jest.fn();
    render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="count" onBarClick={onBarClick} />);
    fireEvent.click(screen.getByRole("button", { name: /dismissed/ }));
    expect(onBarClick).toHaveBeenCalledWith("appeal_outcome", "dismissed");
    fireEvent.click(screen.getByRole("button", { name: /statsOther/ }));
    expect(onBarClick).toHaveBeenCalledTimes(1);
  });

  it("labels numeric buckets lo–hi and years ascending", () => {
    render(<FieldCard field="num_victims" aggregate={{ kind: "numeric", buckets: [{ lo: 0, hi: 1, count: 2 }, { lo: 1, hi: 2, count: 5 }], null: 0, covered: 7, min: 0, max: 2 }} sampleN={7} yAxis="count" />);
    expect((chartProps[0] as { items: { name: string }[] }).items.map((i) => i.name)).toEqual(["0–1", "1–2"]);
    render(<FieldCard field="decision_date" aggregate={{ kind: "year", values: [{ value: "2018", count: 1 }, { value: "2019", count: 4 }], null: 0, covered: 5 }} sampleN={5} yAxis="count" />);
    expect((chartProps[1] as { items: { name: string }[] }).items.map((i) => i.name)).toEqual(["2018", "2019"]);
  });

  it("flags model scores", () => {
    render(<FieldCard field="deep_complexity_score" aggregate={{ kind: "numeric", buckets: [], null: 0, covered: 0, min: null, max: null }} sampleN={0} yAxis="count" />);
    expect(screen.getByText(/statsModelScore/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `cd frontend && npx jest __tests__/app/search/extractions/ScaleSlider.test.tsx __tests__/app/search/extractions/FieldCard.test.tsx` → module not found.

- [ ] **Step 3: i18n keys** — add the block above to `ExtractionTranslations` (types) and to `extraction: { … }` in `en.ts` and `pl.ts` with the PL values shown in the comments. Run `npm run typecheck` — 0.

- [ ] **Step 4: `HorizontalBarChart` needs `onBarClick` and per-bar colours**

In `frontend/components/charts/HorizontalBarChart.tsx` add two optional props and wire them (the component reverses `items` for Plotly at line ~57; keep that):

```ts
  /** Called with the item name when a bar is clicked (#708 drill-back). */
  onBarClick?: (name: string) => void;
  /** Per-item colour override; falls back to `color`. Same order as `items`. */
  colors?: string[];
```

- `marker: { color: colors ? [...colors].reverse() : color }`
- on the `<Plot>` element: `onClick={(e) => { const p = e.points?.[0]; if (p && onBarClick) onBarClick(String(p.y)); }}`
- `hovertemplate: "%{y}: %{x:,}<extra></extra>"` on the trace so every bar has a tooltip; `config={{ displayModeBar: false, responsive: true }}` if not already set.

Keep the existing default export/props otherwise unchanged so `/dataset-comparison` renders as before.

- [ ] **Step 5: Components**

`frontend/app/search/extractions/_components/ViewToggle.tsx`:

```tsx
"use client";

import { useTranslation } from "@/contexts/LanguageContext";
import type { ResultView } from "@/lib/extractions/use-extracted-data-filters";

export interface ViewToggleProps {
  view: ResultView;
  onChange: (view: ResultView) => void;
}

/** List | Statistics segmented control (#708). */
export function ViewToggle({ view, onChange }: ViewToggleProps) {
  const { t } = useTranslation();
  const options: { value: ResultView; label: string }[] = [
    { value: "list", label: t("extraction.listView") },
    { value: "stats", label: t("extraction.statsView") },
  ];
  return (
    <div role="radiogroup" aria-label={t("extraction.statsView")} className="inline-flex border border-[color:var(--rule)] font-mono text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={view === o.value}
          onClick={() => onChange(o.value)}
          className={
            view === o.value
              ? "bg-[color:var(--ink)] px-3 py-1 text-[color:var(--parchment)]"
              : "px-3 py-1 text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`frontend/app/search/extractions/_components/ScaleSlider.tsx`:

```tsx
"use client";

import { useTranslation } from "@/contexts/LanguageContext";
import { SCALE_STOPS } from "@/lib/extractions/aggregate-fields";

export interface ScaleSliderProps {
  cohortTotal: number;
  sampleSize: number | undefined;
  seed: number;
  onChange: (sampleSize: number | undefined) => void;
  onReshuffle: () => void;
}

/**
 * Discrete sample-size stops 10 · 50 · 100 · 1,000 · 5,000 · all (#708).
 * Stops larger than the cohort are disabled; "all" is `undefined`.
 */
export function ScaleSlider({ cohortTotal, sampleSize, seed, onChange, onReshuffle }: ScaleSliderProps) {
  const { t } = useTranslation();
  const stops: { value: number | undefined; label: string }[] = [
    ...SCALE_STOPS.map((n) => ({ value: n, label: n.toLocaleString("en-US") })),
    { value: undefined, label: t("extraction.statsAll") },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-[color:var(--ink-soft)]">
      <span>{t("extraction.statsScale")}</span>
      <div role="radiogroup" aria-label={t("extraction.statsScale")} className="inline-flex border border-[color:var(--rule)]">
        {stops.map((s) => {
          const disabled = s.value !== undefined && s.value > cohortTotal;
          const checked = s.value === sampleSize;
          return (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => onChange(s.value)}
              className={
                checked
                  ? "bg-[color:var(--ink)] px-2 py-1 text-[color:var(--parchment)]"
                  : "px-2 py-1 disabled:opacity-40 hover:text-[color:var(--ink)]"
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>
      {sampleSize !== undefined && (
        <>
          <span>seed {seed}</span>
          <button type="button" onClick={onReshuffle} className="underline hover:text-[color:var(--ink)]">
            {t("extraction.statsReshuffle")}
          </button>
        </>
      )}
    </div>
  );
}
```

`frontend/app/search/extractions/_components/FieldCard.tsx`:

```tsx
"use client";

import { HorizontalBarChart } from "@/components/charts";
import { useTranslation } from "@/contexts/LanguageContext";
import { aggregateFieldLabel } from "@/lib/extractions/aggregate-fields";
import type { FieldAggregate } from "@/types/base-schema-filter";

const BAR = "#9A342D"; // --pwr-red
const MUTED = "#5A5A5A"; // --pwr-grey — other / missing

export interface FieldCardProps {
  field: string;
  aggregate: FieldAggregate;
  sampleN: number;
  yAxis: "count" | "percent";
  onBarClick?: (field: string, value: string) => void;
  onRemove?: (field: string) => void;
}

interface Row {
  name: string;
  count: number;
  value: string | null; // null = synthetic other/missing row (not clickable)
  color: string;
}

function rowsFor(agg: FieldAggregate, other: string, missing: string): Row[] {
  const rows: Row[] = [];
  if (agg.kind === "numeric") {
    for (const b of agg.buckets) rows.push({ name: `${b.lo}–${b.hi}`, count: b.count, value: null, color: BAR });
  } else {
    for (const v of agg.values) rows.push({ name: v.value, count: v.count, value: v.value, color: BAR });
    if (agg.kind === "categorical" && agg.other > 0) rows.push({ name: other, count: agg.other, value: null, color: MUTED });
  }
  if (agg.null > 0) rows.push({ name: missing, count: agg.null, value: null, color: MUTED });
  return rows;
}

/** One field's distribution over the sample (#708). Single series, single hue. */
export function FieldCard({ field, aggregate, sampleN, yAxis, onBarClick, onRemove }: FieldCardProps) {
  const { t } = useTranslation();
  const rows = rowsFor(aggregate, t("extraction.statsOther"), t("extraction.statsMissing"));
  const items = rows.map((r) => ({
    name: r.name,
    count: yAxis === "percent" && sampleN > 0 ? Math.round((r.count / sampleN) * 1000) / 10 : r.count,
  }));
  const byName = new Map(rows.map((r) => [r.name, r]));
  const isModelScore = field.startsWith("deep_");
  return (
    <section className="border border-[color:var(--rule)] bg-white p-4" aria-label={aggregateFieldLabel(field)}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-base text-[color:var(--ink)]">{aggregateFieldLabel(field)}</h3>
          <p className="font-mono text-[11px] text-[color:var(--ink-soft)]">
            {aggregate.covered.toLocaleString("en-US")} / {sampleN.toLocaleString("en-US")}
            {isModelScore && ` · ${t("extraction.statsModelScore")}`}
          </p>
        </div>
        {onRemove && (
          <button type="button" onClick={() => onRemove(field)} className="font-mono text-[11px] text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]">
            {t("extraction.statsRemoveField")}
          </button>
        )}
      </header>
      <HorizontalBarChart
        items={items}
        color={BAR}
        colors={rows.map((r) => r.color)}
        showCounts
        height={Math.max(160, 28 * items.length + 60)}
        xAxisTitle={yAxis === "percent" ? t("extraction.statsYAxisPercent") : t("extraction.statsYAxisCount")}
        onBarClick={(name) => {
          const row = byName.get(name);
          if (row?.value !== null && row?.value !== undefined && onBarClick) onBarClick(field, row.value);
        }}
      />
      {aggregate.kind === "categorical" && aggregate.multi && (
        <p className="mt-1 font-mono text-[11px] text-[color:var(--ink-soft)]">{t("extraction.statsMultiNote")}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run tests, typecheck, lint** — `cd frontend && npx jest __tests__/app/search/extractions && npm run typecheck && npx eslint --max-warnings 0 app/search/extractions/_components components/charts/HorizontalBarChart.tsx lib/i18n/types.ts lib/i18n/translations/en.ts lib/i18n/translations/pl.ts __tests__/app/search/extractions`. Expected: green.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/search/extractions/_components/ViewToggle.tsx frontend/app/search/extractions/_components/ScaleSlider.tsx frontend/app/search/extractions/_components/FieldCard.tsx frontend/components/charts/HorizontalBarChart.tsx frontend/lib/i18n/types.ts frontend/lib/i18n/translations/en.ts frontend/lib/i18n/translations/pl.ts frontend/__tests__/app/search/extractions/ScaleSlider.test.tsx frontend/__tests__/app/search/extractions/FieldCard.test.tsx
git commit -m "feat(stats): view toggle, scale slider and field card components

Refs #708"
```

---

### Task 9: `StatisticsView` and page integration; Explore flow step

**Files:**
- Create: `frontend/app/search/extractions/_components/StatisticsView.tsx`
- Modify: `frontend/app/search/extractions/page.tsx` (result-count bar ~line 331; body ~line 368)
- Modify: `frontend/lib/navigation/flows.ts` (Explore steps), `frontend/__tests__/lib/navigation/flows.test.ts`, `docs/reference/sidebar-map.md` (Explore table row)
- Test: `frontend/__tests__/app/search/extractions/StatisticsView.test.tsx`

**Interfaces:**

```ts
export interface StatisticsViewProps {
  filters: BaseSchemaFilters; textQuery: string; sampleSize: number | undefined; seed: number; fields: string[];
  onSampling: (n: number | undefined) => void; onReshuffle: () => void; onFields: (fields: string[]) => void;
  onDrillBack: (patch?: Partial<BaseSchemaFilters>) => void;   // switch to list, optionally adding a filter
}
```

- [ ] **Step 1: Failing test**

`frontend/__tests__/app/search/extractions/StatisticsView.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

jest.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({ t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k) }),
}));
jest.mock("@/components/charts", () => ({
  HorizontalBarChart: (p: { items: { name: string }[]; onBarClick?: (n: string) => void }) => (
    <div>{p.items.map((i) => <button key={i.name} onClick={() => p.onBarClick?.(i.name)}>{i.name}</button>)}</div>
  ),
}));
const aggregate = {
  total: 320, sample_n: 100, seed: 7,
  fields: { appeal_outcome: { kind: "categorical", multi: true, values: [{ value: "dismissed", count: 60 }], other: 0, null: 0, covered: 100 } },
};
let queryState: { data?: unknown; isLoading: boolean; error: unknown } = { data: aggregate, isLoading: false, error: null };
jest.mock("@/lib/extractions/base-schema-filter-api", () => ({ useExtractionAggregate: () => queryState }));
jest.mock("@/lib/api/dashboard", () => ({ useDashboardStats: () => ({ data: { total_judgments: 12907 } }) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StatisticsView } = require("@/app/search/extractions/_components/StatisticsView");

function renderView(over: Partial<React.ComponentProps<typeof StatisticsView>> = {}) {
  const props = {
    filters: {}, textQuery: "", sampleSize: 100, seed: 7, fields: ["appeal_outcome"],
    onSampling: jest.fn(), onReshuffle: jest.fn(), onFields: jest.fn(), onDrillBack: jest.fn(),
    ...over,
  };
  render(<StatisticsView {...props} />);
  return props;
}

describe("StatisticsView", () => {
  beforeEach(() => { queryState = { data: aggregate, isLoading: false, error: null }; });

  it("shows the cohort line with corpus total and the sample line", () => {
    renderView();
    expect(screen.getByText(/statsCohortLine:.*"matched":"320".*"corpus":"12,907"/)).toBeInTheDocument();
    expect(screen.getByText(/statsSampleLine:.*"n":"100".*"seed":"7"/)).toBeInTheDocument();
  });

  it("Show judgments drills back without a filter patch", () => {
    const p = renderView();
    fireEvent.click(screen.getByRole("button", { name: "extraction.statsShowJudgments" }));
    expect(p.onDrillBack).toHaveBeenCalledWith(undefined);
  });

  it("a bar click drills back adding that value to the field's filter", () => {
    const p = renderView({ filters: { appeal_outcome: ["allowed"] } });
    fireEvent.click(screen.getByRole("button", { name: "dismissed" }));
    expect(p.onDrillBack).toHaveBeenCalledWith({ appeal_outcome: ["allowed", "dismissed"] });
  });

  it("renders the empty state when the cohort is empty", () => {
    queryState = { data: { ...aggregate, total: 0, sample_n: 0, fields: {} }, isLoading: false, error: null };
    renderView();
    expect(screen.getByText("extraction.statsEmpty")).toBeInTheDocument();
  });

  it("renders the error state", () => {
    queryState = { data: undefined, isLoading: false, error: new Error("x") };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("extraction.statsError");
  });
});
```

`useDashboardStats` (`frontend/lib/api/dashboard.ts`) returns data with `total_judgments: number` (line 9) — the mock above matches it.

- [ ] **Step 2: Run to verify it fails** — `cd frontend && npx jest __tests__/app/search/extractions/StatisticsView.test.tsx` → module not found.

- [ ] **Step 3: `StatisticsView`**

`frontend/app/search/extractions/_components/StatisticsView.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";

import { EditorialButton } from "@/components/editorial";
import { useTranslation } from "@/contexts/LanguageContext";
import { useDashboardStats } from "@/lib/api/dashboard";
import { AGGREGABLE_FIELDS, aggregateFieldLabel } from "@/lib/extractions/aggregate-fields";
import { useExtractionAggregate } from "@/lib/extractions/base-schema-filter-api";
import { aggregateToCsv, buildCohortDefinition } from "@/lib/extractions/stats-export";
import { ErrorCard } from "@/lib/styles/components";
import type { AggregateRequest, BaseSchemaFilters } from "@/types/base-schema-filter";

import { FieldCard } from "./FieldCard";
import { ScaleSlider } from "./ScaleSlider";

export interface StatisticsViewProps {
  filters: BaseSchemaFilters;
  textQuery: string;
  sampleSize: number | undefined;
  seed: number;
  fields: string[];
  onSampling: (n: number | undefined) => void;
  onReshuffle: () => void;
  onFields: (fields: string[]) => void;
  /** Switch to the list; with a patch, merge it into the filters first (drill-back). */
  onDrillBack: (patch?: Partial<BaseSchemaFilters>) => void;
}

function download(name: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Statistics body of /search/extractions (#708, spec §5.2). */
export function StatisticsView(props: StatisticsViewProps) {
  const { filters, textQuery, sampleSize, seed, fields, onSampling, onReshuffle, onFields, onDrillBack } = props;
  const { t } = useTranslation();
  const [yAxis, setYAxis] = useState<"count" | "percent">("count");
  const { data: stats } = useDashboardStats();
  const corpusTotal = stats?.total_judgments ?? 0;

  const request = useMemo<AggregateRequest>(
    () => ({
      filters,
      text_query: textQuery.trim() === "" ? undefined : textQuery.trim(),
      fields,
      sample_size: sampleSize,
      seed: sampleSize === undefined ? undefined : seed,
    }),
    [filters, textQuery, fields, sampleSize, seed],
  );
  const { data, isLoading, error } = useExtractionAggregate(request);

  const addValue = (field: string, value: string) => {
    const current = (filters as Record<string, unknown>)[field];
    const next = Array.isArray(current) ? [...(current as string[]), value] : [value];
    onDrillBack({ [field]: Array.from(new Set(next)) } as Partial<BaseSchemaFilters>);
  };

  if (error) {
    return (
      <div role="alert">
        <ErrorCard message={t("extraction.statsError")} />
      </div>
    );
  }
  if (!data && isLoading) {
    return <p className="py-8 font-mono text-xs text-[color:var(--ink-soft)]">…</p>;
  }
  if (!data) return null;
  if (data.total === 0) {
    return <p className="py-8 text-sm text-[color:var(--ink-soft)]">{t("extraction.statsEmpty")}</p>;
  }

  const sampled = data.sample_n < data.total;
  const addable = AGGREGABLE_FIELDS.filter((f) => !fields.includes(f));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--rule)] py-2 text-sm">
        <p className="text-[color:var(--ink-soft)]">
          {t("extraction.statsCohortLine", { matched: data.total.toLocaleString("en-US"), corpus: corpusTotal.toLocaleString("en-US") })}
          {sampled && ` · ${t("extraction.statsSampleLine", { n: data.sample_n.toLocaleString("en-US"), seed: String(data.seed ?? "") })}`}
        </p>
        <button type="button" onClick={() => onDrillBack(undefined)} className="font-mono text-xs underline hover:text-[color:var(--ink)]">
          {t("extraction.statsShowJudgments")}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScaleSlider cohortTotal={data.total} sampleSize={sampleSize} seed={seed} onChange={onSampling} onReshuffle={onReshuffle} />
        <div role="radiogroup" aria-label={t("extraction.statsYAxisCount")} className="inline-flex border border-[color:var(--rule)] font-mono text-xs">
          {(["count", "percent"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={yAxis === v} onClick={() => setYAxis(v)}
              className={yAxis === v ? "bg-[color:var(--ink)] px-2 py-1 text-[color:var(--parchment)]" : "px-2 py-1 text-[color:var(--ink-soft)]"}>
              {v === "count" ? t("extraction.statsYAxisCount") : t("extraction.statsYAxisPercent")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) =>
          data.fields[field] ? (
            <FieldCard key={field} field={field} aggregate={data.fields[field]} sampleN={data.sample_n} yAxis={yAxis}
              onBarClick={addValue} onRemove={fields.length > 1 ? (f) => onFields(fields.filter((x) => x !== f)) : undefined} />
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--rule)] pt-3">
        <label className="font-mono text-xs text-[color:var(--ink-soft)]">
          {t("extraction.statsAddField")}{" "}
          <select className="border border-[color:var(--rule)] bg-white px-2 py-1" value="" onChange={(e) => e.target.value && onFields([...fields, e.target.value])}>
            <option value="">—</option>
            {addable.map((f) => (
              <option key={f} value={f}>{aggregateFieldLabel(f)}</option>
            ))}
          </select>
        </label>
        <EditorialButton variant="secondary" onClick={() => download("statistics.csv", "text/csv", aggregateToCsv(data, aggregateFieldLabel))}>
          {t("extraction.statsExportCsv")}
        </EditorialButton>
        <EditorialButton variant="secondary"
          onClick={() => download("cohort.json", "application/json", JSON.stringify(buildCohortDefinition({ filters, textQuery, response: data, fields, corpusTotal }), null, 2))}>
          {t("extraction.statsExportCohort")}
        </EditorialButton>
      </div>
    </div>
  );
}
```

`EditorialButton` accepts `variant?: "primary" | "secondary" | "ghost"` (`EditorialButton.tsx:5-9`); `ErrorCard` takes `title?: string` and a required `message: string` (`lib/styles/components/error-card.tsx:15-21`) — pass the localized error text as `message` and omit `title`. `useDashboardStats()` data has `total_judgments: number` (`lib/api/dashboard.ts:9`).

- [ ] **Step 4: Page integration**

In `frontend/app/search/extractions/page.tsx`:

1. Imports: `import { StatisticsView } from "./_components/StatisticsView"; import { ViewToggle } from "./_components/ViewToggle";`
2. Destructure the new hook fields next to `activeCount`: `view, sampleSize, seed, statsFields, setView, setSampling, reshuffle, setStatsFields`.
3. Pass `enabled = view === "list"` to `useExtractionResults(request, view === "list")` so the list query does not run behind the statistics view.
4. In the sticky bar (`<div className="flex items-center justify-between">`), render `<ViewToggle view={view} onChange={setView} />` as the first child, then the existing count `<p>` (in Statistics view render the count paragraph only while loading — the cohort line replaces it).
5. Replace the `{!error && (<ResultList … />)}` block and the pagination block with:

```tsx
      {!error && view === "stats" && (
        <StatisticsView
          filters={filters}
          textQuery={textQuery}
          sampleSize={sampleSize}
          seed={seed}
          fields={statsFields}
          onSampling={(n) => setSampling(n)}
          onReshuffle={reshuffle}
          onFields={setStatsFields}
          onDrillBack={(patch) => {
            if (patch) setFilters({ ...filters, ...patch });
            setView("list");
          }}
        />
      )}
      {!error && view === "list" && (
        <ResultList … unchanged … />
      )}
      {view === "list" && total > pageSize && (
        <Pagination … unchanged … />
      )}
```

6. `ActiveFilterChips` stays above both views (filters apply to both).

- [ ] **Step 5: Explore flow step + docs**

In `frontend/lib/navigation/flows.ts`, Explore steps become:

```ts
      { href: "/search/extractions", labelKey: "navigation.searchExtractedData", icon: FileJson, match: "exact" },
      { href: "/search/extractions?view=stats", labelKey: "navigation.statistics", icon: BarChart3, match: "exact" },
      { href: "/collections", labelKey: "navigation.researchCollections", icon: FolderOpen, match: "prefix" },
      { href: "/topics", labelKey: "navigation.topicTrends", icon: TrendingUp, match: "exact" },
```

with `BarChart3` imported from `lucide-react` and a new key `navigation.statistics` ('Statistics' / 'Statystyki') in types + en + pl. Two steps now share the pathname `/search/extractions`, so matching needs the query string — passed in explicitly, never read from `window` (that would render differently on the server and trip hydration):

```ts
// flows.ts
export function isStepActive(step: FlowStep, pathname: string, search = ""): boolean {
  const [path, query] = step.href.split("?");
  if (step.match === "prefix") return pathname === path || pathname.startsWith(`${path}/`);
  if (pathname !== path) return false;
  if (query) return search.includes(query);            // "/search/extractions?view=stats"
  return !search.includes("view=stats");                // the plain list step yields to the stats step
}
export function findFlowStep(pathname: string, isAdmin: boolean, search = "") { /* pass `search` to isStepActive */ }
```

The sidebar keeps calling `isStepActive(step, pathname)` with no `search` (it renders on the server too; both Explore entries stay visible, the plain one highlighted on either view — acceptable). `FlowStepper` splits into an outer component that renders `<Suspense fallback={null}><FlowStepperInner /></Suspense>` and an inner one that adds `const search = useSearchParams().toString()` and calls `findFlowStep(pathname, isAdmin, search ? `?${search}` : "")` — the same Suspense pattern `AppLayoutWrapper.tsx:16-18` already uses for the navbar's `useSearchParams`. Update `FlowStepper.test.tsx`'s `next/navigation` mock to also return `useSearchParams: () => new URLSearchParams(mockSearch)`. Add to `flows.test.ts`:

```ts
  it("distinguishes the list and statistics steps of /search/extractions by the view param", () => {
    expect(findFlowStep("/search/extractions", false, "?view=stats")?.step.href).toBe("/search/extractions?view=stats");
    expect(findFlowStep("/search/extractions", false, "")?.step.href).toBe("/search/extractions");
    expect(findFlowStep("/search/extractions", false)?.step.href).toBe("/search/extractions");
  });
```

and update the "keeps every route" inventory test to include `/search/extractions?view=stats`. `docs/reference/sidebar-map.md`: add the row `| 2. Statistics | `/search/extractions?view=stats` | Distributions of the pre-extracted fields over the current cohort, at 10 … all. |` under Explore and renumber; `__tests__/docs/sidebar-map.test.ts`'s regex `\`(\/[a-z0-9\-\/]*)\`` stops at `?` — extend the character class to `[a-z0-9\-\/?=]` so the new route is compared. `route-reachability.test.ts`'s `HREF_PATTERN` already stops at `?`, so it still sees `/search/extractions`.

- [ ] **Step 6: Run everything, typecheck, lint**

Run: `cd frontend && npx jest __tests__/app/search __tests__/lib/navigation __tests__/docs __tests__/components tests/unit/navigation && npm run typecheck && npx eslint --max-warnings 0 app/search/extractions lib/navigation/flows.ts __tests__/lib/navigation/flows.test.ts`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/search/extractions frontend/lib/navigation/flows.ts frontend/__tests__/lib/navigation/flows.test.ts frontend/__tests__/app/search/extractions/StatisticsView.test.tsx frontend/__tests__/docs/sidebar-map.test.ts docs/reference/sidebar-map.md frontend/lib/i18n/types.ts frontend/lib/i18n/translations/en.ts frontend/lib/i18n/translations/pl.ts
git commit -m "feat(stats): statistics view on /search/extractions with drill-back and export

Refs #708"
```

---

### Task 10: Route-contract E2E, full gate, PR, merge

**Files:**
- Modify: `frontend/tests/route-contract-e2e/stub-services.mjs` (add `POST /extractions/base-schema/aggregate` stub near the `POST /extractions/db` branch at line ~506)
- Create: `frontend/tests/route-contract-e2e/statistics-view.spec.ts`

- [ ] **Step 1: Stub**

In `stub-services.mjs`, next to the other backend stubs:

```js
  if (request.method === 'POST' && url.pathname === '/extractions/base-schema/aggregate') {
    return sendJson(response, 200, {
      total: 320,
      sample_n: 100,
      seed: 7,
      fields: {
        appeal_outcome: { kind: 'categorical', multi: true, values: [{ value: 'dismissed', count: 60 }, { value: 'allowed', count: 30 }], other: 0, null: 10, covered: 90 },
        decision_date: { kind: 'year', values: [{ value: '2019', count: 100 }], null: 0, covered: 100 },
      },
    });
  }
```

(`json(...)` above stands for the file's own helper `sendJson(response, status, body)` at `stub-services.mjs:74` — use that name.) If the harness also stubs the filter endpoint with a fixed body, the list view already works; otherwise add a `POST /extractions/base-schema/filter` stub returning `{ documents: [], total_count: 320, limit: 20, offset: 0, has_more: false }`.

- [ ] **Step 2: Spec**

`frontend/tests/route-contract-e2e/statistics-view.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { expectNoUnexpectedStubRequests, setSyntheticSession } from './synthetic-session';

test.describe('statistics view', () => {
  test('renders the cohort line from the aggregate endpoint and drills back to the list', async ({ page, context, request }) => {
    await setSyntheticSession(context);
    await page.goto('/search/extractions?view=stats&n=100&seed=7&fields=appeal_outcome,decision_date');
    await expect(page.getByText(/320 of/)).toBeVisible();
    await expect(page.getByText(/seed 7/)).toBeVisible();
    await page.getByRole('button', { name: /show judgments/i }).click();
    await expect(page).toHaveURL(/\/search\/extractions(\?|$)(?!.*view=stats)/);
    await expectNoUnexpectedStubRequests(request);
  });
});
```

Adjust the two text matchers to the real EN copy from Task 8's i18n keys (`statsCohortLine` renders "320 of 12,907 judgments match" when the dashboard stats stub returns 12,907 — if the harness stubs `/api/dashboard/stats` differently, match on `/320 of/` only, as above).

- [ ] **Step 3: Run the route-contract harness locally**

Per `docs/how-to/run-live-e2e-verification.md` / the `Frontend Route Contract (Chromium)` workflow: build with the CI env vars, then run the harness script from `frontend/package.json` (the `test:route-contract` family). Expected: the new spec passes with the existing ones. If local setup is not available, say so in the PR; the required check runs it.

- [ ] **Step 4: Full gate**

Run: `cd frontend && npm run validate && npx jest`; `node <dataviz-skill-dir>/scripts/validate_palette.js "#9A342D,#5A5A5A" --mode light` and paste its table into the PR body.
Expected: validate 0, all Jest suites green, palette passes (single-series charts only need the contrast and lightness checks).

- [ ] **Step 5: Reviewer, push, PR, merge**

Spawn a reviewer on `git diff origin/main...HEAD`. Then:

```bash
git push -u origin feat/708-statistics-view
gh pr create --base main --title "feat(stats): statistics view on /search/extractions with a seeded scale slider" --body-file <body>
```

PR body: summary, screenshots or a short GIF of `?view=stats` at 100 and all, the `Tests:` line, the palette validator output, note that `HorizontalBarChart`/`BivariateBarChart` moved to `components/charts/` with shims (heads-up for #684), `Closes #708`, `Refs #687 #707`. Merge with `gh pr merge <n> --merge --delete-branch` when the seven checks are green; remove the worktree; comment on #687 that Phase B is done and name the "statistics over a collection" gap (#685).
