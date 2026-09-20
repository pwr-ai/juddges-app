# NL question → base-schema filter → collection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A researcher types a question such as „kobiety skazane za oszustwo z wyrokiem w zawieszeniu, PL i UK, 2015–2024" on `/search/extractions`, gets a structured filter that also constrains `jurisdiction` and `decision_date`, sees every condition as a removable chip in a shareable URL, opens a hit on `/documents/{id}` with the matched base fields highlighted, and saves the whole result set (≤ 5 000 rows) as a collection in one click.

**Architecture:** Extend the existing NL→filter chain (`BaseSchemaFilter` Pydantic model + prompt) and the Postgres RPC `filter_documents_by_extracted_data` with two *core* judgment columns (`jurisdiction`, `decision_date`) carried inside the existing `p_filters` JSONB — no signature change. On the frontend, the two core fields live in a small `CORE_FILTER_FIELDS` registry next to (not inside) `FILTER_FIELDS`, so `BaseFiltersDrawer`/facets stay untouched while `ActiveFilterChips`, URL state and a new `ScopeFilters` strip pick them up. "Save as collection" is a new backend endpoint `POST /collections/from-filter` that re-runs the RPC server-side (pages of 500 ids) and bulk-inserts into `collection_judgments`, bypassing the 100-id HTTP batch cap. The document page reads the same `?f=` blob and highlights matching `base_*` cells in the existing `KeyInformation` grid.

**Tech Stack:** FastAPI + Pydantic v2 + LangChain structured output (backend), Supabase/PostgREST RPC (plpgsql), Next.js 15 App Router + React 19 + React Query + Jest/RTL (frontend), pytest (`unit`, `db` marks), psql-driven Database Contract suite.

**Spec:** `/tmp/claude-1000/-home-laugustyniak-github-legal-ai-lexgraph/36eb3f04-1cf0-4a2a-b538-497cb47372cc/scratchpad/specs/spec-B.md` (Spec B — copy it to `docs/superpowers/specs/2026-09-20-nl-filter-to-collection-design.md` in Task 0 so it travels with the plan). Shared facts: `.../specs/context.md`.

## Global Constraints

- Branch from `main` (`git switch -c feat/nl-filter-to-collection origin/main`); PR back into `main`; merge with `gh pr merge <n> --merge --delete-branch`. Never squash.
- Required CI checks (exact names): `Backend Lint`, `Backend Unit Tests`, `Frontend Lint`, `Frontend Unit Tests`, `Frontend E2E Smoke (UI-only)`, `Database Contract`, `Frontend Route Contract (Chromium)`.
- Conventional commits. **No** Claude/co-author footers.
- Backend: Python 3.12, Poetry; `poetry run poe check-all` (= ruff lint + format-check + `pytest -m unit`). Tests must carry `@pytest.mark.unit` or `pytestmark = pytest.mark.db`.
- Frontend: `npm run validate` (lint + tsc), `npm test` (Jest; `__tests__/**` and `tests/unit/**`). TypeScript strict. Use `@/components/editorial` primitives and `--pwr-*`/alias tokens; **no** new gradients/glass cards.
- Jurisdiction values are exactly `'PL'` / `'UK'` (CHECK constraint, `supabase/migrations/20260209000001_create_judgments_table.sql:23`). `decision_date` is `DATE`, indexed with `idx_judgments_jurisdiction_date`.
- Do **not** expose `case_type` or `court_level` to the NL filter (data defect: `case_type='Civil'` on UK criminal appeals — `docs/reference/APP_STATUS_2026-08-21.md` §4). Facet fixes are out of scope.
- Collection save cap: **5 000** documents (spec). HTTP batch cap stays **100** (`AddDocumentsRequest.max_length=100`, `backend/app/collections.py:242`, guarded by `tests/app/test_collections_batch_cap.py`) — do not raise it.
- `BaseFiltersDrawer`, `QuickFilters`, facet RPCs: **no behavioural change** (spec AC5). `tests/app/test_base_schema_route_regressions.py` must keep passing.
- Docs follow Diátaxis under `docs/`. Ephemeral notes → `.context/` (gitignored).
- `frontend/tests/e2e/search/extractions.spec.ts` is **not** in CI (#583) — any E2E added there is a local check only; unit tests carry the contract.

---

## File structure (what changes where)

Backend
- Modify `backend/app/extraction_domain/nl_filter_generator.py` — `Jurisdiction` literal, two new fields, `NL_EXCLUDED_CORE_FIELDS`, prompt rules 8–9 + PL/EN examples.
- Create `backend/app/extraction_domain/filter_ids.py` — `collect_filter_ids()` pages the RPC and returns ids only; `FilterTooLargeError`.
- Modify `backend/app/collections.py` — `POST /collections/from-filter`.
- Create `supabase/migrations/20260920000001_filter_by_jurisdiction_and_decision_date.sql`.
- Tests: `backend/tests/app/test_nl_filter_generator.py` (extend), `backend/tests/app/test_nl_filter_prompt_contract.py` (new), `backend/tests/app/test_filter_ids.py` (new), `backend/tests/app/test_collections_from_filter.py` (new), `backend/tests/db/test_migration_chain.py` (extend), `backend/tests/db/test_base_schema_filter_contract.py` (new).

Frontend
- Modify `frontend/types/base-schema-filter.ts` — `Jurisdiction`, `jurisdiction?`, `decision_date?`, `CreateCollectionFromFilterRequest/Response`.
- Modify `frontend/lib/extractions/base-schema-filter-config.ts` — `CORE_FILTER_FIELDS`, `CORE_FILTER_FIELD_BY_NAME`, `ALL_FILTER_FIELD_BY_NAME`, `isCoreFilterField()`.
- Create `frontend/lib/extractions/drawer-adapter.ts` — `toDrawerFilters`, `applyDrawerChange` moved out of `page.tsx`, with the epoch↔ISO date fix and core-field skipping.
- Create `frontend/lib/extractions/filter-match.ts` — `matchedMetadataKeys(filters, metadata)`.
- Create `frontend/lib/extractions/document-href.ts` — `buildDocumentHref(id, filters)`.
- Modify `frontend/lib/extractions/use-extracted-data-filters.ts` — `nlQuestion` + `?nl=`; pure `buildSearchParams()`.
- Modify `frontend/components/filters/extracted-search-filters.tsx` — `ActiveFilterChips` resolves labels via `ALL_FILTER_FIELD_BY_NAME`.
- Create `frontend/components/search/ScopeFilters.tsx` — jurisdiction + decision_date controls.
- Modify `frontend/components/search/NlFilterDialog.tsx` — `onApply(filters, textQuery, question)`.
- Create `frontend/components/search/SaveAsCollectionDialog.tsx`.
- Modify `frontend/app/search/extractions/page.tsx` — wire everything; row href → `/documents/{id}?f=…#base-fields`.
- Modify `frontend/lib/styles/components/key-information.tsx` — `highlightKeys`, `id`, matched caption.
- Modify `frontend/app/documents/[id]/_components/DocumentPageClient.tsx` — read `?f=`, compute highlights.
- Create `frontend/app/api/collections/from-filter/route.ts`; modify `frontend/lib/api/collections.ts`.
- Tests under `frontend/__tests__/lib/extractions/*`, `frontend/__tests__/components/search/*`, `frontend/tests/unit/api/collections/from-filter.route.test.ts`, `frontend/__tests__/lib/styles/key-information-highlight.test.tsx`.

Docs
- Copy spec → `docs/superpowers/specs/2026-09-20-nl-filter-to-collection-design.md`.
- Extend `docs/how-to/test-base-schema-filter-queries.md` (Query 11, 12).
- Create `docs/how-to/save-extraction-filter-as-collection.md`, `docs/reference/base-schema-filter-api.md`.

---

## Decision record: RPC migration strategy

**Chosen: new keys inside `p_filters` JSONB; signature unchanged.**

Why, not "new function signature":
1. PostgREST resolves RPCs *by name and argument names*. `CREATE OR REPLACE FUNCTION` with a different parameter list does **not** replace — it creates an **overload**. Two overloads with defaulted params make PostgREST's `POST /rpc/filter_documents_by_extracted_data` ambiguous (HTTP 300) for every existing caller (`backend/app/extraction_domain/results_router.py:483`, `tests/app/test_search_quality_with_judge.py`). Avoiding that requires a `DROP FUNCTION` in the same migration, i.e. a breaking window.
2. Every other filter (42 fields) already travels in `p_filters`; `jurisdiction` and `decision_date` are just two more keys the plpgsql body reads with the same `_jsonb_to_text_array` / `->> 'from'` idioms. Callers that do not send them get identical results (`v_jurisdiction IS NULL OR …`).
3. `ExtractedDataFilterRequest.filters: dict[str, Any]` and `BaseSchemaFilters` TS type pass unknown keys through untouched, so old frontends keep working against the new RPC and vice-versa.

Consequence for the Database Contract job (`backend/tests/db/test_migration_chain.py`): the RPC is currently **not** in `EXPECTED_RPC_ARGS`. We add it with the *existing* names `["p_filters","p_text_query","p_limit","p_offset"]`, add an **overload-count = 1** assertion (the exact failure mode described above), and add a **behavioural** contract test that inserts two `judgments` rows and proves the two new keys filter. That is how "Database Contract obejmuje nową sygnaturę RPC" (AC5) is satisfied without changing the signature.

## Decision record: "Save as collection" vs the 100-id batch cap

The HTTP endpoint `POST /collections/{id}/documents/batch` caps at 100 ids (`AddDocumentsRequest`, `backend/app/collections.py:238-244`; `tests/app/test_collections_batch_cap.py`). Saving 5 000 rows through it means 50 sequential browser requests plus 25 `/filter` page fetches (`ExtractedDataFilterRequest.limit ≤ 200`) — slow and non-atomic. Instead: **one** backend call `POST /collections/from-filter` that (a) probes `total_count` with `p_limit=1`, rejects `> 5000` with **413** and `== 0` with **400**, (b) creates the collection, (c) pages the RPC server-side with `p_limit=500`, (d) upserts via `CollectionsDB.bulk_add_documents` (no cap of its own — `backend/packages/juddges_search/juddges_search/db/collections_db.py:251`) in chunks of 1 000. The 100-cap and its test remain untouched.

Known cost: the RPC returns `extracted_data` (`base_raw_extraction` JSONB) per row, so 5 000 rows ≈ 10–20 MB moved DB→backend once per save. Acceptable for v1; an ids-only RPC is listed under *Shared building blocks* as the follow-up that the compare page will need anyway.

---

### Task 0: Branch + spec copy

**Files:**
- Create: `docs/superpowers/specs/2026-09-20-nl-filter-to-collection-design.md`

- [ ] **Step 1: Branch**

```bash
cd /home/laugustyniak/github/legal-ai/juddges-project/juddges-app
git fetch origin && git switch -c feat/nl-filter-to-collection origin/main
```

- [ ] **Step 2: Copy the spec into the repo**

```bash
cp /tmp/claude-1000/-home-laugustyniak-github-legal-ai-lexgraph/36eb3f04-1cf0-4a2a-b538-497cb47372cc/scratchpad/specs/spec-B.md \
   docs/superpowers/specs/2026-09-20-nl-filter-to-collection-design.md
```

- [ ] **Step 3: Nothing to commit**

`docs/superpowers/` is gitignored in this repo (`.gitignore:161`), so the plan and the spec copy stay local by convention. Do **not** `git add -f` them. The PR body (Task 15) carries the acceptance criteria instead.

---

### Task 1: `BaseSchemaFilter` learns `jurisdiction` and `decision_date`

**Files:**
- Modify: `backend/app/extraction_domain/nl_filter_generator.py:40-100` (literals) and `:105-175` (model)
- Test: `backend/tests/app/test_nl_filter_generator.py`

**Interfaces:**
- Produces: `Jurisdiction = Literal["PL", "UK"]`; `BaseSchemaFilter.jurisdiction: list[Jurisdiction] | None`; `BaseSchemaFilter.decision_date: DateRange | str | None`; `NL_EXCLUDED_CORE_FIELDS: frozenset[str] = frozenset({"case_type", "court_level"})`. `to_rpc_payload()` unchanged in shape: `{"filters": {..., "jurisdiction": ["PL","UK"], "decision_date": {"from": "2015-01-01", "to": "2024-12-31"}}, "text_query": ...}`.

- [ ] **Step 1: Write the failing tests** (append to `TestBaseSchemaFilterValidation`)

```python
    def test_jurisdiction_and_decision_date_round_trip(self):
        f = BaseSchemaFilter(
            jurisdiction=["PL", "UK"],
            decision_date=DateRange.model_validate(
                {"from": "2015-01-01", "to": "2024-12-31"}
            ),
        )
        assert f.to_rpc_payload()["filters"] == {
            "jurisdiction": ["PL", "UK"],
            "decision_date": {"from": "2015-01-01", "to": "2024-12-31"},
        }

    def test_jurisdiction_rejects_unknown_country(self):
        with pytest.raises(ValidationError):
            BaseSchemaFilter(jurisdiction=["DE"])

    def test_jurisdiction_rejects_lowercase(self):
        # The CHECK constraint is exact-case ('PL','UK'); the LLM must not
        # be allowed to emit 'pl' and silently match nothing.
        with pytest.raises(ValidationError):
            BaseSchemaFilter.model_validate({"jurisdiction": ["pl"]})

    def test_case_type_is_not_a_filter_field(self):
        # APP_STATUS_2026-08-21 §4: case_type='Civil' on UK criminal appeals.
        from app.extraction_domain.nl_filter_generator import (
            NL_EXCLUDED_CORE_FIELDS,
        )

        assert {"case_type", "court_level"} <= NL_EXCLUDED_CORE_FIELDS
        for field in NL_EXCLUDED_CORE_FIELDS:
            assert field not in BaseSchemaFilter.model_fields
        with pytest.raises(ValidationError):
            BaseSchemaFilter.model_validate({"case_type": ["Criminal"]})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_nl_filter_generator.py -q -k "jurisdiction or case_type"
```
Expected: FAIL — `ValidationError: Extra inputs are not permitted` on `jurisdiction`, `ImportError` for `NL_EXCLUDED_CORE_FIELDS`.

- [ ] **Step 3: Implement**

In `nl_filter_generator.py`, after `AppealOutcome = Literal[...]` add:

```python
# Core `judgments` columns (not base_* extraction fields). Mirrors the CHECK
# constraint in supabase/migrations/20260209000001_create_judgments_table.sql:23.
Jurisdiction = Literal["PL", "UK"]

# Core columns deliberately NOT exposed to the NL translator until the data is
# fixed (docs/reference/APP_STATUS_2026-08-21.md §4: case_type='Civil' on UK
# criminal appeals, court_level='Crown Court' wrong). Tested in
# tests/app/test_nl_filter_generator.py and test_nl_filter_prompt_contract.py.
NL_EXCLUDED_CORE_FIELDS: frozenset[str] = frozenset({"case_type", "court_level"})
```

In `class BaseSchemaFilter`, insert a new section **before** `# --- scalar enums`:

```python
    # --- core judgment columns (not base_*; filtered on judgments.*) ---------
    jurisdiction: list[Jurisdiction] | None = Field(
        default=None,
        description="Country of the court: PL (Poland) and/or UK (United Kingdom).",
    )
    decision_date: DateRange | str | None = Field(
        default=None,
        description=(
            "Date the judgment was handed down (judgments.decision_date). Use for "
            "'from 2015 to 2024', 'w latach 2015–2024', 'since 2020', 'po 2020 r.'."
        ),
    )
```

Update the module docstring line `Converts a user's plain-English (or Polish) question…` to mention that two core columns are included. No change to `to_rpc_payload`.

- [ ] **Step 4: Run tests**

```bash
cd backend && poetry run pytest tests/app/test_nl_filter_generator.py -q
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/extraction_domain/nl_filter_generator.py backend/tests/app/test_nl_filter_generator.py
git commit -m "feat(nl-filter): jurisdiction and decision_date fields on BaseSchemaFilter"
```

---

### Task 2: Prompt rules for jurisdiction / date ranges (PL + EN), `case_type` kept out

**Files:**
- Modify: `backend/app/extraction_domain/nl_filter_generator.py` (`SYSTEM_PROMPT`)
- Test: `backend/tests/app/test_nl_filter_prompt_contract.py` (new)

**Interfaces:**
- Consumes: `SYSTEM_PROMPT`, `NL_EXCLUDED_CORE_FIELDS` (Task 1).
- Produces: prompt text; no code interface.

- [ ] **Step 1: Write the failing test**

```python
"""Contract tests for the NL → filter system prompt.

The prompt is data, not code, so we pin the parts the spec depends on:
- jurisdiction + decision_date rules exist, with Polish and English phrasings;
- default date field is decision_date (both jurisdictions have it);
- case_type / court_level never appear (data defect, APP_STATUS §4).
"""

from __future__ import annotations

import pytest

from app.extraction_domain.nl_filter_generator import (
    NL_EXCLUDED_CORE_FIELDS,
    SYSTEM_PROMPT,
    BaseSchemaFilter,
)

pytestmark = pytest.mark.unit


def test_prompt_documents_jurisdiction_values():
    assert "jurisdiction: PL | UK" in SYSTEM_PROMPT


@pytest.mark.parametrize(
    "phrase",
    [
        # English
        "United Kingdom", "England", "Poland", "Polish",
        # Polish
        "polskie", "brytyjskie", "w Polsce", "w Anglii",
    ],
)
def test_prompt_lists_jurisdiction_phrasings(phrase: str):
    assert phrase in SYSTEM_PROMPT


@pytest.mark.parametrize(
    "phrase",
    ["2015–2024", "w latach", "od 2020", "po 2020", "przed 2010", "since", "between"],
)
def test_prompt_lists_date_phrasings(phrase: str):
    assert phrase in SYSTEM_PROMPT


def test_prompt_makes_decision_date_the_default_date_field():
    idx_default = SYSTEM_PROMPT.index("default to `decision_date`")
    idx_appeal = SYSTEM_PROMPT.index("`date_of_appeal_court_judgment` only when")
    assert idx_default < idx_appeal


def test_prompt_has_a_polish_example_with_both_jurisdictions_and_a_year_range():
    assert 'user: "kobiety skazane za oszustwo' in SYSTEM_PROMPT
    assert 'jurisdiction: ["PL", "UK"]' in SYSTEM_PROMPT
    assert 'decision_date: {"from": "2015-01-01", "to": "2024-12-31"}' in SYSTEM_PROMPT


def test_excluded_core_fields_never_reach_the_llm():
    for field in NL_EXCLUDED_CORE_FIELDS:
        assert field not in SYSTEM_PROMPT, f"{field} leaked into the prompt"
        assert field not in BaseSchemaFilter.model_json_schema()["properties"]
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_nl_filter_prompt_contract.py -q
```
Expected: FAIL on every assertion except `test_excluded_core_fields_never_reach_the_llm`.

- [ ] **Step 3: Edit `SYSTEM_PROMPT`**

(a) Change the opening sentence to:

```
You translate a user's natural-language question (English or Polish) about UK
and Polish criminal-court judgments into a structured filter for the
`filter_documents_by_extracted_data` Postgres RPC.
```

(b) Replace rule 4 with:

```
4. Dates: use ISO YYYY-MM-DD. "in 2024" / "w 2024 r." → from 2024-01-01 to
   2024-12-31. "since 2020" / "od 2020" / "po 2020" → from 2020-01-01.
   "before 2010" / "przed 2010" → to 2009-12-31. "between 2015 and 2024" /
   "2015–2024" / "w latach 2015–2024" → from 2015-01-01 to 2024-12-31.
   When the user talks about *when the judgment was given*, default to
   `decision_date` — it exists for every PL and UK judgment. Use
   `date_of_appeal_court_judgment` only when the user explicitly names the
   appeal court judgment date.
```

(c) Append rules 8 and 9 after rule 7:

```
8. `jurisdiction` is the country of the court. Set it only when the user names
   a country or legal system:
   - "UK", "United Kingdom", "England", "English", "British", "brytyjskie",
     "angielskie", "w Anglii", "w Wielkiej Brytanii" → ["UK"]
   - "Poland", "Polish", "polskie", "polski sąd", "w Polsce" → ["PL"]
   - "PL i UK", "both countries", "Polish and English courts", "porównaj PL z
     UK" → ["PL", "UK"]
   A question written in Polish is NOT by itself a reason to set ["PL"].
9. Case type (civil / criminal / "karne" / "cywilne") and court level are NOT
   available as filters. Do not try to express them through other fields;
   leave them out.
```

(d) In `Enum reference`, add as the first bullet:

```
- jurisdiction: PL | UK
```

(e) Change the existing example

```
user: "successful appeals where the conviction was quashed in 2025"
→ appeal_outcome: ["outcome_conviction_quashed"],
  decision_date: {"from": "2025-01-01", "to": "2025-12-31"}
```

and append two examples:

```
user: "kobiety skazane za oszustwo z wyrokiem w zawieszeniu, PL i UK, 2015–2024"
→ offender_gender: ["gender_female"],
  convict_offences: ["fraud"],
  sentences_received: ["suspended sentence"],
  jurisdiction: ["PL", "UK"],
  decision_date: {"from": "2015-01-01", "to": "2024-12-31"}

user: "English cases since 2020 where the offender was remanded in custody"
→ jurisdiction: ["UK"],
  remand_decision: ["remanded_in_custody"],
  decision_date: {"from": "2020-01-01"}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && poetry run pytest tests/app/test_nl_filter_prompt_contract.py tests/app/test_nl_filter_generator.py -q
```
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd backend && poetry run ruff check app/extraction_domain/nl_filter_generator.py tests/app/test_nl_filter_prompt_contract.py && poetry run ruff format app tests
git add backend/app/extraction_domain/nl_filter_generator.py backend/tests/app/test_nl_filter_prompt_contract.py
git commit -m "feat(nl-filter): prompt rules for jurisdiction and date ranges (PL/EN), case_type excluded"
```

---

### Task 3: RPC migration + Database Contract coverage

**Files:**
- Create: `supabase/migrations/20260920000001_filter_by_jurisdiction_and_decision_date.sql`
- Modify: `backend/tests/db/test_migration_chain.py:87-135`
- Create: `backend/tests/db/test_base_schema_filter_contract.py`
- Modify: `docs/how-to/test-base-schema-filter-queries.md` (append Query 11, 12)

**Interfaces:**
- Produces: `filter_documents_by_extracted_data(p_filters JSONB, p_text_query TEXT, p_limit INT, p_offset INT)` — same signature; honours `p_filters->'jurisdiction'` (JSON array of `'PL'|'UK'`) and `p_filters->'decision_date'` (`{"from","to"}` / `{"min","max"}` / scalar ISO date).

- [ ] **Step 1: Write the failing contract tests**

In `backend/tests/db/test_migration_chain.py`, add to `EXPECTED_RPC_ARGS`:

```python
    # backend/app/extraction_domain/results_router.py:483 and
    # backend/app/extraction_domain/filter_ids.py — jurisdiction/decision_date
    # travel INSIDE p_filters, so the argument list must never grow (a second
    # overload makes PostgREST answer 300 for every caller).
    "filter_documents_by_extracted_data": [
        "p_filters",
        "p_text_query",
        "p_limit",
        "p_offset",
    ],
```

and add a new test after `test_rpc_exists_with_the_argument_names_postgrest_matches_by`:

```python
@pytest.mark.parametrize("function", sorted(EXPECTED_RPC_ARGS))
def test_rpc_has_exactly_one_overload(conn, function: str) -> None:
    """CREATE OR REPLACE with a changed parameter list adds an overload instead of
    replacing the function; PostgREST then cannot pick one and answers 300."""
    count = _scalar(
        conn,
        "SELECT count(*) FROM pg_proc p JOIN pg_namespace n "
        "ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname=%s",
        (function,),
    )
    assert count == 1, f"{function} has {count} overloads; expected exactly 1"
```

Create `backend/tests/db/test_base_schema_filter_contract.py`:

```python
"""filter_documents_by_extracted_data honours the two core-column keys added
by 20260920000001 (jurisdiction, decision_date) and ignores their absence.

Behavioural, not structural: the argument names are pinned in
test_migration_chain.py; here we prove the body reads the new JSONB keys.
"""

from __future__ import annotations

import json
import uuid

import pytest

pytestmark = pytest.mark.db


def _insert_judgment(conn, *, jurisdiction: str, decision_date: str) -> str:
    jid = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.judgments
                (id, case_number, jurisdiction, decision_date, full_text,
                 base_extraction_status)
            VALUES (%s::uuid, %s, %s, %s::date, 'contract fixture', 'completed')
            """,
            (jid, f"CT-{jid[:8]}", jurisdiction, decision_date),
        )
    return jid


def _filter_ids(conn, filters: dict) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM public.filter_documents_by_extracted_data("
            "p_filters := %s::jsonb, p_text_query := NULL, p_limit := 100, p_offset := 0)",
            (json.dumps(filters),),
        )
        return {str(row[0]) for row in cur.fetchall()}


@pytest.fixture
def two_judgments(conn):
    pl = _insert_judgment(conn, jurisdiction="PL", decision_date="2016-03-01")
    uk = _insert_judgment(conn, jurisdiction="UK", decision_date="2021-07-15")
    yield pl, uk
    with conn.cursor() as cur:
        cur.execute("DELETE FROM public.judgments WHERE id IN (%s::uuid, %s::uuid)", (pl, uk))


def test_no_core_filters_returns_both(conn, two_judgments) -> None:
    pl, uk = two_judgments
    assert {pl, uk} <= _filter_ids(conn, {})


def test_jurisdiction_filters_to_named_countries(conn, two_judgments) -> None:
    pl, uk = two_judgments
    only_pl = _filter_ids(conn, {"jurisdiction": ["PL"]})
    assert pl in only_pl and uk not in only_pl
    both = _filter_ids(conn, {"jurisdiction": ["PL", "UK"]})
    assert {pl, uk} <= both


def test_decision_date_range_is_inclusive(conn, two_judgments) -> None:
    pl, uk = two_judgments
    since_2019 = _filter_ids(conn, {"decision_date": {"from": "2019-01-01"}})
    assert uk in since_2019 and pl not in since_2019
    window = _filter_ids(
        conn, {"decision_date": {"from": "2016-03-01", "to": "2016-03-01"}}
    )
    assert pl in window and uk not in window


def test_decision_date_accepts_min_max_aliases_and_scalar(conn, two_judgments) -> None:
    pl, uk = two_judgments
    assert pl in _filter_ids(conn, {"decision_date": {"min": "2016-01-01", "max": "2016-12-31"}})
    assert uk in _filter_ids(conn, {"decision_date": "2021-07-15"})


def test_core_filters_combine_with_base_filters(conn, two_judgments) -> None:
    pl, uk = two_judgments
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE public.judgments SET base_offender_gender = ARRAY['gender_female'] WHERE id = %s::uuid",
            (uk,),
        )
    hits = _filter_ids(
        conn,
        {"jurisdiction": ["UK"], "offender_gender": ["gender_female"],
         "decision_date": {"from": "2020-01-01"}},
    )
    assert hits == {uk}
```

- [ ] **Step 2: Run to verify failure** (needs a throwaway Postgres)

```bash
docker run -d --rm --name juddges-dbc -e POSTGRES_PASSWORD=postgres -p 55432:5432 pgvector/pgvector:pg17
sleep 5
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres \
  poetry run pytest -m db tests/db/test_migration_chain.py tests/db/test_base_schema_filter_contract.py -q
```
Expected: `test_jurisdiction_filters_to_named_countries`, `test_decision_date_*`, `test_core_filters_combine_*` FAIL (both rows returned); overload test PASSES already (there is one overload).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260920000001_filter_by_jurisdiction_and_decision_date.sql`. Copy the **whole** `CREATE OR REPLACE FUNCTION public.filter_documents_by_extracted_data(...)` block from `supabase/migrations/20260505000001_extend_base_schema_filterable_searchable.sql:141-473` verbatim (same four parameters, same `RETURNS TABLE`, same `LANGUAGE plpgsql STABLE`), preceded by this header:

```sql
-- =============================================================================
-- Migration: filter_documents_by_extracted_data — core-column filters
-- =============================================================================
-- Adds two keys read from p_filters (signature UNCHANGED on purpose — a new
-- parameter would create an overload PostgREST cannot disambiguate):
--   p_filters->'jurisdiction'   JSON array of 'PL' | 'UK'      → j.jurisdiction = ANY(...)
--   p_filters->'decision_date'  {"from","to"} | {"min","max"} | "YYYY-MM-DD"
--                                                              → j.decision_date range / equality
-- Both are served by idx_judgments_jurisdiction_date (20260209000001).
-- Body otherwise identical to 20260505000001.
-- =============================================================================
```

Then apply these three hunks inside the copied body:

(a) In `DECLARE`, after `v_pre_sent_report …;` add:

```sql
    -- core judgment columns (issue: Spec B)
    v_jurisdiction TEXT[] := public._jsonb_to_text_array(p_filters -> 'jurisdiction');
    v_decision_date_eq DATE := NULL;
    v_decision_date_from DATE := NULL;
    v_decision_date_to DATE := NULL;
```

(b) In `BEGIN`, right after the `date_of_appeal_court_judgment` parsing block, add:

```sql
    IF p_filters ? 'decision_date' THEN
        IF jsonb_typeof(p_filters -> 'decision_date') = 'object' THEN
            IF (p_filters -> 'decision_date') ? 'from' THEN
                v_decision_date_from := (p_filters -> 'decision_date' ->> 'from')::DATE;
            ELSIF (p_filters -> 'decision_date') ? 'min' THEN
                v_decision_date_from := (p_filters -> 'decision_date' ->> 'min')::DATE;
            END IF;
            IF (p_filters -> 'decision_date') ? 'to' THEN
                v_decision_date_to := (p_filters -> 'decision_date' ->> 'to')::DATE;
            ELSIF (p_filters -> 'decision_date') ? 'max' THEN
                v_decision_date_to := (p_filters -> 'decision_date' ->> 'max')::DATE;
            END IF;
        ELSE
            v_decision_date_eq := (p_filters ->> 'decision_date')::DATE;
        END IF;
    END IF;
```

(c) In the `WHERE`, immediately after `j.base_extraction_status = 'completed'` add:

```sql
            -- core judgment columns
            AND (v_jurisdiction IS NULL OR j.jurisdiction = ANY(v_jurisdiction))
            AND (
                (v_decision_date_eq IS NULL OR j.decision_date = v_decision_date_eq)
                AND (v_decision_date_from IS NULL OR j.decision_date >= v_decision_date_from)
                AND (v_decision_date_to IS NULL OR j.decision_date <= v_decision_date_to)
            )
```

Keep the trailing `GRANT EXECUTE ON FUNCTION public.filter_documents_by_extracted_data(JSONB, TEXT, INT, INT) TO anon, authenticated, service_role;`. Do **not** add `ANALYZE` (no new index).

- [ ] **Step 4: Run the contract suite**

```bash
cd backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres poetry run pytest -m db -q
docker stop juddges-dbc
```
Expected: PASS (whole `db` tier, including the pre-existing chain tests).

- [ ] **Step 5: Document the two new queries**

Append to `docs/how-to/test-base-schema-filter-queries.md`:

````markdown
## Query 11 — Jurisdiction (core column, added 2026-09-20)

**Intent:** "Only Polish judgments."

```json
{ "filters": { "jurisdiction": ["PL"] }, "limit": 50 }
```

```sql
SELECT id, jurisdiction, decision_date
FROM filter_documents_by_extracted_data('{"jurisdiction":["PL"]}'::jsonb, NULL, 50, 0);
```

## Query 12 — Decision-date window + jurisdiction

**Intent:** "PL and UK judgments handed down 2015–2024."

```json
{ "filters": { "jurisdiction": ["PL","UK"], "decision_date": { "from": "2015-01-01", "to": "2024-12-31" } } }
```

```sql
SELECT id, jurisdiction, decision_date
FROM filter_documents_by_extracted_data(
  '{"jurisdiction":["PL","UK"],"decision_date":{"from":"2015-01-01","to":"2024-12-31"}}'::jsonb,
  NULL, 50, 0);
```

`decision_date` also accepts `{"min","max"}` and a scalar `"YYYY-MM-DD"`, mirroring `date_of_appeal_court_judgment`.
````

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260920000001_filter_by_jurisdiction_and_decision_date.sql backend/tests/db/test_migration_chain.py backend/tests/db/test_base_schema_filter_contract.py docs/how-to/test-base-schema-filter-queries.md
git commit -m "feat(db): filter_documents_by_extracted_data reads jurisdiction and decision_date from p_filters"
```

---

### Task 4: Frontend types + core-field registry + chips

**Files:**
- Modify: `frontend/types/base-schema-filter.ts`
- Modify: `frontend/lib/extractions/base-schema-filter-config.ts` (after `FILTER_FIELD_BY_NAME`, ~line 486)
- Modify: `frontend/components/filters/extracted-search-filters.tsx:611-660` (`ActiveFilterChips`)
- Modify: `frontend/__tests__/lib/extractions/base-schema-filter-config.test.ts`
- Create: `frontend/__tests__/components/filters/active-filter-chips.test.tsx`

**Interfaces:**
- Produces (types): `export type Jurisdiction = "PL" | "UK"`; `BaseSchemaFilters.jurisdiction?: Jurisdiction[]`; `BaseSchemaFilters.decision_date?: string | DateRange`.
- Produces (config): `CORE_FILTER_FIELDS: readonly FilterFieldConfig[]` (two entries, `group: "court_date"`), `CORE_FILTER_FIELD_BY_NAME: Record<string, FilterFieldConfig>`, `ALL_FILTER_FIELD_BY_NAME: Record<string, FilterFieldConfig>`, `isCoreFilterField(field: string): boolean`. **`FILTER_FIELDS` is untouched** → `FIELDS_BY_GROUP`, drawer, quick filters, Meili map unchanged.

- [ ] **Step 1: Write the failing tests**

In `base-schema-filter-config.test.ts`: add `jurisdiction: true, decision_date: true` to `REQUIRED_KEYS` (TypeScript forces it once the type changes), then change the first test and add a core-registry block:

```ts
import {
  CORE_FILTER_FIELDS,
  CORE_FILTER_FIELD_BY_NAME,
  ALL_FILTER_FIELD_BY_NAME,
  isCoreFilterField,
  // ...existing imports
} from "@/lib/extractions/base-schema-filter-config";

// Core judgments.* columns filtered by the RPC but deliberately kept OUT of
// FILTER_FIELDS so BaseFiltersDrawer / QuickFilters / Meili mapping stay as
// they are (spec AC5). They get chips + the ScopeFilters strip instead.
const CORE_KEYS = new Set<string>(["jurisdiction", "decision_date"]);

  it("covers every BaseSchemaFilters key (registry may be a superset)", () => {
    const fields = new Set(FILTER_FIELDS.map((c) => c.field));
    const required = new Set(
      Object.keys(REQUIRED_KEYS).filter((k) => !CORE_KEYS.has(k)),
    );
    // ...rest unchanged
  });

describe("core filter fields (jurisdiction, decision_date)", () => {
  it("are registered separately and never leak into FILTER_FIELDS", () => {
    expect(CORE_FILTER_FIELDS.map((c) => c.field).sort()).toEqual(
      ["decision_date", "jurisdiction"],
    );
    for (const c of CORE_FILTER_FIELDS) {
      expect(FILTER_FIELD_BY_NAME[c.field]).toBeUndefined();
      expect(CORE_FILTER_FIELD_BY_NAME[c.field]).toBe(c);
      expect(ALL_FILTER_FIELD_BY_NAME[c.field]).toBe(c);
      expect(isCoreFilterField(c.field)).toBe(true);
    }
    expect(isCoreFilterField("offender_gender")).toBe(false);
  });

  it("jurisdiction is an enum_multi over exactly PL and UK", () => {
    const cfg = CORE_FILTER_FIELD_BY_NAME.jurisdiction;
    expect(cfg.control).toBe("enum_multi");
    expect([...(cfg.enumValues ?? [])].sort()).toEqual(["PL", "UK"]);
  });

  it("decision_date is a date_range", () => {
    expect(CORE_FILTER_FIELD_BY_NAME.decision_date.control).toBe("date_range");
  });

  it("ALL_FILTER_FIELD_BY_NAME still resolves every FILTER_FIELDS entry", () => {
    for (const c of FILTER_FIELDS) expect(ALL_FILTER_FIELD_BY_NAME[c.field]).toBe(c);
  });
});
```

Create `frontend/__tests__/components/filters/active-filter-chips.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";

import { ActiveFilterChips } from "@/components/filters/extracted-search-filters";

describe("ActiveFilterChips — core fields", () => {
  it("renders jurisdiction and decision_date as removable chips", () => {
    const onRemove = jest.fn();
    render(
      <ActiveFilterChips
        filters={{
          jurisdiction: ["PL", "UK"],
          decision_date: { from: "2015-01-01", to: "2024-12-31" },
          offender_gender: ["gender_female"],
        }}
        textQuery=""
        onRemove={onRemove}
        onClearText={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByText("Jurisdiction:")).toBeInTheDocument();
    expect(screen.getByText("PL, UK")).toBeInTheDocument();
    expect(screen.getByText("Decision date:")).toBeInTheDocument();
    expect(screen.getByText("2015-01-01→2024-12-31")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Jurisdiction" }));
    expect(onRemove).toHaveBeenCalledWith("jurisdiction");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest __tests__/lib/extractions/base-schema-filter-config.test.ts __tests__/components/filters/active-filter-chips.test.tsx
```
Expected: FAIL — missing exports; chips test finds no "Jurisdiction:" (unknown field → `config` undefined → chip skipped, see `extracted-search-filters.tsx:640-642`).

- [ ] **Step 3: Implement types**

In `frontend/types/base-schema-filter.ts`, after `export type AppealOutcome = ...` add:

```ts
/** Core `judgments.jurisdiction` — CHECK (jurisdiction IN ('PL','UK')). */
export type Jurisdiction = "PL" | "UK";
```

and at the top of `BaseSchemaFilters` add:

```ts
  // core judgment columns (judgments.jurisdiction / judgments.decision_date;
  // added by supabase/migrations/20260920000001_*). Not base_* fields.
  jurisdiction?: Jurisdiction[];
  decision_date?: string | DateRange;
```

- [ ] **Step 4: Implement registry additions**

In `base-schema-filter-config.ts`, after `FILTER_FIELD_BY_NAME`:

```ts
// -----------------------------------------------------------------------------
// Core judgment columns (judgments.jurisdiction, judgments.decision_date).
//
// Filtered by the RPC since 20260920000001, but kept OUT of FILTER_FIELDS on
// purpose: FIELDS_BY_GROUP drives BaseFiltersDrawer and filter-fields-map.ts
// (Meili `base_*` columns), and neither applies to these two. They are
// surfaced by ScopeFilters + ActiveFilterChips + the URL blob only.
// -----------------------------------------------------------------------------

const JURISDICTIONS = ["PL", "UK"] as const;

export const CORE_FILTER_FIELDS: readonly FilterFieldConfig[] = [
  {
    field: "jurisdiction",
    label: "Jurisdiction",
    help: "Country of the court.",
    group: "court_date",
    control: "enum_multi",
    enumValues: JURISDICTIONS,
  },
  {
    field: "decision_date",
    label: "Decision date",
    help: "Date the judgment was handed down (both jurisdictions).",
    group: "court_date",
    control: "date_range",
  },
] as const;

export const CORE_FILTER_FIELD_BY_NAME: Record<string, FilterFieldConfig> =
  Object.fromEntries(CORE_FILTER_FIELDS.map((c) => [c.field, c]));

/** Every field the RPC accepts: base_* registry + core columns. */
export const ALL_FILTER_FIELD_BY_NAME: Record<string, FilterFieldConfig> = {
  ...FILTER_FIELD_BY_NAME,
  ...CORE_FILTER_FIELD_BY_NAME,
};

export function isCoreFilterField(field: string): boolean {
  return field in CORE_FILTER_FIELD_BY_NAME;
}
```

Make `formatEnumLabel` leave two-letter uppercase codes alone (so the chip says `PL`, not `Pl`): at the top of `formatEnumLabel` add `if (/^[A-Z]{2}$/.test(value)) return value;`.

- [ ] **Step 5: Chips resolve via the union map**

In `extracted-search-filters.tsx`: import `ALL_FILTER_FIELD_BY_NAME` alongside `FILTER_FIELD_BY_NAME`; in `ActiveFilterChips` change `const config = FILTER_FIELD_BY_NAME[field];` to `const config = ALL_FILTER_FIELD_BY_NAME[field];`. In `describeActive`, render enum arrays as their values when the field is an `enum_multi` with ≤ 3 selected: replace the `Array.isArray(value)` branch with

```ts
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (config.control === "enum_multi" && value.length <= 3) {
      return value.map((v) => formatEnumLabel(String(v))).join(", ");
    }
    return `${value.length}`;
  }
```

(This also improves existing enum chips; `FieldRow` badges get the same text, which is fine.)

- [ ] **Step 6: Run tests + type-check**

```bash
cd frontend && npx jest __tests__/lib/extractions __tests__/components/filters __tests__/components/search && npm run validate
```
Expected: PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/types/base-schema-filter.ts frontend/lib/extractions/base-schema-filter-config.ts frontend/components/filters/extracted-search-filters.tsx frontend/__tests__/lib/extractions/base-schema-filter-config.test.ts frontend/__tests__/components/filters/active-filter-chips.test.tsx
git commit -m "feat(extractions-search): core filter fields (jurisdiction, decision_date) with chips"
```

---

### Task 5: Extract the drawer adapter, fix date encoding, skip core fields

**Files:**
- Create: `frontend/lib/extractions/drawer-adapter.ts`
- Modify: `frontend/app/search/extractions/page.tsx:33-122` (delete local `toDrawerFilters`/`applyDrawerChange`, import instead)
- Create: `frontend/__tests__/lib/extractions/drawer-adapter.test.ts`

Why: `page.tsx:66-72` maps RPC `{from,to}` ISO strings into `min/max`, but `DateRangeControl` (`components/search/controls/DateRangeControl.tsx:4-13`) expects **epoch seconds** and emits epoch seconds, which `applyDrawerChange` (`page.tsx:110-115`) writes back into `from/to` → the RPC casts `'1735689600'::DATE` and errors. `decision_date` needs the same adapter, so fix it once here.

**Interfaces:**
- Produces: `toDrawerFilters(s: BaseSchemaFilters): BaseFilters` (skips substring **and core** fields); `applyDrawerChange(s, field, value): BaseSchemaFilters`; `isoToEpochSeconds(iso?: string): number | undefined`; `epochSecondsToIso(s?: number): string | undefined`; `coreToDrawerValue(field, value): BaseFilterValue | undefined` and `applyCoreChange(s, field, value)` for ScopeFilters (Task 6).

- [ ] **Step 1: Write the failing tests**

```ts
import {
  applyCoreChange,
  applyDrawerChange,
  coreToDrawerValue,
  epochSecondsToIso,
  isoToEpochSeconds,
  toDrawerFilters,
} from "@/lib/extractions/drawer-adapter";

describe("drawer-adapter dates", () => {
  it("maps ISO from/to into epoch-second min/max for DateRangeControl", () => {
    const out = toDrawerFilters({
      date_of_appeal_court_judgment: { from: "2025-01-01", to: "2025-12-31" },
    });
    expect(out.date_of_appeal_court_judgment).toEqual({
      kind: "date_range",
      range: { min: isoToEpochSeconds("2025-01-01"), max: isoToEpochSeconds("2025-12-31") },
    });
  });

  it("writes epoch seconds back as ISO from/to (never raw numbers)", () => {
    const next = applyDrawerChange({}, "date_of_appeal_court_judgment", {
      kind: "date_range",
      range: { min: isoToEpochSeconds("2024-06-01") },
    });
    expect(next.date_of_appeal_court_judgment).toEqual({ from: "2024-06-01", to: undefined });
  });

  it("round-trips epoch <-> iso", () => {
    expect(epochSecondsToIso(isoToEpochSeconds("2015-01-01"))).toBe("2015-01-01");
    expect(isoToEpochSeconds(undefined)).toBeUndefined();
    expect(epochSecondsToIso(undefined)).toBeUndefined();
  });
});

describe("drawer-adapter core fields", () => {
  it("keeps jurisdiction and decision_date OUT of the drawer state", () => {
    const out = toDrawerFilters({
      jurisdiction: ["PL"],
      decision_date: { from: "2015-01-01" },
      offender_gender: ["gender_female"],
    });
    expect(Object.keys(out)).toEqual(["offender_gender"]);
  });

  it("exposes them to ScopeFilters through coreToDrawerValue/applyCoreChange", () => {
    expect(coreToDrawerValue("jurisdiction", ["PL", "UK"])).toEqual({
      kind: "enum_multi", values: ["PL", "UK"],
    });
    expect(coreToDrawerValue("decision_date", { from: "2015-01-01", to: "2024-12-31" })).toEqual({
      kind: "date_range",
      range: { min: isoToEpochSeconds("2015-01-01"), max: isoToEpochSeconds("2024-12-31") },
    });
    const next = applyCoreChange({ offender_gender: ["gender_female"] }, "jurisdiction", {
      kind: "enum_multi", values: ["UK"],
    });
    expect(next).toEqual({ offender_gender: ["gender_female"], jurisdiction: ["UK"] });
    expect(applyCoreChange(next, "jurisdiction", undefined)).toEqual({ offender_gender: ["gender_female"] });
  });

  it("keeps numeric and boolean behaviour identical to the old page adapter", () => {
    expect(toDrawerFilters({ num_victims: 3 }).num_victims).toEqual({
      kind: "numeric_range", range: { min: 3, max: 3 },
    });
    expect(applyDrawerChange({}, "did_offender_confess", { kind: "boolean_tri", value: false }))
      .toEqual({ did_offender_confess: false });
    expect(applyDrawerChange({}, "co_def_acc_num", { kind: "numeric_range", range: { min: 2, max: 2 } }))
      .toEqual({ co_def_acc_num: 2 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest __tests__/lib/extractions/drawer-adapter.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `drawer-adapter.ts`**

```ts
// =============================================================================
// Adapter: BaseSchemaFilters (RPC JSON) <-> BaseFilters (drawer/control union).
//
// Lifted out of app/search/extractions/page.tsx so ScopeFilters, the page and
// tests share ONE conversion. Dates: the RPC speaks ISO `{from,to}`; the
// controls speak epoch-second `{min,max}` (DateRangeControl.tsx). The old
// page adapter passed strings through and produced `'1735689600'::DATE`
// casts in Postgres.
// =============================================================================

import type { BaseFilters, BaseFilterValue } from "@/lib/store/searchStore";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

import { isCoreFilterField } from "./base-schema-filter-config";

const SUBSTRING_FIELDS = new Set([
  "case_name",
  "neutral_citation_number",
  "appeal_court_judges_names",
  "offender_representative_name",
]);

export function isoToEpochSeconds(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

export function epochSecondsToIso(s: number | undefined): string | undefined {
  if (typeof s !== "number" || !Number.isFinite(s)) return undefined;
  return new Date(s * 1000).toISOString().slice(0, 10);
}

function toDrawerValue(value: unknown): BaseFilterValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.length === 0 ? undefined : { kind: "tag_array", values: value as string[] };
  }
  if (typeof value === "boolean") return { kind: "boolean_tri", value };
  if (typeof value === "number") return { kind: "numeric_range", range: { min: value, max: value } };
  if (typeof value === "string") {
    // scalar ISO date (RPC accepts "YYYY-MM-DD" for date fields)
    const epoch = isoToEpochSeconds(value);
    return epoch === undefined ? undefined : { kind: "date_range", range: { min: epoch, max: epoch } };
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("from" in v || "to" in v) {
      return {
        kind: "date_range",
        range: {
          min: isoToEpochSeconds(v.from as string | undefined),
          max: isoToEpochSeconds(v.to as string | undefined),
        },
      };
    }
    if ("min" in v || "max" in v) {
      return {
        kind: "numeric_range",
        range: { min: v.min as number | undefined, max: v.max as number | undefined },
      };
    }
  }
  return undefined;
}

/** Non-substring, non-core fields → drawer union. */
export function toDrawerFilters(s: BaseSchemaFilters): BaseFilters {
  const out: BaseFilters = {};
  for (const [field, value] of Object.entries(s)) {
    if (SUBSTRING_FIELDS.has(field) || isCoreFilterField(field)) continue;
    const v = toDrawerValue(value);
    if (v) out[field] = v;
  }
  return out;
}

/** Core field (jurisdiction / decision_date) → control value. */
export function coreToDrawerValue(field: string, value: unknown): BaseFilterValue | undefined {
  const v = toDrawerValue(value);
  if (v?.kind === "tag_array" && field === "jurisdiction") {
    return { kind: "enum_multi", values: v.values };
  }
  return v;
}

function fromDrawerValue(value: BaseFilterValue): unknown {
  switch (value.kind) {
    case "tag_array":
    case "enum_multi":
      return value.values;
    case "boolean_tri":
      return value.value;
    case "numeric_range":
      return value.range.min === value.range.max && value.range.min !== undefined
        ? value.range.min
        : { min: value.range.min, max: value.range.max };
    case "date_range":
      return { from: epochSecondsToIso(value.range.min), to: epochSecondsToIso(value.range.max) };
  }
}

export function applyDrawerChange(
  s: BaseSchemaFilters,
  field: string,
  value: BaseFilterValue | undefined,
): BaseSchemaFilters {
  const next = { ...s } as Record<string, unknown>;
  if (value === undefined) delete next[field];
  else next[field] = fromDrawerValue(value);
  return next as BaseSchemaFilters;
}

/** Same as applyDrawerChange; named separately so call sites read clearly. */
export const applyCoreChange = applyDrawerChange;
```

- [ ] **Step 4: Use it in `page.tsx`**

Delete the local `toDrawerFilters` and `applyDrawerChange` (lines 33–122) and add `import { applyDrawerChange, toDrawerFilters } from "@/lib/extractions/drawer-adapter";`. Remove the now-unused `BaseFilters` type import if lint complains. `resetDrawerFilters` must also keep core fields: change its predicate to

```ts
      if (
        field !== "case_name" &&
        field !== "appeal_court_judges_names" &&
        field !== "offender_representative_name" &&
        !isCoreFilterField(field)
      ) {
```

(import `isCoreFilterField` from the config module).

- [ ] **Step 5: Run tests + validate**

```bash
cd frontend && npx jest __tests__/lib/extractions __tests__/app/search && npm run validate
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/extractions/drawer-adapter.ts frontend/__tests__/lib/extractions/drawer-adapter.test.ts frontend/app/search/extractions/page.tsx
git commit -m "fix(extractions-search): shared drawer adapter with ISO<->epoch date conversion; core fields bypass drawer"
```

---

### Task 6: `ScopeFilters` strip (jurisdiction + decision date)

**Files:**
- Create: `frontend/components/search/ScopeFilters.tsx`
- Create: `frontend/__tests__/components/search/ScopeFilters.test.tsx`
- Modify: `frontend/app/search/extractions/page.tsx` (render above `QuickFilters`)

**Interfaces:**
- Consumes: `CORE_FILTER_FIELDS`, `coreToDrawerValue`, `applyCoreChange`, `EnumMultiControl`, `DateRangeControl`.
- Produces: `<ScopeFilters filters={BaseSchemaFilters} onChange={(next: BaseSchemaFilters) => void} disabled? />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";

import { ScopeFilters } from "@/components/search/ScopeFilters";

describe("ScopeFilters", () => {
  it("renders PL/UK checkboxes and a decision-date range", () => {
    render(<ScopeFilters filters={{}} onChange={() => {}} />);
    expect(screen.getByTestId("scope-filters")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "PL" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "UK" })).not.toBeChecked();
    expect(screen.getByLabelText("Decision date minimum")).toBeInTheDocument();
  });

  it("emits the full BaseSchemaFilters with jurisdiction toggled", () => {
    const onChange = jest.fn();
    render(<ScopeFilters filters={{ offender_gender: ["gender_female"] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "UK" }));
    expect(onChange).toHaveBeenCalledWith({
      offender_gender: ["gender_female"],
      jurisdiction: ["UK"],
    });
  });

  it("emits ISO from/to for decision_date", () => {
    const onChange = jest.fn();
    render(<ScopeFilters filters={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Decision date minimum"), {
      target: { value: "2015-01-01" },
    });
    expect(onChange).toHaveBeenCalledWith({
      decision_date: { from: "2015-01-01", to: undefined },
    });
  });

  it("reflects existing values", () => {
    render(
      <ScopeFilters
        filters={{ jurisdiction: ["PL"], decision_date: { from: "2015-01-01", to: "2024-12-31" } }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "PL" })).toBeChecked();
    expect(screen.getByLabelText("Decision date maximum")).toHaveValue("2024-12-31");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest __tests__/components/search/ScopeFilters.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
"use client";
import React from "react";

import { CORE_FILTER_FIELD_BY_NAME } from "@/lib/extractions/base-schema-filter-config";
import { applyCoreChange, coreToDrawerValue } from "@/lib/extractions/drawer-adapter";
import type { BaseFilterValue } from "@/lib/store/searchStore";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

import { DateRangeControl } from "./controls/DateRangeControl";
import { EnumMultiControl } from "./controls/EnumMultiControl";

export interface ScopeFiltersProps {
  filters: BaseSchemaFilters;
  onChange: (next: BaseSchemaFilters) => void;
  disabled?: boolean;
}

/**
 * Corpus scope — jurisdiction (PL/UK) and decision date. These are core
 * `judgments` columns, not base_* extraction fields, so they live outside
 * BaseFiltersDrawer/QuickFilters (spec AC5) but share the same controls and
 * filter state.
 */
export function ScopeFilters({ filters, onChange, disabled }: ScopeFiltersProps): React.JSX.Element {
  const jurisdictionCfg = CORE_FILTER_FIELD_BY_NAME.jurisdiction;
  const dateCfg = CORE_FILTER_FIELD_BY_NAME.decision_date;

  const jurisdiction = coreToDrawerValue("jurisdiction", filters.jurisdiction);
  const decisionDate = coreToDrawerValue("decision_date", filters.decision_date);

  const set = (field: string) => (next: BaseFilterValue | undefined) =>
    onChange(applyCoreChange(filters, field, next));

  return (
    <div
      data-testid="scope-filters"
      className="rounded-md border border-[color:var(--rule)] bg-[color:var(--parchment)] p-3"
    >
      <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
        Scope
      </span>
      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
        <EnumMultiControl
          label={jurisdictionCfg.label}
          description={jurisdictionCfg.help}
          options={jurisdictionCfg.enumValues ?? []}
          value={jurisdiction?.kind === "enum_multi" ? jurisdiction : undefined}
          onChange={set("jurisdiction")}
          disabled={disabled}
        />
        <DateRangeControl
          label={dateCfg.label}
          description={dateCfg.help}
          value={decisionDate?.kind === "date_range" ? decisionDate : undefined}
          onChange={set("decision_date")}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export default ScopeFilters;
```

- [ ] **Step 4: Wire into the page**

In `page.tsx`, import `ScopeFilters` and render it right **before** `<QuickFilters …/>`:

```tsx
        <ScopeFilters filters={filters} onChange={setFilters} />
```

- [ ] **Step 5: Run tests + validate**

```bash
cd frontend && npx jest __tests__/components/search && npm run validate
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/search/ScopeFilters.tsx frontend/__tests__/components/search/ScopeFilters.test.tsx frontend/app/search/extractions/page.tsx
git commit -m "feat(extractions-search): ScopeFilters strip for jurisdiction and decision date"
```

---

### Task 7: URL state carries the NL question (`?nl=`)

**Files:**
- Modify: `frontend/lib/extractions/use-extracted-data-filters.ts`
- Modify: `frontend/components/search/NlFilterDialog.tsx:29-39, 108-112`
- Modify: `frontend/app/search/extractions/page.tsx` (`applyNlFilters`)
- Modify: `frontend/__tests__/lib/extractions/use-extracted-data-filters.test.ts`

What exists today (`use-extracted-data-filters.ts:1-15`): `?f=<base64url JSON blob>`, `?q=<text>`, `?page=<n>`. The blob is opaque, so `jurisdiction`/`decision_date` already round-trip with **zero** codec change — verified by the new test below. The only extension: persist the originating question so "Save as collection" can default the name after a reload/share, and so a shared link shows what was asked.

**Interfaces:**
- Produces: `buildSearchParams(state: FilterState): URLSearchParams` (pure, exported); hook returns additionally `nlQuestion: string`, `setNlQuestion(next: string): void`; `setFilters` **clears** `nlQuestion` only when called from `clearAll`. `NlFilterDialog.onApply(filters, textQuery, question)`.

- [ ] **Step 1: Write the failing tests**

```ts
import { buildSearchParams, decodeFilters, encodeFilters } from "@/lib/extractions/use-extracted-data-filters";

describe("core fields round-trip through the opaque blob unchanged", () => {
  it("keeps jurisdiction and decision_date", () => {
    const filters = { jurisdiction: ["PL", "UK"] as ("PL" | "UK")[], decision_date: { from: "2015-01-01", to: "2024-12-31" } };
    expect(decodeFilters(encodeFilters(filters))).toEqual(filters);
  });
});

describe("buildSearchParams", () => {
  it("writes f, q, page and nl only when set", () => {
    const params = buildSearchParams({
      filters: { jurisdiction: ["PL"] },
      textQuery: "fraud",
      page: 2,
      nlQuestion: "kobiety skazane za oszustwo, PL, 2015–2024",
    });
    expect(params.get("f")).toBe(encodeFilters({ jurisdiction: ["PL"] }));
    expect(params.get("q")).toBe("fraud");
    expect(params.get("page")).toBe("2");
    expect(params.get("nl")).toBe("kobiety skazane za oszustwo, PL, 2015–2024");
  });

  it("omits empty values and page 1", () => {
    const params = buildSearchParams({ filters: {}, textQuery: "  ", page: 1, nlQuestion: "" });
    expect(params.toString()).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest __tests__/lib/extractions/use-extracted-data-filters.test.ts
```
Expected: FAIL — `buildSearchParams` is not exported.

- [ ] **Step 3: Implement**

In `use-extracted-data-filters.ts`:
- Header comment: add `//   ?nl=<text>          — the natural-language question the filter came from (Save-as-collection default name)`.
- `interface FilterState { filters; textQuery; page; nlQuestion: string }`.
- `interface UseExtractedDataFiltersResult` add `setNlQuestion: (next: string) => void;`.
- Add pure helper before the hook:

```ts
export function buildSearchParams(next: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  const blob = encodeFilters(next.filters);
  if (blob) params.set("f", blob);
  if (next.textQuery.trim() !== "") params.set("q", next.textQuery.trim());
  if (next.page > 1) params.set("page", String(next.page));
  if (next.nlQuestion.trim() !== "") params.set("nl", next.nlQuestion.trim().slice(0, 255));
  return params;
}
```

- `initial`: add `nlQuestion: searchParams.get("nl") ?? ""`.
- `writeUrl`: replace the param-building lines with `const queryString = buildSearchParams(next).toString();`.
- Add `const setNlQuestion = useCallback((next: string) => setState((prev) => ({ ...prev, nlQuestion: next })), []);`.
- `clearAll`: also `nlQuestion: ""`.
- Return `setNlQuestion`.

In `NlFilterDialog.tsx`: change the prop type to `onApply: (filters: BaseSchemaFilters, textQuery: string, question: string) => void;` and `handleApply` to `onApply(preview.filters, preview.text_query ?? "", query.trim());`. Update the JSDoc: "…plus the original question so the page can keep it in the URL".

In `page.tsx`: destructure `nlQuestion, setNlQuestion` from the hook and

```tsx
  const applyNlFilters = (nextFilters: BaseSchemaFilters, nextTextQuery: string, question: string) => {
    setFilters(nextFilters);
    setTextQuery(nextTextQuery);
    setNlQuestion(question);
  };
```

- [ ] **Step 4: Run tests + validate**

```bash
cd frontend && npx jest __tests__/lib/extractions && npm run validate
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/extractions/use-extracted-data-filters.ts frontend/components/search/NlFilterDialog.tsx frontend/app/search/extractions/page.tsx frontend/__tests__/lib/extractions/use-extracted-data-filters.test.ts
git commit -m "feat(extractions-search): keep the NL question in the URL (?nl=)"
```

---

### Task 8: Row link → `/documents/{id}?f=…#base-fields` (fixes the 404)

**Files:**
- Create: `frontend/lib/extractions/document-href.ts`
- Create: `frontend/__tests__/lib/extractions/document-href.test.ts`
- Modify: `frontend/app/search/extractions/page.tsx:186-191` (`ResultRow`) and `ResultList` (thread `filters`)
- Modify: `frontend/__tests__/app/search/extractions-empty-state.test.tsx` (new prop default)

**Interfaces:**
- Produces: `buildDocumentHref(id: string, filters: BaseSchemaFilters): string` → `/documents/<id>` when no filters, else `/documents/<id>?f=<blob>#base-fields`. `ResultList` gains `filters: BaseSchemaFilters`.

- [ ] **Step 1: Write the failing test**

```ts
import { buildDocumentHref } from "@/lib/extractions/document-href";
import { encodeFilters } from "@/lib/extractions/use-extracted-data-filters";

describe("buildDocumentHref", () => {
  it("links to /documents/{id} (the /judgments route does not exist)", () => {
    expect(buildDocumentHref("abc", {})).toBe("/documents/abc");
  });
  it("carries the filter blob and the base-fields anchor", () => {
    const filters = { jurisdiction: ["PL"] as ("PL")[] };
    expect(buildDocumentHref("abc", filters)).toBe(
      `/documents/abc?f=${encodeFilters(filters)}#base-fields`,
    );
  });
  it("encodes the id", () => {
    expect(buildDocumentHref("a b", {})).toBe("/documents/a%20b");
  });
});
```

Also in `extractions-empty-state.test.tsx` the `renderList` helper must pass `filters={{}}`.

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest __tests__/lib/extractions/document-href.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/lib/extractions/document-href.ts`:

```ts
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

import { encodeFilters } from "./use-extracted-data-filters";

/** Anchor id of the base-schema fields grid on /documents/[id]. */
export const BASE_FIELDS_ANCHOR = "base-fields";

/**
 * Result-row link for /search/extractions. The judgment page reads `?f=` back
 * with decodeFilters() and highlights the base_* cells that satisfied it.
 */
export function buildDocumentHref(id: string, filters: BaseSchemaFilters): string {
  const base = `/documents/${encodeURIComponent(id)}`;
  const blob = encodeFilters(filters);
  return blob ? `${base}?f=${blob}#${BASE_FIELDS_ANCHOR}` : base;
}
```

In `page.tsx`: `ResultRow({ row, filters })` uses `href={buildDocumentHref(row.id, filters)}`; `ResultList` accepts `filters: BaseSchemaFilters` and passes it down; the page passes `filters={filters}`.

- [ ] **Step 4: Run tests + validate**

```bash
cd frontend && npx jest __tests__/lib/extractions __tests__/app/search && npm run validate
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/extractions/document-href.ts frontend/__tests__/lib/extractions/document-href.test.ts frontend/app/search/extractions/page.tsx frontend/__tests__/app/search/extractions-empty-state.test.tsx
git commit -m "fix(extractions-search): result rows link to /documents/{id} with the filter blob"
```

---

### Task 9: `matchedMetadataKeys()` — which metadata cells satisfied the filter

**Files:**
- Create: `frontend/lib/extractions/filter-match.ts`
- Create: `frontend/__tests__/lib/extractions/filter-match.test.ts`

Metadata from `GET /api/documents/{id}/metadata` carries every `base_*` column (merged by `backend/app/judgments_pkg/conversion.py:_merge_base_extraction_fields`), plus `country` (= `judgments.jurisdiction`, `conversion.py:30`) and `date_issued` (= `decision_date`, `conversion.py:33`).

**Interfaces:**
- Produces: `matchedMetadataKeys(filters: BaseSchemaFilters, metadata: Record<string, unknown>): Set<string>` — returns metadata keys (`base_<field>`, `country`, `date_issued`) whose value satisfies the corresponding filter. Pure; no React.

- [ ] **Step 1: Write the failing tests**

```ts
import { matchedMetadataKeys } from "@/lib/extractions/filter-match";

const meta = {
  country: "UK",
  date_issued: "2021-07-15T00:00:00",
  base_offender_gender: ["gender_female"],
  base_appeal_outcome: ["outcome_dismissed_or_refused"],
  base_co_def_acc_num: 3,
  base_did_offender_confess: true,
  base_appeal_court_judges_names: "Lord Justice Edis, Mr Justice Garnham",
  base_date_of_appeal_court_judgment: "2021-07-15",
  base_convict_offences: ["fraud", "theft"],
};

describe("matchedMetadataKeys", () => {
  it("maps core fields to country / date_issued", () => {
    const hits = matchedMetadataKeys(
      { jurisdiction: ["PL", "UK"], decision_date: { from: "2020-01-01", to: "2024-12-31" } },
      meta,
    );
    expect(hits).toEqual(new Set(["country", "date_issued"]));
  });

  it("does not flag a core field that does not match", () => {
    expect(matchedMetadataKeys({ jurisdiction: ["PL"] }, meta).size).toBe(0);
    expect(matchedMetadataKeys({ decision_date: { to: "2019-12-31" } }, meta).size).toBe(0);
  });

  it("array overlap, numeric range/equality, boolean, substring, date", () => {
    const hits = matchedMetadataKeys(
      {
        offender_gender: ["gender_female"],
        convict_offences: ["fraud"],
        co_def_acc_num: { min: 2 },
        num_victims: 1, // absent in metadata → no hit
        did_offender_confess: true,
        appeal_court_judges_names: "edis",
        date_of_appeal_court_judgment: "2021-07-15",
      },
      meta,
    );
    expect(hits).toEqual(
      new Set([
        "base_offender_gender",
        "base_convict_offences",
        "base_co_def_acc_num",
        "base_did_offender_confess",
        "base_appeal_court_judges_names",
        "base_date_of_appeal_court_judgment",
      ]),
    );
  });

  it("returns an empty set for empty filters or metadata", () => {
    expect(matchedMetadataKeys({}, meta).size).toBe(0);
    expect(matchedMetadataKeys({ offender_gender: ["gender_male"] }, {}).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest __tests__/lib/extractions/filter-match.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// =============================================================================
// Which metadata cells on /documents/[id] satisfied a BaseSchemaFilters blob?
// Mirrors the RPC semantics per control kind (= ANY / && / range / ILIKE) so a
// highlighted cell is exactly one the query matched on. Pure function.
// =============================================================================

import type { BaseSchemaFilters } from "@/types/base-schema-filter";

/** Core RPC filter field → metadata key emitted by /documents/{id}/metadata. */
const CORE_FIELD_TO_METADATA_KEY: Record<string, string> = {
  jurisdiction: "country", // conversion.py:30 — country = judgments.jurisdiction
  decision_date: "date_issued", // conversion.py:33 — date_issued = decision_date
};

function metadataKeyFor(field: string): string {
  return CORE_FIELD_TO_METADATA_KEY[field] ?? `base_${field}`;
}

function toIsoDay(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length < 10) return undefined;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

function matches(filterValue: unknown, actual: unknown): boolean {
  if (actual === undefined || actual === null) return false;

  if (Array.isArray(filterValue)) {
    // IN-list / array overlap (case-sensitive like the RPC)
    const wanted = new Set(filterValue.map(String));
    return asStringArray(actual).some((v) => wanted.has(v));
  }
  if (typeof filterValue === "boolean") return actual === filterValue;
  if (typeof filterValue === "number") return Number(actual) === filterValue;
  if (typeof filterValue === "string") {
    const day = toIsoDay(actual);
    if (/^\d{4}-\d{2}-\d{2}$/.test(filterValue) && day) return day === filterValue;
    return String(actual).toLowerCase().includes(filterValue.toLowerCase()); // ILIKE
  }
  if (typeof filterValue === "object") {
    const f = filterValue as { min?: number; max?: number; from?: string; to?: string };
    if ("from" in f || "to" in f) {
      const day = toIsoDay(actual);
      if (!day) return false;
      return (!f.from || day >= f.from) && (!f.to || day <= f.to);
    }
    const n = Number(actual);
    if (!Number.isFinite(n)) return false;
    return (f.min === undefined || n >= f.min) && (f.max === undefined || n <= f.max);
  }
  return false;
}

export function matchedMetadataKeys(
  filters: BaseSchemaFilters,
  metadata: Record<string, unknown>,
): Set<string> {
  const hits = new Set<string>();
  for (const [field, filterValue] of Object.entries(filters)) {
    if (filterValue === undefined || filterValue === null) continue;
    const key = metadataKeyFor(field);
    if (matches(filterValue, metadata[key])) hits.add(key);
  }
  return hits;
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx jest __tests__/lib/extractions/filter-match.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/extractions/filter-match.ts frontend/__tests__/lib/extractions/filter-match.test.ts
git commit -m "feat(documents): matchedMetadataKeys mirrors RPC filter semantics"
```

---

### Task 10: Highlight matched base fields on `/documents/[id]`

**Files:**
- Modify: `frontend/lib/styles/components/key-information.tsx` (props `highlightKeys`, `id`; `FieldCell` `matched`)
- Modify: `frontend/app/documents/[id]/_components/DocumentPageClient.tsx:145-160`
- Create: `frontend/__tests__/lib/styles/key-information-highlight.test.tsx`

Design note: the page has no tab bar today (single column, `DocumentPageClient.tsx:130-200`); the existing "Extracted Schema Fields" `KeyInformation` grid already renders every `base_*` key. We add highlighting + an anchor + a caption to that grid rather than introducing a tab layer — spec AC2's "zakładka" is satisfied by a dedicated, deep-linkable section; a real tab bar is a UI decision for a separate issue.

**Interfaces:**
- Consumes: `matchedMetadataKeys`, `decodeFilters`, `BASE_FIELDS_ANCHOR`.
- Produces: `KeyInformationProps.highlightKeys?: ReadonlySet<string>`, `KeyInformationProps.id?: string`, `KeyInformationProps.highlightCaption?: string`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";

import { KeyInformation } from "@/lib/styles/components/key-information";

describe("KeyInformation highlight", () => {
  const metadata = {
    document_id: "d1",
    document_type: "judgment",
    language: "en",
    country: "UK",
    base_offender_gender: ["gender_female"],
    base_num_victims: 2,
  };

  it("marks highlighted cells and renders the caption + anchor", () => {
    render(
      <KeyInformation
        metadata={metadata}
        layout="grid"
        showAll
        title="Extracted Schema Fields"
        id="base-fields"
        highlightKeys={new Set(["base_offender_gender", "country"])}
        highlightCaption="2 fields matched your filter"
      />,
    );
    expect(document.getElementById("base-fields")).not.toBeNull();
    expect(screen.getByText("2 fields matched your filter")).toBeInTheDocument();
    const matched = document.querySelectorAll('[data-matched="true"]');
    expect(matched).toHaveLength(2);
    expect(document.querySelectorAll('[data-matched="false"]').length).toBeGreaterThan(0);
  });

  it("renders unchanged when highlightKeys is absent", () => {
    render(<KeyInformation metadata={metadata} layout="grid" showAll />);
    expect(document.querySelectorAll('[data-matched="true"]')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest __tests__/lib/styles/key-information-highlight.test.tsx
```
Expected: FAIL — unknown props / no `data-matched`.

- [ ] **Step 3: Implement in `key-information.tsx`**

- Add to `KeyInformationProps`:

```ts
  /** DOM id for deep links (e.g. "base-fields"). */
  id?: string;
  /** Metadata keys to visually emphasise (came from a matching search filter). */
  highlightKeys?: ReadonlySet<string>;
  /** Small caption under the title explaining the highlight, e.g. "3 fields matched your filter". */
  highlightCaption?: string;
```

- `FieldCell` gets `matched: boolean`; root `div` adds `data-matched={matched ? "true" : "false"}` and, when matched, the classes `border-[color:var(--gold)] bg-[color:var(--gold-soft)]/40 ring-1 ring-[color:var(--gold)]` (PWr sand/gold tokens — see `docs/reference/DESIGN.md`).
- `KeyInformation` destructures `id, highlightKeys, highlightCaption`, sets `id={id}` on the `<section>`, renders `{highlightCaption && <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-[color:var(--gold)]">{highlightCaption}</p>}` after the title row, and passes `matched={highlightKeys?.has(field.key) ?? false}`.

- [ ] **Step 4: Wire the document page**

In `DocumentPageClient.tsx`:

```tsx
import { decodeFilters } from "@/lib/extractions/use-extracted-data-filters";
import { matchedMetadataKeys } from "@/lib/extractions/filter-match";
import { BASE_FIELDS_ANCHOR } from "@/lib/extractions/document-href";
// ...
  const filtersFromSearch = useMemo(() => decodeFilters(searchParams.get("f")), [searchParams]);
  const highlightKeys = useMemo(
    () => (metadata ? matchedMetadataKeys(filtersFromSearch, metadata as Record<string, unknown>) : new Set<string>()),
    [filtersFromSearch, metadata],
  );
```

(place these hooks **above** the early `if (loading)` return so hook order is stable), and change the grid to

```tsx
                  <KeyInformation
                    metadata={metadata}
                    layout="grid"
                    showAll
                    title="Extracted Schema Fields"
                    id={BASE_FIELDS_ANCHOR}
                    highlightKeys={highlightKeys}
                    highlightCaption={
                      highlightKeys.size > 0
                        ? `${highlightKeys.size} field${highlightKeys.size === 1 ? "" : "s"} matched your filter`
                        : undefined
                    }
                  />
```

Also change the breadcrumb's first item to `{ label: 'Search', href: searchParams.get("f") ? `/search/extractions?f=${searchParams.get("f")}` : '/search' }` so "back" returns to the filtered list.

- [ ] **Step 5: Run tests + validate**

```bash
cd frontend && npx jest __tests__/lib/styles && npm run validate
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/styles/components/key-information.tsx frontend/app/documents/\[id\]/_components/DocumentPageClient.tsx frontend/__tests__/lib/styles/key-information-highlight.test.tsx
git commit -m "feat(documents): highlight base fields that matched the extraction filter"
```

---

### Task 11: Backend `collect_filter_ids()` — page the RPC for ids only

**Files:**
- Create: `backend/app/extraction_domain/filter_ids.py`
- Create: `backend/tests/app/test_filter_ids.py`

**Interfaces:**
- Produces:

```python
SAVE_FROM_FILTER_MAX_DOCUMENTS: int = int(os.getenv("SAVE_FROM_FILTER_MAX_DOCUMENTS", "5000"))
FILTER_IDS_PAGE_SIZE = 500

class FilterTooLargeError(Exception):
    def __init__(self, total: int, cap: int): ...

@dataclass(frozen=True)
class FilterIdsResult:
    ids: list[str]
    total: int

def collect_filter_ids(client, filters: dict[str, Any], text_query: str | None, *, cap: int = SAVE_FROM_FILTER_MAX_DOCUMENTS, page_size: int = FILTER_IDS_PAGE_SIZE) -> FilterIdsResult
```
`client` is any object with `.rpc(name, params).execute()` returning `.data: list[dict]` (the supabase client shape used in `results_router.py:482-490`).

- [ ] **Step 1: Write the failing tests**

```python
"""collect_filter_ids pages filter_documents_by_extracted_data and returns ids."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.extraction_domain.filter_ids import (
    FilterIdsResult,
    FilterTooLargeError,
    collect_filter_ids,
)

pytestmark = pytest.mark.unit


class _FakeRpc:
    def __init__(self, total: int):
        self.total = total
        self.calls: list[dict] = []

    def rpc(self, name: str, params: dict):
        assert name == "filter_documents_by_extracted_data"
        self.calls.append(params)
        offset, limit = params["p_offset"], params["p_limit"]
        rows = [
            {"id": f"id-{i}", "total_count": self.total, "extracted_data": {"x": 1}}
            for i in range(offset, min(offset + limit, self.total))
        ]
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=rows))


def test_returns_all_ids_across_pages_and_reports_total():
    client = _FakeRpc(total=1201)
    result = collect_filter_ids(client, {"jurisdiction": ["PL"]}, None, cap=5000, page_size=500)
    assert isinstance(result, FilterIdsResult)
    assert result.total == 1201
    assert result.ids == [f"id-{i}" for i in range(1201)]
    # probe (limit 1) + 3 pages
    assert [c["p_limit"] for c in client.calls] == [1, 500, 500, 500]
    assert all(c["p_filters"] == {"jurisdiction": ["PL"]} for c in client.calls)


def test_zero_results_short_circuits_after_probe():
    client = _FakeRpc(total=0)
    result = collect_filter_ids(client, {}, "nothing", cap=5000)
    assert result == FilterIdsResult(ids=[], total=0)
    assert len(client.calls) == 1


def test_raises_when_total_exceeds_cap_without_paging():
    client = _FakeRpc(total=5001)
    with pytest.raises(FilterTooLargeError) as exc:
        collect_filter_ids(client, {}, None, cap=5000)
    assert exc.value.total == 5001 and exc.value.cap == 5000
    assert len(client.calls) == 1


def test_passes_text_query_through():
    client = _FakeRpc(total=1)
    collect_filter_ids(client, {}, "knife", cap=5000)
    assert client.calls[0]["p_text_query"] == "knife"
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_filter_ids.py -q
```
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
"""Resolve a base-schema filter to judgment ids, server-side.

Used by ``POST /collections/from-filter``: the browser sends the same
``{filters, text_query}`` it uses for ``/extractions/base-schema/filter``; we
page ``filter_documents_by_extracted_data`` here instead of making the client
do 25 list fetches + 50 batch POSTs (HTTP batch cap is 100 ids, issue #166).

The RPC returns ``extracted_data`` per row (unused here) — ~10-20 MB for 5 000
rows. Acceptable for v1; an ids-only RPC is the documented follow-up.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from loguru import logger

SAVE_FROM_FILTER_MAX_DOCUMENTS: int = int(
    os.getenv("SAVE_FROM_FILTER_MAX_DOCUMENTS", "5000")
)
FILTER_IDS_PAGE_SIZE = 500
_RPC = "filter_documents_by_extracted_data"


class FilterTooLargeError(Exception):
    """The filter matches more rows than a collection may hold."""

    def __init__(self, total: int, cap: int) -> None:
        super().__init__(f"filter matches {total} documents; cap is {cap}")
        self.total = total
        self.cap = cap


@dataclass(frozen=True)
class FilterIdsResult:
    ids: list[str]
    total: int


def _page(client: Any, filters: dict[str, Any], text_query: str | None, limit: int, offset: int) -> list[dict]:
    response = client.rpc(
        _RPC,
        {"p_filters": filters, "p_text_query": text_query, "p_limit": limit, "p_offset": offset},
    ).execute()
    return list(response.data or [])


def collect_filter_ids(
    client: Any,
    filters: dict[str, Any],
    text_query: str | None,
    *,
    cap: int = SAVE_FROM_FILTER_MAX_DOCUMENTS,
    page_size: int = FILTER_IDS_PAGE_SIZE,
) -> FilterIdsResult:
    """Return every matching judgment id (ordered as the RPC orders them) and the total."""
    probe = _page(client, filters, text_query, limit=1, offset=0)
    total = int(probe[0].get("total_count", 0)) if probe else 0
    if total == 0:
        return FilterIdsResult(ids=[], total=0)
    if total > cap:
        raise FilterTooLargeError(total=total, cap=cap)

    ids: list[str] = []
    offset = 0
    while offset < total:
        rows = _page(client, filters, text_query, limit=page_size, offset=offset)
        if not rows:
            break
        ids.extend(str(row["id"]) for row in rows)
        offset += page_size
    logger.info("collect_filter_ids: {} of {} ids collected", len(ids), total)
    return FilterIdsResult(ids=ids, total=total)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && poetry run pytest tests/app/test_filter_ids.py -q && poetry run ruff check app/extraction_domain/filter_ids.py
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/extraction_domain/filter_ids.py backend/tests/app/test_filter_ids.py
git commit -m "feat(collections): collect_filter_ids pages the base-schema RPC server-side"
```

---

### Task 12: `POST /collections/from-filter`

**Files:**
- Modify: `backend/app/collections.py` (new models + route, placed **before** `@router.get("/{collection_id}")`)
- Create: `backend/tests/app/test_collections_from_filter.py`

**Interfaces:**
- Produces: request `CreateCollectionFromFilterRequest { name: str (1..255), description: str | None (≤1000), filters: dict[str, Any] = {}, text_query: str | None }`; response `CollectionFromFilterResponse { collection: Collection, added_count: int, total_matched: int }`. Errors: **400** `{"error":"Empty Result","code":"FILTER_EMPTY"}` when 0 matches; **413** `{"error":"Too Many Documents","code":"FILTER_TOO_LARGE","total": n, "cap": 5000}`; **503** `DATABASE_UNAVAILABLE` when the supabase client is missing.
- Consumes: `collect_filter_ids`, `SAVE_FROM_FILTER_MAX_DOCUMENTS`, `FilterTooLargeError` (Task 11); `get_collections_db().create_collection/bulk_add_documents`; `app.extraction_domain.shared.supabase`.

- [ ] **Step 1: Write the failing tests**

```python
"""POST /collections/from-filter — save a base-schema filter result as a collection.

Same stub style as test_collections_batch_cap.py; collect_filter_ids is
monkeypatched so no RPC is touched.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from juddges_search.db.supabase_db import get_collections_db

import app.collections as collections_module
from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.extraction_domain.filter_ids import FilterIdsResult, FilterTooLargeError
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.collections]

_HEADERS = {"X-API-Key": "test-api-key-12345"}
_COLLECTION_ID = "00000000-0000-4000-a000-000000000001"


class _StubDb:
    def __init__(self):
        self.bulk_calls: list[list[str]] = []
        self.created: dict | None = None

    async def create_collection(self, user_id, name, description=None):
        self.created = {
            "id": _COLLECTION_ID, "user_id": user_id, "name": name,
            "description": description, "created_at": "2026-09-20T00:00:00Z",
            "updated_at": "2026-09-20T00:00:00Z",
        }
        return self.created

    async def bulk_add_documents(self, collection_id, judgment_ids, user_id):
        self.bulk_calls.append(list(judgment_ids))
        return {"added": list(judgment_ids), "failed": []}


@pytest.fixture
def stub_db():
    return _StubDb()


@pytest.fixture
def override_deps(stub_db, monkeypatch):
    user = AuthenticatedUser(
        user_data={"id": "00000000-0000-4000-a000-000000000abc", "email": "x@example.com", "role": "authenticated"},
        access_token="fake",
    )

    async def _user():
        return user

    async def _db():
        return stub_db

    app.dependency_overrides[jwt_get_current_user] = _user
    app.dependency_overrides[get_collections_db] = _db
    monkeypatch.setattr(collections_module, "supabase", object())  # "available"
    try:
        yield user
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)
        app.dependency_overrides.pop(get_collections_db, None)


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


def _ids(n: int) -> list[str]:
    return [f"00000000-0000-4000-a000-{i:012x}" for i in range(n)]


async def test_creates_collection_and_bulk_adds_in_chunks(client, override_deps, stub_db, monkeypatch):
    monkeypatch.setattr(
        collections_module, "collect_filter_ids",
        lambda *_a, **_k: FilterIdsResult(ids=_ids(2500), total=2500),
    )
    resp = await client.post(
        "/collections/from-filter",
        json={"name": "kobiety skazane za oszustwo, PL i UK, 2015–2024",
              "filters": {"jurisdiction": ["PL", "UK"]}, "text_query": None},
        headers=_HEADERS,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["collection"]["id"] == _COLLECTION_ID
    assert body["added_count"] == 2500 and body["total_matched"] == 2500
    assert [len(c) for c in stub_db.bulk_calls] == [1000, 1000, 500]
    assert stub_db.created["name"].startswith("kobiety")


async def test_empty_result_is_400_and_creates_nothing(client, override_deps, stub_db, monkeypatch):
    monkeypatch.setattr(
        collections_module, "collect_filter_ids",
        lambda *_a, **_k: FilterIdsResult(ids=[], total=0),
    )
    resp = await client.post("/collections/from-filter", json={"name": "x", "filters": {}}, headers=_HEADERS)
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "FILTER_EMPTY"
    assert stub_db.created is None


async def test_too_large_is_413_with_total_and_cap(client, override_deps, stub_db, monkeypatch):
    def _raise(*_a, **_k):
        raise FilterTooLargeError(total=7321, cap=5000)

    monkeypatch.setattr(collections_module, "collect_filter_ids", _raise)
    resp = await client.post("/collections/from-filter", json={"name": "x", "filters": {}}, headers=_HEADERS)
    assert resp.status_code == 413
    detail = resp.json()["detail"]
    assert detail["code"] == "FILTER_TOO_LARGE" and detail["total"] == 7321 and detail["cap"] == 5000
    assert stub_db.created is None


async def test_name_is_required_and_bounded(client, override_deps):
    resp = await client.post("/collections/from-filter", json={"name": "", "filters": {}}, headers=_HEADERS)
    assert resp.status_code == 422
    resp = await client.post("/collections/from-filter", json={"name": "a" * 256, "filters": {}}, headers=_HEADERS)
    assert resp.status_code == 422


async def test_batch_cap_of_100_on_documents_batch_is_untouched(client, override_deps):
    """Guard: from-filter must not have loosened AddDocumentsRequest (#166)."""
    resp = await client.post(
        f"/collections/{_COLLECTION_ID}/documents/batch",
        json={"document_ids": _ids(101)}, headers=_HEADERS,
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && poetry run pytest tests/app/test_collections_from_filter.py -q
```
Expected: FAIL — 404/405 for `/collections/from-filter`, `AttributeError: module has no attribute 'collect_filter_ids'`.

- [ ] **Step 3: Implement in `collections.py`**

Imports (top of file):

```python
from typing import Any

from fastapi import status

from app.extraction_domain.filter_ids import (
    SAVE_FROM_FILTER_MAX_DOCUMENTS,
    FilterTooLargeError,
    collect_filter_ids,
)
from app.extraction_domain.shared import supabase
```

Models (after `UpdateCollectionRequest`):

```python
class CreateCollectionFromFilterRequest(BaseModel):
    """Save every judgment matching a base-schema filter as a new collection."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    filters: dict[str, Any] = Field(
        default_factory=dict,
        description="Same JSONB shape as POST /extractions/base-schema/filter `filters`",
    )
    text_query: str | None = Field(default=None, max_length=1000)


class CollectionFromFilterResponse(BaseModel):
    collection: Collection
    added_count: int
    total_matched: int


_BULK_ADD_CHUNK = 1000
```

Route (immediately after `create_collection`, before the `/{collection_id}` GET):

```python
@router.post(
    "/from-filter",
    response_model=CollectionFromFilterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a collection from a base-schema filter result",
)
async def create_collection_from_filter(
    request: CreateCollectionFromFilterRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_collections_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Resolve the filter server-side (pages of 500) and bulk-insert the ids.

    Bypasses the 100-id cap of ``POST /{id}/documents/batch`` on purpose: that
    cap protects a browser-driven endpoint; here the server owns the loop.
    Cap: ``SAVE_FROM_FILTER_MAX_DOCUMENTS`` (5 000) → 413 above it, 400 on 0.
    """
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail={"error": "Database Unavailable", "message": "Database connection not available.", "code": "DATABASE_UNAVAILABLE"},
        )
    try:
        resolved = collect_filter_ids(supabase, request.filters, request.text_query)
    except FilterTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={
                "error": "Too Many Documents",
                "message": f"The filter matches {exc.total} judgments; a collection may hold at most {exc.cap}. Narrow the filter.",
                "code": "FILTER_TOO_LARGE",
                "total": exc.total,
                "cap": exc.cap,
            },
        ) from exc
    if resolved.total == 0:
        raise HTTPException(
            status_code=400,
            detail={"error": "Empty Result", "message": "The filter matches no judgments.", "code": "FILTER_EMPTY"},
        )

    collection = await db.create_collection(user.id, request.name, request.description)
    log_audit_background(
        background_tasks, user_id=user.id, action_type="collection_created",
        resource_type="collection", resource_id=collection["id"],
    )

    added_count = 0
    for start in range(0, len(resolved.ids), _BULK_ADD_CHUNK):
        chunk = resolved.ids[start : start + _BULK_ADD_CHUNK]
        result = await db.bulk_add_documents(collection["id"], chunk, user.id)
        added_count += len(result["added"])

    log_audit_background(
        background_tasks, user_id=user.id, action_type="collection_document_added",
        input_data={"source": "base_schema_filter", "count": added_count, "filters": request.filters},
        resource_type="collection", resource_id=collection["id"],
    )
    logger.info("from-filter: collection {} created with {} of {} judgments", collection["id"], added_count, resolved.total)
    return CollectionFromFilterResponse(
        collection=Collection(**collection), added_count=added_count, total_matched=resolved.total
    )
```

(If `status.HTTP_413_CONTENT_TOO_LARGE` is not available in the installed Starlette, use `status.HTTP_413_REQUEST_ENTITY_TOO_LARGE`.)

- [ ] **Step 4: Run tests + full unit suite for collections**

```bash
cd backend && poetry run pytest tests/app/test_collections_from_filter.py tests/app/test_collections_batch_cap.py tests/app/test_base_schema_route_regressions.py -q && poetry run poe check
```
Expected: PASS; ruff clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/collections.py backend/tests/app/test_collections_from_filter.py
git commit -m "feat(collections): POST /collections/from-filter saves a base-schema filter result (cap 5000)"
```

---

### Task 13: Next.js proxy + client for `from-filter`

**Files:**
- Create: `frontend/app/api/collections/from-filter/route.ts`
- Modify: `frontend/lib/api/collections.ts` (append `createCollectionFromFilter`)
- Modify: `frontend/types/base-schema-filter.ts` (request/response types)
- Create: `frontend/tests/unit/api/collections/from-filter.route.test.ts`

**Interfaces:**
- Produces: `POST /api/collections/from-filter` (auth via Supabase session, forwards `Authorization: Bearer` + `X-API-Key`, mirrors backend status codes, returns `{error, code, total?, cap?}` on failure); `createCollectionFromFilter(req: CreateCollectionFromFilterRequest): Promise<CollectionFromFilterResponse>` throwing `CollectionFromFilterError { code, total?, cap? }`.

- [ ] **Step 1: Write the failing test**

```ts
/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: mockGetUser, getSession: mockGetSession } })),
}));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  logger: { error: jest.fn(), info: jest.fn() },
  default: { child: jest.fn(() => ({ error: jest.fn(), info: jest.fn() })) },
}));

global.fetch = jest.fn();

import { POST } from "@/app/api/collections/from-filter/route";

const body = { name: "fraud PL 2015–2024", filters: { jurisdiction: ["PL"] }, text_query: null };

function req() {
  return new NextRequest("http://localhost:3026/api/collections/from-filter", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/collections/from-filter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend.test";
    process.env.BACKEND_API_KEY = "k";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  });

  it("401s without a session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(req())).status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards to the backend with bearer + api key and returns 201 body", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ collection: { id: "c1" }, added_count: 3, total_matched: 3 }),
    });
    const res = await POST(req());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ collection: { id: "c1" }, added_count: 3, total_matched: 3 });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/collections/from-filter");
    expect(init.headers.Authorization).toBe("Bearer jwt");
    expect(init.headers["X-API-Key"]).toBe("k");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("mirrors 413 with total and cap", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false, status: 413,
      json: async () => ({ detail: { error: "Too Many Documents", code: "FILTER_TOO_LARGE", total: 7321, cap: 5000, message: "…" } }),
    });
    const res = await POST(req());
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual(expect.objectContaining({ code: "FILTER_TOO_LARGE", total: 7321, cap: 5000 }));
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest tests/unit/api/collections/from-filter.route.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```ts
import { NextRequest, NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * POST /api/collections/from-filter — proxy for the backend endpoint that
 * saves a base-schema filter result as a collection (server-side paging,
 * cap 5 000). Mirrors backend status codes so the dialog can explain 413/400.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const response = await fetch(`${API_BASE_URL}/collections/from-filter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData?.detail ?? {};
      logger.error(`from-filter backend error ${response.status}`, detail);
      return NextResponse.json(
        {
          error: detail.message || detail.error || "Failed to save collection",
          code: detail.code || "COLLECTION_FROM_FILTER_FAILED",
          ...(typeof detail.total === "number" ? { total: detail.total } : {}),
          ...(typeof detail.cap === "number" ? { cap: detail.cap } : {}),
        },
        { status: response.status },
      );
    }
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    logger.error("Error in POST /api/collections/from-filter", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Types + client**

In `frontend/types/base-schema-filter.ts` append:

```ts
// -----------------------------------------------------------------------------
// Save-as-collection (POST /api/collections/from-filter).
// -----------------------------------------------------------------------------

export interface CreateCollectionFromFilterRequest {
  name: string;
  description?: string;
  filters: BaseSchemaFilters;
  text_query?: string | null;
}

export interface CollectionFromFilterResponse {
  collection: { id: string; user_id: string; name: string; description?: string | null; created_at: string; updated_at: string };
  added_count: number;
  total_matched: number;
}

/** Max documents a filter may match to be saved (mirrors backend SAVE_FROM_FILTER_MAX_DOCUMENTS). */
export const SAVE_FROM_FILTER_MAX_DOCUMENTS = 5000;
```

In `frontend/lib/api/collections.ts` append:

```ts
import type {
  CollectionFromFilterResponse,
  CreateCollectionFromFilterRequest,
} from "@/types/base-schema-filter";

export class CollectionFromFilterError extends Error {
  constructor(message: string, public readonly code: string, public readonly total?: number, public readonly cap?: number) {
    super(message);
    this.name = "CollectionFromFilterError";
  }
}

export async function createCollectionFromFilter(
  request: CreateCollectionFromFilterRequest,
): Promise<CollectionFromFilterResponse> {
  const response = await fetch("/api/collections/from-filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new CollectionFromFilterError(
      data.error || "Failed to save collection", data.code || "COLLECTION_FROM_FILTER_FAILED", data.total, data.cap,
    );
  }
  const result = (await response.json()) as CollectionFromFilterResponse;
  track("collection_created", { collection_id: result.collection.id, source: "extractions_filter", count: result.added_count });
  return result;
}
```

- [ ] **Step 5: Run tests + validate**

```bash
cd frontend && npx jest tests/unit/api/collections && npm run validate
```
Expected: PASS. (The route-reachability test only scans `app/**/page.tsx`, so an API route needs no allow-list entry.)

- [ ] **Step 6: Commit**

```bash
git add frontend/app/api/collections/from-filter/route.ts frontend/lib/api/collections.ts frontend/types/base-schema-filter.ts frontend/tests/unit/api/collections/from-filter.route.test.ts
git commit -m "feat(collections): /api/collections/from-filter proxy and client"
```

---

### Task 14: `SaveAsCollectionDialog` on `/search/extractions`

**Files:**
- Create: `frontend/components/search/SaveAsCollectionDialog.tsx`
- Create: `frontend/__tests__/components/search/SaveAsCollectionDialog.test.tsx`
- Modify: `frontend/app/search/extractions/page.tsx` (results bar)

**Interfaces:**
- Consumes: `createCollectionFromFilter`, `CollectionFromFilterError`, `SAVE_FROM_FILTER_MAX_DOCUMENTS`, `useRouter`.
- Produces: `<SaveAsCollectionDialog filters textQuery total defaultName disabled? />` — on success `router.push(`/collections/${id}`)`.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const createCollectionFromFilter = jest.fn();
jest.mock("@/lib/api/collections", () => ({
  createCollectionFromFilter: (...a: unknown[]) => createCollectionFromFilter(...a),
  CollectionFromFilterError: class extends Error {
    constructor(m: string, public code: string, public total?: number, public cap?: number) { super(m); }
  },
}));

import { SaveAsCollectionDialog } from "@/components/search/SaveAsCollectionDialog";

const filters = { jurisdiction: ["PL", "UK"] as ("PL" | "UK")[] };

describe("SaveAsCollectionDialog", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is disabled with an explanation when there are no results", () => {
    render(<SaveAsCollectionDialog filters={{}} textQuery="" total={0} defaultName="" />);
    const btn = screen.getByRole("button", { name: /save as collection/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", expect.stringMatching(/no results/i));
  });

  it("is disabled above the cap and says so", () => {
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={5001} defaultName="" />);
    const btn = screen.getByRole("button", { name: /save as collection/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", expect.stringMatching(/5,001.*5,000/));
  });

  it("prefills the name with the question, lets the user edit it, saves and redirects", async () => {
    createCollectionFromFilter.mockResolvedValue({
      collection: { id: "c9" }, added_count: 42, total_matched: 42,
    });
    render(
      <SaveAsCollectionDialog filters={filters} textQuery="fraud" total={42}
        defaultName="kobiety skazane za oszustwo, PL i UK, 2015–2024" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    const input = screen.getByLabelText(/collection name/i) as HTMLInputElement;
    expect(input.value).toBe("kobiety skazane za oszustwo, PL i UK, 2015–2024");
    fireEvent.change(input, { target: { value: "Fraud PL+UK 2015–2024" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/c9"));
    expect(createCollectionFromFilter).toHaveBeenCalledWith({
      name: "Fraud PL+UK 2015–2024", filters, text_query: "fraud",
      description: "Saved from /search/extractions (42 judgments).",
    });
  });

  it("shows the backend message on failure and stays open", async () => {
    const { CollectionFromFilterError } = jest.requireMock("@/lib/api/collections");
    createCollectionFromFilter.mockRejectedValue(new CollectionFromFilterError("too big", "FILTER_TOO_LARGE", 7000, 5000));
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={10} defaultName="q" />);
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too big/);
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx jest __tests__/components/search/SaveAsCollectionDialog.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CollectionFromFilterError, createCollectionFromFilter } from "@/lib/api/collections";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";
import { SAVE_FROM_FILTER_MAX_DOCUMENTS } from "@/types/base-schema-filter";

interface SaveAsCollectionDialogProps {
  filters: BaseSchemaFilters;
  textQuery: string;
  /** total_count of the current result set (drives enable/disable + copy). */
  total: number;
  /** Default collection name — the NL question when there is one. */
  defaultName: string;
  disabled?: boolean;
}

function fallbackName(total: number): string {
  return `Extracted-data search — ${new Date().toISOString().slice(0, 10)} (${total.toLocaleString()} judgments)`;
}

export function SaveAsCollectionDialog({ filters, textQuery, total, defaultName, disabled }: SaveAsCollectionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooMany = total > SAVE_FROM_FILTER_MAX_DOCUMENTS;
  const empty = total === 0;
  const blockedReason = empty
    ? "No results to save."
    : tooMany
      ? `${total.toLocaleString()} judgments exceed the ${SAVE_FROM_FILTER_MAX_DOCUMENTS.toLocaleString()} limit — narrow the filter.`
      : undefined;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setName((defaultName.trim() || fallbackName(total)).slice(0, 255));
      setError(null);
    }
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createCollectionFromFilter({
        name: trimmed,
        description: `Saved from /search/extractions (${total.toLocaleString()} judgments).`,
        filters,
        text_query: textQuery.trim() === "" ? null : textQuery.trim(),
      });
      router.push(`/collections/${result.collection.id}`);
    } catch (e) {
      setError(e instanceof CollectionFromFilterError || e instanceof Error ? e.message : "Could not save the collection.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={disabled || Boolean(blockedReason)} title={blockedReason}>
          Save as collection
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save {total.toLocaleString()} judgments as a collection</DialogTitle>
          <DialogDescription>
            Every judgment matching the current filters is added. You can extract, sample and export from the collection page.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="save-collection-name" className="text-sm font-medium">Collection name</label>
        <Input id="save-collection-name" value={name} maxLength={255} onChange={(e) => setName(e.target.value)} disabled={saving} />
        {error && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving || name.trim() === ""}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SaveAsCollectionDialog;
```

- [ ] **Step 4: Wire into the results bar in `page.tsx`**

Inside the sticky results bar `div.flex.items-center.justify-between`, after the `<p>` add:

```tsx
          <div className="flex items-center gap-2">
            <SaveAsCollectionDialog
              filters={filters}
              textQuery={textQuery}
              total={total}
              defaultName={nlQuestion}
              disabled={isLoading || Boolean(error)}
            />
            {error && (
              <Button variant="ghost" size="sm" onClick={() => clearAll()}>Reset</Button>
            )}
          </div>
```

(and remove the old standalone `{error && <Button …>Reset</Button>}`).

- [ ] **Step 5: Run tests + validate**

```bash
cd frontend && npx jest __tests__/components/search __tests__/app/search && npm run validate
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/search/SaveAsCollectionDialog.tsx frontend/__tests__/components/search/SaveAsCollectionDialog.test.tsx frontend/app/search/extractions/page.tsx
git commit -m "feat(extractions-search): save the filtered result set as a collection"
```

---

### Task 15: Docs + full regression + local E2E sanity

**Files:**
- Create: `docs/how-to/save-extraction-filter-as-collection.md`
- Create: `docs/reference/base-schema-filter-api.md`
- Modify: `frontend/tests/e2e/search/extractions.spec.ts` (one scenario; **not in CI**, #583)

- [ ] **Step 1: How-to**

`docs/how-to/save-extraction-filter-as-collection.md`:

```markdown
# How to turn a research question into a collection

1. Open `/search/extractions` and click **Describe your search**.
2. Type the question in Polish or English, e.g. „kobiety skazane za oszustwo z wyrokiem w zawieszeniu, PL i UK, 2015–2024".
3. Review the translated filters (jurisdiction and decision date appear under **Scope**; everything else as chips) and click **Apply to form**. Nothing runs until you do.
4. Adjust chips (×) or the Scope/Quick controls. The URL (`?f=…&nl=…`) is shareable and reproduces the same result set.
5. Click **Save as collection** in the results bar. The name defaults to your question; edit it and press **Save**.
   - Disabled at 0 results or above 5 000 (narrow the filter).
6. You land on `/collections/{id}` with every matching judgment attached. Extraction jobs accept at most 1 000 documents (`MAX_DOCUMENTS_PER_JOB`), so a large collection is extracted in several jobs.

Clicking a result opens `/documents/{id}#base-fields` with the base-schema cells that satisfied your filter highlighted in gold.

Not available as filters yet: `case_type`, `court_level` (data defect, see `docs/reference/APP_STATUS_2026-08-21.md` §4).
```

- [ ] **Step 2: Reference**

`docs/reference/base-schema-filter-api.md`:

```markdown
# Base-schema filter API (reference)

## RPC `public.filter_documents_by_extracted_data(p_filters JSONB, p_text_query TEXT, p_limit INT, p_offset INT)`

Signature is a wire contract (PostgREST matches by name; pinned in `backend/tests/db/test_migration_chain.py`). All filters travel in `p_filters`.

| Key | Type | Semantics | Since |
|---|---|---|---|
| `jurisdiction` | `["PL" \| "UK", …]` | `judgments.jurisdiction = ANY(...)` | 20260920000001 |
| `decision_date` | `{"from","to"}` / `{"min","max"}` / `"YYYY-MM-DD"` | inclusive range / equality on `judgments.decision_date` | 20260920000001 |
| 42 `base_*` keys | see `frontend/lib/extractions/base-schema-filter-config.ts` | unchanged | 20260226000001, 20260505000001 |

Rows returned: `id, case_number, title, jurisdiction, decision_date, extracted_data, total_count`.

## `POST /extractions/base-schema/nl-filter`
Body `{query}` → `{filters, text_query}`. Model: `BaseSchemaFilter` (`backend/app/extraction_domain/nl_filter_generator.py`). `case_type`, `court_level` are deliberately absent (`NL_EXCLUDED_CORE_FIELDS`).

## `POST /collections/from-filter`
Body `{name (1–255), description?, filters, text_query?}` → `201 {collection, added_count, total_matched}`.
Errors: `400 FILTER_EMPTY`, `413 FILTER_TOO_LARGE {total, cap}`, `503 DATABASE_UNAVAILABLE`. Cap `SAVE_FROM_FILTER_MAX_DOCUMENTS` (env, default 5000). Server pages the RPC in 500s and upserts `collection_judgments` in chunks of 1000. The 100-id cap on `POST /collections/{id}/documents/batch` is unchanged.

## Frontend URL state (`/search/extractions`)
`?f=<base64url JSON of BaseSchemaFilters>` · `?q=<text_query>` · `?page=<n>` · `?nl=<original question>`. Result rows link to `/documents/{id}?f=<same blob>#base-fields`.
```

- [ ] **Step 3: Local-only E2E scenario** (append to `frontend/tests/e2e/search/extractions.spec.ts`, reusing its `FILTER_API` mocking style)

```ts
test('scope chips and save-as-collection gate (local only, #583)', async ({ page }) => {
  await page.route('**/api/extractions/base-schema/filter', (route) =>
    route.fulfill({ json: { documents: [], total_count: 0, limit: 25, offset: 0, has_more: false } }),
  );
  const blob = Buffer.from(JSON.stringify({ jurisdiction: ['PL'], decision_date: { from: '2015-01-01' } })).toString('base64url');
  await page.goto(`/search/extractions?f=${blob}&nl=test%20question`);
  await expect(page.getByText('Jurisdiction:')).toBeVisible();
  await expect(page.getByText('Decision date:')).toBeVisible();
  await expect(page.getByRole('button', { name: /save as collection/i })).toBeDisabled();
});
```

- [ ] **Step 4: Full regression**

```bash
cd backend && poetry run poe check-all
cd ../frontend && npm run validate && npm test -- --silent
# Database Contract (throwaway Postgres as in Task 3):
docker run -d --rm --name juddges-dbc -e POSTGRES_PASSWORD=postgres -p 55432:5432 pgvector/pgvector:pg17 && sleep 5
cd ../backend && DB_CONTRACT_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres poetry run pytest -m db -q; docker stop juddges-dbc
```
Expected: all green, including `tests/app/test_base_schema_route_regressions.py` and `tests/app/test_collections_batch_cap.py`.

- [ ] **Step 5: Commit, push, PR**

```bash
git add docs/how-to/save-extraction-filter-as-collection.md docs/reference/base-schema-filter-api.md frontend/tests/e2e/search/extractions.spec.ts
git commit -m "docs: NL filter → collection how-to and base-schema filter API reference"
git push -u origin feat/nl-filter-to-collection
gh pr create --base main --title "feat(extractions-search): NL question → jurisdiction/date filter → save as collection" \
  --body "$(cat <<'BODY'
Implements Spec B — NL question → base-schema filter (jurisdiction + decision_date) → save as collection.

AC1 jurisdiction/decision_date in BaseSchemaFilter + RPC (p_filters keys; signature unchanged, Database Contract pins it)
AC2 rows link to /documents/{id}?f=…#base-fields with matched base cells highlighted
AC3 Save as collection (≤5000) via POST /collections/from-filter, name = question, lands on /collections/{id}
AC4 every condition is a chip; URL (?f, ?q, ?page, ?nl) reproduces the result set
AC5 BaseFiltersDrawer/facets untouched; test_base_schema_route_regressions.py green

Docs: docs/how-to/save-extraction-filter-as-collection.md, docs/reference/base-schema-filter-api.md.
Related: #536 #537 #583. Plan/spec live in the (gitignored) docs/superpowers/ tree.
BODY
)"
```

---

## Risks and issues to link

- **Migration `CREATE OR REPLACE` must keep the exact parameter list** — otherwise an overload appears and PostgREST returns 300 for `results_router.py:483`. Guarded by the new `test_rpc_has_exactly_one_overload` (Task 3). Applying migrations to production remains manual — coordinate with the deploy.
- **Payload size on save**: 5 000 rows × `extracted_data` ≈ 10–20 MB DB→backend per save. Mitigation now: 500-row pages; follow-up: ids-only RPC (see building blocks). Consider lowering `SAVE_FROM_FILTER_MAX_DOCUMENTS` via env if Supabase latency bites.
- **Collection cap (5 000) vs extraction job cap (1 000, `MAX_DOCUMENTS_PER_JOB`, `backend/app/extraction_domain/shared.py:31`)**: the "Ekstrahuj" step (Spec A) will need to split or reject; documented in the how-to; raise with Spec A.
- **Pre-existing date bug** (`page.tsx:66-72,110-115`, epoch seconds written into `from/to`) is fixed in Task 5 as a side effect; the fix changes what the Quick date control shows for NL-applied dates (now correct). Note in PR.
- **LLM ambiguity `decision_date` vs `date_of_appeal_court_judgment`**: prompt now defaults to `decision_date`; existing users who relied on the old example get the other field. Cached `llm` behaviour is not an issue (no cache on this chain). Monitor `search_analytics` rows (`record_search_query` in `nl_to_filter`).
- **Polish diacritics ≠ PL** — prompt rule 8 says so explicitly; the older heuristic in `backend/app/query_analysis.py:339-345` infers PL from diacritics for the *search* page and is intentionally not reused here.
- **Frontend Route Contract**: no new pages, only an API route + query params; `route-reachability.test.ts` scans `page.tsx` files only. `/documents/[id]` is dynamic (exempt).
- **`/documents/[id]` breadcrumb** now points back to the filtered list when `?f=` is present — verify it does not break `frontend/tests/e2e` document specs that assert the "Search" crumb href (grep before merging).
- **E2E `extractions.spec.ts` is outside CI (#583)** — the Task 15 scenario is local-only; unit tests carry the contract.
- **#536 (navigation)**: `/search/extractions` is already sidebar-linked (`NAV_LINKED_ROUTES`); the row 404 → `/documents/{id}` fix (Task 8) removes one dead end. Mention in #536.
- **#537 (empty `extraction_schemas` in production)**: unaffected here — base-schema extraction is column-based — but the "Extract" CTA on the landing collection page depends on seeded schemas; link so Spec A's AC1 is not blocked silently.
- **Data defects (`case_type`, `court_level`)**: excluded from NL (`NL_EXCLUDED_CORE_FIELDS`); when the data is fixed, the un-exclusion is a two-line change + prompt bullet + removing one test assertion — open a follow-up issue referencing APP_STATUS §4.

---

## Shared building blocks

Honest split: **genuinely reusable** (R) vs **feature-specific** (F).

**Backend**
- (R) `filter_documents_by_extracted_data` with `p_filters->'jurisdiction'` / `'decision_date'` — migration `20260920000001`. Interface: `SELECT … FROM filter_documents_by_extracted_data('{"jurisdiction":["PL"],"decision_date":{"from":"2015-01-01"}}'::jsonb, NULL, 500, 0)`. The compare page runs it twice (`["PL"]`, `["UK"]`) with the same base filters; the research flow uses it to size a sample.
- (R) `collect_filter_ids(client, filters, text_query, *, cap, page_size) -> FilterIdsResult(ids, total)` — `backend/app/extraction_domain/filter_ids.py`. Any flow that needs "all ids for this filter" (sampling N of M, export, compare-set intersection) calls this; raises `FilterTooLargeError(total, cap)`.
- (R) `POST /collections/from-filter {name, description?, filters, text_query?} -> 201 {collection, added_count, total_matched}` — the research-flow epic's step 1 (collection creation) is exactly this endpoint; a sampling step would add `sample?: {n, seed}` to the request and slice `resolved.ids` before `bulk_add_documents`.
- (R) `BaseSchemaFilter` (+ `Jurisdiction`, `DateRange`) and `NL_EXCLUDED_CORE_FIELDS` — `nl_filter_generator.py`. The compare page can call `generate_base_schema_filter(question)` once, then strip `jurisdiction` and run per-country; `to_rpc_payload()` is the single serialiser.
- (F) `SYSTEM_PROMPT` rules 8–9 — specific to this translator; other prompts should not copy-paste, but the PL/EN phrasing lists are a reusable *fixture* for tests.
- **Proposed follow-up (not in this plan), needed by both epics:** ids-only + grouped-facet RPC, e.g. `filter_judgment_ids_by_extracted_data(p_filters, p_text_query, p_limit, p_offset) RETURNS TABLE(id UUID, jurisdiction TEXT, decision_date DATE, total_count BIGINT)` and `get_extracted_facet_counts_filtered(field_path TEXT, p_filters JSONB, p_text_query TEXT) RETURNS TABLE(jurisdiction TEXT, value TEXT, count BIGINT)` — the compare page's "facet counts grouped by jurisdiction" cannot be built from today's global `get_extracted_facet_counts(field_path)` (`20260226000001:730`); extracting the WHERE clause into the ids function once lets both RPCs share it. Signature additions there are safe because they are *new* functions, not overloads.

**Frontend**
- (R) `lib/extractions/drawer-adapter.ts` — `toDrawerFilters(BaseSchemaFilters) -> BaseFilters`, `applyDrawerChange(s, field, BaseFilterValue|undefined) -> BaseSchemaFilters`, `isoToEpochSeconds`/`epochSecondsToIso`, `coreToDrawerValue`, `applyCoreChange`. Any page that renders `components/search/controls/*` against RPC JSON should use it (the compare page's shared filter panel, the research flow's step-1 filter).
- (R) `CORE_FILTER_FIELDS` / `CORE_FILTER_FIELD_BY_NAME` / `ALL_FILTER_FIELD_BY_NAME` / `isCoreFilterField()` in `base-schema-filter-config.ts` — label/control metadata for `jurisdiction` and `decision_date`; chips and controls anywhere resolve labels via `ALL_FILTER_FIELD_BY_NAME[field]`.
- (R) `components/search/ScopeFilters.tsx` — `<ScopeFilters filters onChange disabled? />`; drop-in for the compare page (there, hide the jurisdiction half via a `fields?: ("jurisdiction"|"decision_date")[]` prop — one-line extension).
- (R) `ActiveFilterChips` (now resolving core fields) — `<ActiveFilterChips filters textQuery onRemove onClearText onClearAll />`.
- (R) `encodeFilters`/`decodeFilters`/`buildSearchParams` in `use-extracted-data-filters.ts` — URL codec for any filter-bearing page; the compare page can encode `{base filters}` once and add `?j=PL,UK`.
- (R) `lib/extractions/filter-match.ts` — `matchedMetadataKeys(filters, metadata) -> Set<string>`; also usable in a collection table to badge rows/cells that satisfy the saved filter.
- (R) `lib/extractions/document-href.ts` — `buildDocumentHref(id, filters)`; compare page result lists link the same way.
- (R) `KeyInformation` `highlightKeys` / `id` / `highlightCaption` props — generic cell emphasis for any metadata-driven highlight (e.g. "fields extracted by job X").
- (R) `createCollectionFromFilter(req)` + `CollectionFromFilterError` in `lib/api/collections.ts`; `/api/collections/from-filter` proxy.
- (F) `SaveAsCollectionDialog` — the copy ("Save N judgments…", cap messaging) is tied to `/search/extractions`; the research flow would rather reuse `createCollectionFromFilter` inside its own stepper than this dialog.
- (F) `?nl=` question persistence — only meaningful where an NL dialog exists.

**Tests as shared fixtures**
- (R) `tests/db/test_base_schema_filter_contract.py::_insert_judgment/_filter_ids` — the pattern for behavioural RPC contract tests on a migrated throwaway DB; the grouped-facet RPC follow-up should extend this file.
- (R) `tests/app/test_filter_ids.py::_FakeRpc` — a paging fake for `supabase.rpc(...)` reusable by any server-side consumer of the RPC.
