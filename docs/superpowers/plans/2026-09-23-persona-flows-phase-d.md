# Persona Flows Phase D — Case flow: cohort on `/precedents` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/precedents` returns the raw pgvector candidate cohort before the LLM ranking pass and the page leads with an "In similar cases…" grouped bar chart over it, so the Case flow answers "what usually happens in cases like this" even while the LLM is down.

**Architecture:** The endpoint already pulls vector candidates, then fetches each candidate one-by-one and ranks them with an LLM. Part D1 raises the candidate pool to 100, fetches the grouping columns for the whole pool in **one** batched PostgREST select (no migration, no new RPC), and returns it as a new `cohort` array alongside the unchanged `precedents` list; it also resolves a case number typed into the query box through the existing `document_id` path. Part D2 groups that cohort client-side into the same `FieldAggregate` shape the Statistics view uses (#708), renders it through the existing `FieldCard` + `HorizontalBarChart`, and lets a bar filter the ranked list below.

**Tech Stack:** FastAPI + Pydantic v2, `supabase-py` (PostgREST), pytest; Next.js 15 App Router, React 19, TypeScript strict, Jest + Testing Library, Playwright (route-contract harness), Plotly via the shared chart primitives.

**Spec:** `docs/superpowers/specs/2026-09-20-persona-flows-design.md` §7 (Phase D). §7.1 = Task 2–3, §7.2 = Task 5–8, §7.4 = the tests inside Tasks 5, 3 and 9. §7.3 ("Continue" actions) is **out of scope** — see Non-goals.

## Global Constraints

- **No new SQL and no migration.** The cohort is a batched select over `judgments` on the ids the existing `search_judgments_by_embedding` RPC already returns (`supabase/migrations/20260322000001_migrate_embeddings_768_to_1024.sql:75-109` — its `RETURNS TABLE` is `id, case_number, title, summary, jurisdiction, decision_date, similarity` and must not be changed, because `search_by_vector` maps that exact shape).
- **The ranked `precedents` list is unchanged**: same fields, same ordering, same `limit`. `_load_candidate_documents` keeps taking `similar_results[:limit]`, so widening the candidate pool cannot change what gets ranked.
- **The cohort is built before the LLM pass and survives its failure.** `_analyze_precedents` already swallows exceptions and returns `{"analyses": [], "enhanced_query": None}` (`backend/app/precedents.py:312-323`), which is the state #546 puts the whole instance in.
- **Cohort field names are the unprefixed Phase B names** — `appeal_outcome`, `sentences_received`, `convict_offences` — so `aggregateFieldLabel()` (`frontend/lib/extractions/aggregate-fields.ts`) resolves their labels through `ALL_FILTER_FIELD_BY_NAME` with no new label table.
- **Cohort size is a server constant**, `COHORT_MATCH_COUNT = 100`, not a request field. `match_threshold` stays `0.3`.
- **No full text in the cohort projection.** `_JUDGMENT_COLS` carries `full_text` (50–100 KB/row); a 100-row cohort must use the new slim column list.
- **Never send `full_text`, `embedding` or `base_*` blobs to the browser.** The cohort item carries exactly the ten fields listed in Task 2.
- **i18n:** `frontend/app/precedents/page.tsx` is today 100% hardcoded English copy and has no `precedents` translation block. Only the **new** strings get keys (a new `PrecedentsTranslations` interface); existing copy is left alone (scope discipline). Every key lands in `frontend/lib/i18n/types.ts`, `translations/en.ts` and `translations/pl.ts` — these three files are **CRLF**; keep CRLF (verify with `file <path>`; the net diff must be added lines only).
- **Design system:** editorial primitives from `@/components/editorial`, PWr tokens (`--pwr-red #9A342D` bars, `--pwr-grey #5A5A5A` for "other"/"missing"), single series per chart, no legend, no gradients, no `bg-{indigo,purple,violet}` pills.
- **Commits:** Conventional Commits, `Refs #724` (D1) / `Refs #726` (D2) in the footer, no AI/Claude/co-author trailers of any kind.
- **Worktrees:** D1 in `.worktrees/feat-724-precedents-cohort` (branch `feat/724-precedents-cohort`, from `origin/main`); D2 in `.worktrees/feat-726-cohort-block` (branch `feat/726-cohort-block`), created **after** #724 merges.
- **Tooling:** `poetry` is not on PATH in this environment — run the backend interpreter directly: `/home/laugustyniak/github/legal-ai/.venv/bin/pytest`, `/home/laugustyniak/github/legal-ai/.venv/bin/ruff` from `<worktree>/backend`. pytest's `addopts` hides the "N passed" line; trust the exit code or pass `-v`. Frontend commands run from `<worktree>/frontend`.

## Non-goals (spec §7.3, tracked in #728)

Select → "Add to collection", "Open reasoning lines", "Draft memo". Reasons, verified in the repo: `/reasoning-lines` reads no URL parameter in either `frontend/app/reasoning-lines/page.tsx` or `[id]/page.tsx`, so there is nothing to deep-link into; the memo path needs a working LLM key (#546); and add-to-collection needs a collection-picker component that does not exist — `SaveAsCollectionDialog` (`frontend/components/search/SaveAsCollectionDialog.tsx`) creates a collection from a *filter*, not from a list of ids, even though `addDocumentsToCollection(collectionId, documentIds)` (`frontend/lib/api/collections.ts:200`) is ready.

Also out of scope: navigation changes (the Case flow already lists `/precedents` in `frontend/lib/navigation/flows.ts` from Phase A), and translating the page's pre-existing copy.

---

## File Structure

### D1 — backend (#724)

| File | Responsibility |
|---|---|
| `backend/packages/juddges_search/juddges_search/db/documents_db.py` (modify) | `_JUDGMENT_COHORT_COLS` + `get_cohort_fields_by_ids()` (batched slim select) + `get_document_by_case_number()` (exact lookup). |
| `backend/app/precedents.py` (modify) | `PrecedentCohortItem` / `ResolvedCase` models, `cohort` + `resolved_case` on the response, `COHORT_MATCH_COUNT`, `_build_cohort()`, `_resolve_case_query()`, endpoint wiring. |
| `backend/tests/app/test_documents_db_cohort.py` (create) | Unit tests for the two db methods against a mocked PostgREST client. |
| `backend/tests/app/test_precedents_cohort.py` (create) | Unit tests for `_build_cohort`, `_resolve_case_query`, and the endpoint's cohort/resolved-case behaviour with a mocked db + embedding. |
| `scripts/openapi-snapshot.json`, `frontend/lib/api/generated/openapi.ts` (regenerate) | Response-model change drifts both. |

### D2 — frontend (#726)

| File | Responsibility |
|---|---|
| `frontend/lib/api/advanced.ts` (modify) | `PrecedentCohortItem`, `ResolvedCase`, the two new fields on `FindPrecedentsResponse`. |
| `frontend/lib/precedents/cohort-grouping.ts` (create) | Pure grouping: cohort → `FieldAggregate`, ids carrying a value, the headline bucket. No React. |
| `frontend/lib/i18n/types.ts`, `translations/en.ts`, `translations/pl.ts` (modify) | New `PrecedentsTranslations` block. |
| `frontend/app/precedents/_components/CohortInsights.tsx` (create) | The "In similar cases…" block: group-by control, headline, `FieldCard`, active-filter chip. |
| `frontend/app/precedents/page.tsx` (modify) | Renders the block above the list, holds the cohort filter state, filters the ranked list, shows the resolved-case banner. |
| `frontend/__tests__/lib/precedents/cohort-grouping.test.ts` (create) | Grouping unit tests (multi-valued, nulls, empty arrays, top-N). |
| `frontend/__tests__/app/precedents/CohortInsights.test.tsx` (create) | Block rendering, headline copy, bar click, clear filter. |
| `frontend/__tests__/app/precedents/precedents-cohort.test.tsx` (create) | Page-level: block shown, list filtered, banner, empty-filter message. |
| `frontend/tests/route-contract-e2e/stub-services.mjs` (modify), `frontend/tests/route-contract-e2e/precedents-cohort.spec.ts` (create) | Stub `POST /precedents/find`; E2E over the rendered block. |

---

# Part D1 — backend (#724), branch `feat/724-precedents-cohort`

Worktree already exists at `.worktrees/feat-724-precedents-cohort` with `frontend/node_modules` hard-linked.

### Task 1: Cohort and case-number lookups in the vector DB layer

**Files:**
- Modify: `backend/packages/juddges_search/juddges_search/db/documents_db.py` (add a constant after `_JUDGMENT_LIST_COLS` at line 70-76; add two methods after `get_documents_by_ids`, which ends at line 221)
- Test: `backend/tests/app/test_documents_db_cohort.py` (create)

**Interfaces:**
- Consumes: `SupabaseVectorDB` (`documents_db.py:98`), `_UUID_RE` (`:78`), `_JUDGMENT_LIST_COLS` (`:70`), `PostgrestAPIError` / `StorageException` (imported at the top of the file).
- Produces:
  - `SupabaseVectorDB.get_cohort_fields_by_ids(self, document_ids: list[str]) -> list[dict[str, Any]]`
  - `SupabaseVectorDB.get_document_by_case_number(self, case_number: str) -> dict[str, Any] | None`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/app/test_documents_db_cohort.py`:

```python
"""Unit tests for the precedents-cohort lookups on SupabaseVectorDB (#724).

The Supabase client is a MagicMock: these tests pin the column projection and
the filter calls, which is what the cohort's payload size depends on.
"""

from typing import Any
from unittest.mock import MagicMock

import pytest
from juddges_search.db.documents_db import (
    _JUDGMENT_COHORT_COLS,
    SupabaseVectorDB,
)

UUID_A = "11111111-1111-1111-1111-111111111111"
UUID_B = "22222222-2222-2222-2222-222222222222"


def _db_with_rows(rows: list[dict[str, Any]]) -> tuple[SupabaseVectorDB, MagicMock]:
    """A SupabaseVectorDB whose client returns `rows`, without touching env vars."""
    db = SupabaseVectorDB.__new__(SupabaseVectorDB)
    client = MagicMock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = MagicMock(
        data=rows
    )
    client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=rows
    )
    db.client = client
    return db, client


@pytest.mark.anyio
@pytest.mark.unit
async def test_cohort_projection_excludes_full_text() -> None:
    db, client = _db_with_rows([{"id": UUID_A, "case_number": "III CSK 245/22"}])

    await db.get_cohort_fields_by_ids([UUID_A])

    client.table.assert_called_with("judgments")
    client.table.return_value.select.assert_called_with(_JUDGMENT_COHORT_COLS)
    assert "full_text" not in _JUDGMENT_COHORT_COLS
    assert "embedding" not in _JUDGMENT_COHORT_COLS
    for column in (
        "base_appeal_outcome",
        "base_sentences_received",
        "base_convict_offences",
    ):
        assert column in _JUDGMENT_COHORT_COLS


@pytest.mark.anyio
@pytest.mark.unit
async def test_cohort_is_one_round_trip_and_dedupes() -> None:
    rows = [
        {"id": UUID_A, "case_number": "III CSK 245/22"},
        {"id": UUID_B, "case_number": "[2023] EWCA Civ 1234"},
        {"id": UUID_A, "case_number": "III CSK 245/22"},
    ]
    db, client = _db_with_rows(rows)

    result = await db.get_cohort_fields_by_ids([UUID_A, UUID_B, UUID_A])

    assert [row["id"] for row in result] == [UUID_A, UUID_B]
    assert client.table.return_value.select.return_value.in_.call_count == 1
    client.table.return_value.select.return_value.in_.assert_called_with(
        "id", [UUID_A, UUID_B, UUID_A]
    )


@pytest.mark.anyio
@pytest.mark.unit
async def test_cohort_skips_non_uuid_ids_and_empty_input() -> None:
    db, client = _db_with_rows([])

    assert await db.get_cohort_fields_by_ids([]) == []
    assert await db.get_cohort_fields_by_ids(["not-a-uuid"]) == []
    client.table.assert_not_called()


@pytest.mark.anyio
@pytest.mark.unit
async def test_cohort_returns_empty_list_on_client_error() -> None:
    db = SupabaseVectorDB.__new__(SupabaseVectorDB)
    client = MagicMock()
    client.table.side_effect = RuntimeError("boom")
    db.client = client

    with pytest.raises(RuntimeError):
        await db.get_cohort_fields_by_ids([UUID_A])


@pytest.mark.anyio
@pytest.mark.unit
async def test_case_number_lookup_returns_first_row() -> None:
    db, client = _db_with_rows([{"id": UUID_A, "case_number": "III CSK 245/22", "title": "T"}])

    row = await db.get_document_by_case_number("III CSK 245/22")

    assert row is not None and row["id"] == UUID_A
    client.table.return_value.select.return_value.eq.assert_called_with(
        "case_number", "III CSK 245/22"
    )
    client.table.return_value.select.return_value.eq.return_value.limit.assert_called_with(1)


@pytest.mark.anyio
@pytest.mark.unit
async def test_case_number_lookup_returns_none_when_missing() -> None:
    db, _ = _db_with_rows([])

    assert await db.get_document_by_case_number("III CSK 999/99") is None
```

Note on `test_cohort_returns_empty_list_on_client_error`: the method catches only `PostgrestAPIError` / `StorageException` (matching every sibling method in this file); a bare `RuntimeError` must therefore propagate. The test pins that boundary deliberately.

- [ ] **Step 2: Run the tests to verify they fail**

Run from `<worktree>/backend`:
```bash
/home/laugustyniak/github/legal-ai/.venv/bin/pytest tests/app/test_documents_db_cohort.py -v
```
Expected: collection error — `ImportError: cannot import name '_JUDGMENT_COHORT_COLS'`.

- [ ] **Step 3: Add the column list**

In `backend/packages/juddges_search/juddges_search/db/documents_db.py`, directly after the `_JUDGMENT_LIST_COLS` definition (which ends with `)` on line 76):

```python
# Precedents cohort (#724): the grouping fields the "In similar cases…" block
# needs, and nothing else. Deliberately excludes `full_text` (50-100 KB/row) and
# the rest of the `base_*` block — this projection is fetched 100 rows at a time.
_JUDGMENT_COHORT_COLS = (
    "id, case_number, title, jurisdiction, court_name, decision_date, "
    "base_appeal_outcome, base_sentences_received, base_convict_offences"
)
```

- [ ] **Step 4: Add the two methods**

In the same file, after `get_documents_by_ids` (it ends at line 221 with `return []`) and before `get_embedding_stats`:

```python
    async def get_cohort_fields_by_ids(
        self,
        document_ids: list[str],
    ) -> list[dict[str, Any]]:
        """Fetch the precedents-cohort projection for a batch of judgment UUIDs.

        One round trip for the whole cohort (#724), unlike the per-candidate
        `get_document_by_id` the precedents endpoint uses for its ranked slice.
        Non-UUID values are dropped: the vector RPC returns `judgments.id`.

        Returns rows deduplicated by `judgments.id`, in PostgREST's order.
        """
        if not document_ids:
            return []

        uuid_ids = [i for i in document_ids if _UUID_RE.match(i)]
        if not uuid_ids:
            return []

        try:
            r = (
                self.client.table("judgments")
                .select(_JUDGMENT_COHORT_COLS)
                .in_("id", document_ids)
                .execute()
            )
            rows_by_id: dict[str, dict[str, Any]] = {row["id"]: row for row in (r.data or [])}
            return list(rows_by_id.values())
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to fetch cohort fields: {e}")
            return []

    async def get_document_by_case_number(self, case_number: str) -> dict[str, Any] | None:
        """Exact-match lookup on `judgments.case_number` (#724).

        Used to turn a docket typed into the precedents query box into a source
        document. Exact match only — `case_number` is indexed both plainly and
        with trigrams, but a fuzzy match would silently search the wrong case.
        """
        try:
            r = (
                self.client.table("judgments")
                .select(_JUDGMENT_LIST_COLS)
                .eq("case_number", case_number)
                .limit(1)
                .execute()
            )
            return r.data[0] if r.data else None
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to look up case_number {case_number}: {e}")
            return None
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
/home/laugustyniak/github/legal-ai/.venv/bin/pytest tests/app/test_documents_db_cohort.py -v
```
Expected: 6 passed.

- [ ] **Step 6: Lint and commit**

```bash
cd <worktree>/backend
/home/laugustyniak/github/legal-ai/.venv/bin/ruff check packages/juddges_search/juddges_search/db/documents_db.py tests/app/test_documents_db_cohort.py
/home/laugustyniak/github/legal-ai/.venv/bin/ruff format --check packages/juddges_search/juddges_search/db/documents_db.py tests/app/test_documents_db_cohort.py
cd <worktree>
git add backend/packages/juddges_search/juddges_search/db/documents_db.py backend/tests/app/test_documents_db_cohort.py
git commit -m "feat(db): batched cohort projection and case-number lookup

Refs #724"
```

---

### Task 2: `cohort` on the precedents response

**Files:**
- Modify: `backend/app/precedents.py` (models after `PrecedentMatch` which ends at line 126; `FindPrecedentsResponse` at 129-139; `_empty_precedents_response` at 326-336; `_search_precedent_candidates` at 358-375; the endpoint body at 476-535)
- Test: `backend/tests/app/test_precedents_cohort.py` (create)

**Interfaces:**
- Consumes: `SupabaseVectorDB.get_cohort_fields_by_ids(document_ids) -> list[dict]` (Task 1).
- Produces:
  - `COHORT_MATCH_COUNT: int = 100`
  - `class PrecedentCohortItem(BaseModel)` with fields `document_id: str`, `similarity_score: float`, `case_number: str | None`, `title: str | None`, `jurisdiction: str | None`, `court_name: str | None`, `decision_date: str | None`, `appeal_outcome: list[str]`, `sentences_received: list[str]`, `convict_offences: list[str]`
  - `async def _build_cohort(db: Any, similar_results: list[dict[str, Any]]) -> list[PrecedentCohortItem]`
  - `FindPrecedentsResponse.cohort: list[PrecedentCohortItem]` (defaults to `[]`)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/app/test_precedents_cohort.py`:

```python
"""Cohort assembly for the precedents endpoint (#724, spec §7.1)."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.precedents import (
    COHORT_MATCH_COUNT,
    FindPrecedentsResponse,
    PrecedentCohortItem,
    _build_cohort,
    _empty_precedents_response,
)

UUID_A = "11111111-1111-1111-1111-111111111111"
UUID_B = "22222222-2222-2222-2222-222222222222"

SIMILAR_RESULTS: list[dict[str, Any]] = [
    {"document_id": UUID_A, "similarity": 0.81},
    {"document_id": UUID_B, "similarity": 0.62},
]

COHORT_ROWS: list[dict[str, Any]] = [
    {
        "id": UUID_B,
        "case_number": "[2023] EWCA Civ 1234",
        "title": "R v B",
        "jurisdiction": "UK",
        "court_name": "Court of Appeal",
        "decision_date": "2023-04-02",
        "base_appeal_outcome": ["outcome_appeal_dismissed"],
        "base_sentences_received": None,
        "base_convict_offences": ["theft", "burglary"],
    },
    {
        "id": UUID_A,
        "case_number": "III CSK 245/22",
        "title": "A v B",
        "jurisdiction": "PL",
        "court_name": "Sąd Najwyższy",
        "decision_date": "2022-11-15",
        "base_appeal_outcome": [],
        "base_sentences_received": ["2 years"],
        "base_convict_offences": None,
    },
]


def _db_with_cohort(rows: list[dict[str, Any]]) -> MagicMock:
    db = MagicMock()
    db.get_cohort_fields_by_ids = AsyncMock(return_value=rows)
    return db


@pytest.mark.anyio
@pytest.mark.unit
async def test_cohort_preserves_similarity_order_not_row_order() -> None:
    cohort = await _build_cohort(_db_with_cohort(COHORT_ROWS), SIMILAR_RESULTS)

    assert [item.document_id for item in cohort] == [UUID_A, UUID_B]
    assert cohort[0].similarity_score == pytest.approx(0.81)
    assert cohort[1].similarity_score == pytest.approx(0.62)


@pytest.mark.anyio
@pytest.mark.unit
async def test_cohort_maps_base_columns_to_unprefixed_names() -> None:
    cohort = await _build_cohort(_db_with_cohort(COHORT_ROWS), SIMILAR_RESULTS)

    assert cohort[0].sentences_received == ["2 years"]
    assert cohort[0].appeal_outcome == []
    assert cohort[0].convict_offences == []  # NULL becomes an empty list
    assert cohort[1].appeal_outcome == ["outcome_appeal_dismissed"]
    assert cohort[1].case_number == "[2023] EWCA Civ 1234"
    assert cohort[1].court_name == "Court of Appeal"
    assert cohort[1].decision_date == "2023-04-02"


@pytest.mark.anyio
@pytest.mark.unit
async def test_cohort_drops_candidates_without_a_row() -> None:
    cohort = await _build_cohort(_db_with_cohort([COHORT_ROWS[1]]), SIMILAR_RESULTS)

    assert [item.document_id for item in cohort] == [UUID_A]


@pytest.mark.anyio
@pytest.mark.unit
async def test_cohort_of_no_candidates_makes_no_db_call() -> None:
    db = _db_with_cohort(COHORT_ROWS)

    assert await _build_cohort(db, []) == []
    db.get_cohort_fields_by_ids.assert_not_called()


@pytest.mark.unit
def test_cohort_match_count_is_one_hundred() -> None:
    assert COHORT_MATCH_COUNT == 100


@pytest.mark.unit
def test_empty_response_carries_an_empty_cohort() -> None:
    response = _empty_precedents_response("q", None)

    assert isinstance(response, FindPrecedentsResponse)
    assert response.cohort == []


@pytest.mark.unit
def test_cohort_item_defaults_missing_arrays_to_empty() -> None:
    item = PrecedentCohortItem(document_id=UUID_A, similarity_score=0.5)

    assert item.appeal_outcome == []
    assert item.sentences_received == []
    assert item.convict_offences == []
    assert item.case_number is None
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
/home/laugustyniak/github/legal-ai/.venv/bin/pytest tests/app/test_precedents_cohort.py -v
```
Expected: `ImportError: cannot import name 'COHORT_MATCH_COUNT' from 'app.precedents'`.

- [ ] **Step 3: Add the constant and the model**

In `backend/app/precedents.py`, next to `PRECEDENTS_RATE_LIMIT` (line 25):

```python
# Raw vector candidates exposed as the cohort (#724, spec §7.1). The ranked
# `precedents` slice is still taken from the top `limit` of this same pool, so a
# wider pool does not change what the LLM sees.
COHORT_MATCH_COUNT = 100
```

After `PrecedentMatch` (ends line 126) and before `FindPrecedentsResponse`:

```python
class PrecedentCohortItem(BaseModel):
    """One raw vector candidate, before the LLM ranking pass (#724).

    Field names drop the `base_` prefix so the frontend can label them with the
    same helper the statistics view uses (#708).
    """

    document_id: str = Field(description="Judgment UUID")
    similarity_score: float = Field(description="Cosine similarity (0.0 to 1.0)")
    case_number: str | None = Field(default=None, description="Court case number")
    title: str | None = Field(default=None, description="Judgment title")
    jurisdiction: str | None = Field(default=None, description="PL or UK")
    court_name: str | None = Field(default=None, description="Court name")
    decision_date: str | None = Field(default=None, description="ISO decision date")
    appeal_outcome: list[str] = Field(
        default_factory=list, description="base_appeal_outcome values"
    )
    sentences_received: list[str] = Field(
        default_factory=list, description="base_sentences_received values"
    )
    convict_offences: list[str] = Field(
        default_factory=list, description="base_convict_offences values"
    )
```

In `FindPrecedentsResponse` (line 129-139), after the `enhanced_query` field:

```python
    cohort: list[PrecedentCohortItem] = Field(
        default_factory=list,
        description=(
            "Raw vector candidates (up to 100) with the fields the UI groups by, "
            "collected before the AI ranking pass. Present even when the ranking "
            "pass returns nothing."
        ),
    )
```

- [ ] **Step 4: Add `_build_cohort` and widen the candidate pool**

In `backend/app/precedents.py`, after `_load_candidate_documents` (ends line 398):

```python
async def _build_cohort(
    db: Any, similar_results: list[dict[str, Any]]
) -> list[PrecedentCohortItem]:
    """Assemble the raw candidate cohort in one batched select (#724).

    Order follows `similar_results` (already similarity-sorted by the RPC), not
    the order PostgREST happens to return rows in.
    """
    ordered_ids = [r.get("document_id") for r in similar_results if r.get("document_id")]
    if not ordered_ids:
        return []

    rows = await db.get_cohort_fields_by_ids(ordered_ids)
    rows_by_id = {row.get("id"): row for row in rows}
    similarity_by_id = {
        r.get("document_id"): r.get("similarity") or 0.0 for r in similar_results
    }

    cohort: list[PrecedentCohortItem] = []
    for doc_id in ordered_ids:
        row = rows_by_id.get(doc_id)
        if not row:
            continue
        decision_date = row.get("decision_date")
        cohort.append(
            PrecedentCohortItem(
                document_id=doc_id,
                similarity_score=float(similarity_by_id.get(doc_id) or 0.0),
                case_number=row.get("case_number"),
                title=row.get("title"),
                jurisdiction=row.get("jurisdiction"),
                court_name=row.get("court_name"),
                decision_date=str(decision_date) if decision_date else None,
                appeal_outcome=list(row.get("base_appeal_outcome") or []),
                sentences_received=list(row.get("base_sentences_received") or []),
                convict_offences=list(row.get("base_convict_offences") or []),
            )
        )
    return cohort
```

In `_search_precedent_candidates` (line 358-375) replace the `match_count` line:

```python
    search_kwargs: dict[str, Any] = {
        "query_embedding": embedding,
        # The cohort needs the wide pool (#724); the ranked slice still comes
        # from `similar_results[:limit]`, so ranking is unaffected.
        "match_count": max(min(limit * 2, 50), COHORT_MATCH_COUNT),
        "match_threshold": 0.3,
    }
```

In `_empty_precedents_response` (line 326-336) add the field:

```python
    return FindPrecedentsResponse(
        query=query,
        precedents=[],
        total_found=0,
        search_strategy="semantic_similarity",
        enhanced_query=enhanced_query,
        cohort=[],
    )
```

In the endpoint body, immediately after the `_apply_filters` block (line 504) and **before** `_load_candidate_documents`:

```python
    cohort = await _build_cohort(db, similar_results)
```

and add `cohort=cohort` to the final `FindPrecedentsResponse(...)` construction (line 529-535). Leave the `if not candidates_data: return _empty_precedents_response(...)` branch as it is — a cohort with no loadable ranked candidates is vanishingly rare, and that branch already returns a valid empty payload.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
/home/laugustyniak/github/legal-ai/.venv/bin/pytest tests/app/test_precedents_cohort.py tests/app/test_precedents.py -v
```
Expected: the new file passes (7 tests) and the pre-existing `test_precedents.py` stays green.

- [ ] **Step 6: Lint and commit**

```bash
cd <worktree>/backend
/home/laugustyniak/github/legal-ai/.venv/bin/ruff check app/precedents.py tests/app/test_precedents_cohort.py
/home/laugustyniak/github/legal-ai/.venv/bin/ruff format --check app/precedents.py tests/app/test_precedents_cohort.py
cd <worktree>
git add backend/app/precedents.py backend/tests/app/test_precedents_cohort.py
git commit -m "feat(precedents): return the raw vector cohort before the ranking pass

Refs #724"
```

---

### Task 3: Case-number detection and resolution

**Files:**
- Modify: `backend/app/precedents.py` (import block at lines 8-20; models; endpoint head at 476-492)
- Test: `backend/tests/app/test_precedents_cohort.py` (append)

**Interfaces:**
- Consumes: `parse_query_attributes(query: str) -> ParsedQuery` with `ParsedQuery.case_number: str | None` (`backend/app/judgments_pkg/query_attribute_parser.py:178`, patterns at `:92-101`); `SupabaseVectorDB.get_document_by_case_number(case_number) -> dict | None` (Task 1); `FindPrecedentsRequest` (`backend/app/precedents.py:31`).
- Produces:
  - `class ResolvedCase(BaseModel)` with `case_number: str`, `document_id: str`, `title: str | None`
  - `async def _resolve_case_query(db: Any, query: str) -> ResolvedCase | None`
  - `FindPrecedentsResponse.resolved_case: ResolvedCase | None`
  - `_empty_precedents_response(query, enhanced_query, resolved_case=None)`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/app/test_precedents_cohort.py`:

```python
from app.precedents import ResolvedCase, _resolve_case_query  # noqa: E402


def _db_with_case(row: dict[str, Any] | None) -> MagicMock:
    db = MagicMock()
    db.get_document_by_case_number = AsyncMock(return_value=row)
    return db


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.parametrize(
    "query,expected",
    [
        ("Compare with III CSK 245/22 please", "III CSK 245/22"),
        ("what happened in [2023] EWCA Civ 1234 exactly", "[2023] EWCA Civ 1234"),
    ],
)
async def test_resolves_pl_and_uk_dockets(query: str, expected: str) -> None:
    db = _db_with_case({"id": UUID_A, "case_number": expected, "title": "A v B"})

    resolved = await _resolve_case_query(db, query)

    assert resolved == ResolvedCase(
        case_number=expected, document_id=UUID_A, title="A v B"
    )
    db.get_document_by_case_number.assert_awaited_once_with(expected)


@pytest.mark.anyio
@pytest.mark.unit
async def test_no_docket_in_query_skips_the_lookup() -> None:
    db = _db_with_case({"id": UUID_A, "case_number": "X", "title": None})

    assert await _resolve_case_query(db, "a burglary appeal by a juvenile") is None
    db.get_document_by_case_number.assert_not_called()


@pytest.mark.anyio
@pytest.mark.unit
async def test_unknown_docket_resolves_to_none() -> None:
    db = _db_with_case(None)

    assert await _resolve_case_query(db, "see III CSK 245/22") is None


@pytest.mark.unit
def test_empty_response_can_carry_the_resolved_case() -> None:
    resolved = ResolvedCase(case_number="III CSK 245/22", document_id=UUID_A, title="A v B")

    response = _empty_precedents_response("q", None, resolved_case=resolved)

    assert response.resolved_case == resolved
    assert response.cohort == []
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
/home/laugustyniak/github/legal-ai/.venv/bin/pytest tests/app/test_precedents_cohort.py -v
```
Expected: `ImportError: cannot import name 'ResolvedCase'`.

- [ ] **Step 3: Add the model and the resolver**

In the import block of `backend/app/precedents.py`, after `from app.judgments_pkg import generate_embedding` (line 18):

```python
from app.judgments_pkg.query_attribute_parser import parse_query_attributes
```

After `PrecedentCohortItem` (Task 2) and before `FindPrecedentsResponse`:

```python
class ResolvedCase(BaseModel):
    """A docket typed into the query box, resolved to a judgment (#724)."""

    case_number: str = Field(description="The case number detected in the query")
    document_id: str = Field(description="Judgment UUID it resolved to")
    title: str | None = Field(default=None, description="Judgment title")
```

In `FindPrecedentsResponse`, after `cohort`:

```python
    resolved_case: ResolvedCase | None = Field(
        default=None,
        description=(
            "Set when the query text contained a case number that matched a "
            "judgment; that judgment was used as the source document."
        ),
    )
```

After `_build_cohort`:

```python
async def _resolve_case_query(db: Any, query: str) -> ResolvedCase | None:
    """Detect a PL/UK docket in the query and resolve it to a judgment (#724).

    Reuses the search parser's patterns rather than a second copy of them. An
    unknown docket resolves to None: the text then goes through the normal
    semantic path, which is the right fallback for a typo.
    """
    case_number = parse_query_attributes(query).case_number
    if not case_number:
        return None

    row = await db.get_document_by_case_number(case_number)
    if not row or not row.get("id"):
        logger.info(f"Case number {case_number} not found; falling back to semantic search")
        return None

    return ResolvedCase(
        case_number=case_number,
        document_id=str(row["id"]),
        title=row.get("title"),
    )
```

Extend `_empty_precedents_response` (line 326) to carry it:

```python
def _empty_precedents_response(
    query: str,
    enhanced_query: str | None,
    resolved_case: "ResolvedCase | None" = None,
) -> FindPrecedentsResponse:
    """Build a consistent empty response payload."""
    return FindPrecedentsResponse(
        query=query,
        precedents=[],
        total_found=0,
        search_strategy="semantic_similarity",
        enhanced_query=enhanced_query,
        cohort=[],
        resolved_case=resolved_case,
    )
```

- [ ] **Step 4: Wire it into the endpoint**

In `find_precedents`, replace the two lines after `db = get_vector_db()` (lines 482-483):

```python
    db = get_vector_db()

    resolved_case: ResolvedCase | None = None
    effective_request = precedents_request
    if not precedents_request.document_id:
        resolved_case = await _resolve_case_query(db, precedents_request.query)
        if resolved_case:
            logger.info(
                f"Query resolved to case {resolved_case.case_number} "
                f"({resolved_case.document_id})"
            )
            effective_request = precedents_request.model_copy(
                update={"document_id": resolved_case.document_id}
            )

    search_text = await _build_search_text(effective_request)
```

Then, in the rest of the body, replace every remaining read of `precedents_request` **below that point** with `effective_request` — there are five: the `if not similar_results:` / `if not candidates_data:` empty returns (pass `resolved_case=resolved_case` to both), `if precedents_request.document_id:` (the self-exclusion filter), `if precedents_request.filters:`, `_load_candidate_documents(similar_results, precedents_request.limit)`, `_build_analysis_map(precedents_request, candidates_data)`, `_rank_precedents(precedents)[: precedents_request.limit]` and the `include_analysis` check. Use `effective_request` for all of them, and keep `query=precedents_request.query` in the final response so the echoed query is what the user typed. The final construction becomes:

```python
    return FindPrecedentsResponse(
        query=precedents_request.query,
        precedents=precedents,
        total_found=len(precedents),
        search_strategy=search_strategy,
        enhanced_query=enhanced_query,
        cohort=cohort,
        resolved_case=resolved_case,
    )
```

and both empty branches become `return _empty_precedents_response(precedents_request.query, enhanced_query, resolved_case=resolved_case)`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
/home/laugustyniak/github/legal-ai/.venv/bin/pytest tests/app/test_precedents_cohort.py tests/app/test_precedents.py tests/app/test_query_attribute_parser.py -v
```
Expected: all pass (11 new cohort/case tests plus the two pre-existing files).

- [ ] **Step 6: Lint and commit**

```bash
cd <worktree>/backend
/home/laugustyniak/github/legal-ai/.venv/bin/ruff check app/precedents.py tests/app/test_precedents_cohort.py
/home/laugustyniak/github/legal-ai/.venv/bin/ruff format --check app/precedents.py tests/app/test_precedents_cohort.py
cd <worktree>
git add backend/app/precedents.py backend/tests/app/test_precedents_cohort.py
git commit -m "feat(precedents): resolve a case number typed into the query box

Refs #724"
```

---

### Task 4: OpenAPI regeneration, full gate, PR, merge

**Files:**
- Modify: `scripts/openapi-snapshot.json`, `frontend/lib/api/generated/openapi.ts` (both regenerated)

- [ ] **Step 1: Regenerate the OpenAPI artefacts**

The response model gained two fields, which drifts the snapshot and the generated types (the `OpenAPI Type Drift` check compares them).

```bash
cd <worktree>
export PATH=/home/laugustyniak/miniconda3/bin:$PATH
./scripts/regen_openapi_types.sh
git diff --stat scripts/openapi-snapshot.json frontend/lib/api/generated/openapi.ts
```
Expected: both files change, and the diff mentions only `PrecedentCohortItem`, `ResolvedCase` and the two new `FindPrecedentsResponse` properties. If the script cannot resolve poetry, run its underlying commands with `/home/laugustyniak/github/legal-ai/.venv/bin/python` (read the script; it dumps `app.server:app.openapi()` and then runs `npm run gen:openapi`).

```bash
git add scripts/openapi-snapshot.json frontend/lib/api/generated/openapi.ts
git commit -m "chore(openapi): regenerate snapshot and types for the precedents cohort

Refs #724"
```

- [ ] **Step 2: Full gate**

```bash
cd <worktree>/backend
/home/laugustyniak/github/legal-ai/.venv/bin/ruff check .
/home/laugustyniak/github/legal-ai/.venv/bin/ruff format --check .
/home/laugustyniak/github/legal-ai/.venv/bin/pytest -m unit -q -rN   # ~10 min; run it in the background and read the exit code
cd <worktree>/frontend && npm run validate
```
Expected: ruff clean; pytest exit 0; `npm run validate` exit 0 (79 pre-existing warnings, 0 errors).

- [ ] **Step 3: Review, push, PR**

Spawn a reviewer on `git diff origin/main...HEAD` before opening the PR. Then:

```bash
git push -u origin feat/724-precedents-cohort
gh pr create --base main \
  --title "feat(precedents): return the pgvector cohort before the LLM pass and resolve case numbers" \
  --body-file <body>
```

PR body must carry: what the cohort contains and that it is one batched select (not N+1); that the ranked list is byte-identical in shape and ordering; the `COHORT_MATCH_COUNT = 100` constant and why widening the pool cannot change ranking; the case-number behaviour including the unknown-docket fallback; the test summary; `Closes #724`, `Refs #687 #726`.

- [ ] **Step 4: Merge**

When the seven required checks are green:

```bash
gh pr merge <n> --merge --delete-branch
git -C <main checkout> worktree remove .worktrees/feat-724-precedents-cohort
```

**D2 starts from `origin/main` after this merge.**

---

# Part D2 — frontend (#726), branch `feat/726-cohort-block`

Create the worktree only after #724 is on `main`:

```bash
git fetch origin && git worktree add .worktrees/feat-726-cohort-block -b feat/726-cohort-block origin/main
cp -al frontend/node_modules .worktrees/feat-726-cohort-block/frontend/node_modules
```

### Task 5: Cohort types and the pure grouping module

**Files:**
- Modify: `frontend/lib/api/advanced.ts` (types at 117-156)
- Create: `frontend/lib/precedents/cohort-grouping.ts`
- Test: `frontend/__tests__/lib/precedents/cohort-grouping.test.ts`

**Interfaces:**
- Consumes: `FieldAggregate` (`frontend/types/base-schema-filter.ts:259-262`) — the `categorical` arm is `{ kind: "categorical"; multi: boolean; values: { value: string; count: number }[]; other: number; null: number; covered: number }`.
- Produces:
  - `interface PrecedentCohortItem` (mirrors the backend model, same ten fields)
  - `interface ResolvedCase { case_number: string; document_id: string; title: string | null }`
  - `FindPrecedentsResponse.cohort: PrecedentCohortItem[]`, `.resolved_case: ResolvedCase | null`
  - `COHORT_GROUP_FIELDS: readonly ["appeal_outcome", "sentences_received", "convict_offences"]`
  - `type CohortGroupField = (typeof COHORT_GROUP_FIELDS)[number]`
  - `groupCohort(cohort: PrecedentCohortItem[], field: CohortGroupField, topN?: number): FieldAggregate`
  - `cohortIdsWithValue(cohort: PrecedentCohortItem[], field: CohortGroupField, value: string): Set<string>`
  - `topBucket(aggregate: FieldAggregate): { value: string; count: number } | null`

- [ ] **Step 1: Write the failing tests**

Create `frontend/__tests__/lib/precedents/cohort-grouping.test.ts`:

```ts
import {
  COHORT_GROUP_FIELDS,
  cohortIdsWithValue,
  groupCohort,
  topBucket,
} from "@/lib/precedents/cohort-grouping";
import type { PrecedentCohortItem } from "@/lib/api/advanced";

function item(id: string, patch: Partial<PrecedentCohortItem> = {}): PrecedentCohortItem {
  return {
    document_id: id,
    similarity_score: 0.5,
    case_number: null,
    title: null,
    jurisdiction: null,
    court_name: null,
    decision_date: null,
    appeal_outcome: [],
    sentences_received: [],
    convict_offences: [],
    ...patch,
  };
}

describe("groupCohort", () => {
  it("counts one judgment once per distinct value and marks the field multi-valued", () => {
    const cohort = [
      item("a", { convict_offences: ["theft", "theft", "burglary"] }),
      item("b", { convict_offences: ["theft"] }),
    ];

    const agg = groupCohort(cohort, "convict_offences");

    expect(agg.kind).toBe("categorical");
    if (agg.kind !== "categorical") throw new Error("expected categorical");
    expect(agg.multi).toBe(true);
    expect(agg.values).toEqual([
      { value: "theft", count: 2 },
      { value: "burglary", count: 1 },
    ]);
    expect(agg.covered).toBe(2);
    expect(agg.null).toBe(0);
  });

  it("counts an empty array and a missing value as null, not as a category", () => {
    const cohort = [
      item("a", { appeal_outcome: ["outcome_appeal_dismissed"] }),
      item("b", { appeal_outcome: [] }),
      item("c", { appeal_outcome: ["", "   "] }),
    ];

    const agg = groupCohort(cohort, "appeal_outcome");
    if (agg.kind !== "categorical") throw new Error("expected categorical");

    expect(agg.values).toEqual([{ value: "outcome_appeal_dismissed", count: 1 }]);
    expect(agg.null).toBe(2);
    expect(agg.covered).toBe(1);
  });

  it("sorts by count descending with the value as a stable tie-break", () => {
    const cohort = [
      item("a", { sentences_received: ["b_two_years"] }),
      item("b", { sentences_received: ["a_one_year"] }),
      item("c", { sentences_received: ["c_life", "c_life"] }),
      item("d", { sentences_received: ["c_life"] }),
    ];

    const agg = groupCohort(cohort, "sentences_received");
    if (agg.kind !== "categorical") throw new Error("expected categorical");

    expect(agg.values.map((v) => v.value)).toEqual(["c_life", "a_one_year", "b_two_years"]);
  });

  it("keeps the top N values and folds the rest into other", () => {
    const cohort = [
      item("a", { convict_offences: ["x1", "x2", "x3"] }),
      item("b", { convict_offences: ["x1", "x2"] }),
      item("c", { convict_offences: ["x1"] }),
    ];

    const agg = groupCohort(cohort, "convict_offences", 2);
    if (agg.kind !== "categorical") throw new Error("expected categorical");

    expect(agg.values).toEqual([
      { value: "x1", count: 3 },
      { value: "x2", count: 2 },
    ]);
    expect(agg.other).toBe(1);
    expect(agg.covered).toBe(3);
  });

  it("returns a zeroed aggregate for an empty cohort", () => {
    const agg = groupCohort([], "appeal_outcome");
    if (agg.kind !== "categorical") throw new Error("expected categorical");

    expect(agg.values).toEqual([]);
    expect(agg.covered).toBe(0);
    expect(agg.null).toBe(0);
    expect(agg.other).toBe(0);
  });
});

describe("cohortIdsWithValue", () => {
  it("returns every judgment carrying the value", () => {
    const cohort = [
      item("a", { appeal_outcome: ["dismissed", "allowed"] }),
      item("b", { appeal_outcome: ["allowed"] }),
      item("c", { appeal_outcome: [] }),
    ];

    expect(cohortIdsWithValue(cohort, "appeal_outcome", "allowed")).toEqual(
      new Set(["a", "b"]),
    );
    expect(cohortIdsWithValue(cohort, "appeal_outcome", "nope").size).toBe(0);
  });
});

describe("topBucket", () => {
  it("returns the largest value bucket, or null when there is none", () => {
    const agg = groupCohort(
      [item("a", { appeal_outcome: ["dismissed"] }), item("b", { appeal_outcome: ["dismissed"] })],
      "appeal_outcome",
    );

    expect(topBucket(agg)).toEqual({ value: "dismissed", count: 2 });
    expect(topBucket(groupCohort([], "appeal_outcome"))).toBeNull();
  });
});

describe("COHORT_GROUP_FIELDS", () => {
  it("is the spec's three fields, appeal outcome first", () => {
    expect(COHORT_GROUP_FIELDS).toEqual([
      "appeal_outcome",
      "sentences_received",
      "convict_offences",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd <worktree>/frontend && npx jest __tests__/lib/precedents/cohort-grouping.test.ts
```
Expected: `Cannot find module '@/lib/precedents/cohort-grouping'`.

- [ ] **Step 3: Extend the API types**

In `frontend/lib/api/advanced.ts`, after the `PrecedentMatch` interface:

```ts
/** One raw vector candidate returned before the AI ranking pass (#724). */
export interface PrecedentCohortItem {
  document_id: string;
  similarity_score: number;
  case_number: string | null;
  title: string | null;
  jurisdiction: string | null;
  court_name: string | null;
  decision_date: string | null;
  appeal_outcome: string[];
  sentences_received: string[];
  convict_offences: string[];
}

/** A case number typed into the query box, resolved to a judgment (#724). */
export interface ResolvedCase {
  case_number: string;
  document_id: string;
  title: string | null;
}
```

and add the two fields to `FindPrecedentsResponse`:

```ts
export interface FindPrecedentsResponse {
  query: string;
  precedents: PrecedentMatch[];
  total_found: number;
  search_strategy: string;
  enhanced_query: string | null;
  cohort: PrecedentCohortItem[];
  resolved_case: ResolvedCase | null;
}
```

- [ ] **Step 4: Write the grouping module**

Create `frontend/lib/precedents/cohort-grouping.ts`:

```ts
import type { PrecedentCohortItem } from "@/lib/api/advanced";
import type { FieldAggregate } from "@/types/base-schema-filter";

/** Fields the "In similar cases…" block can group by (spec §7.2). */
export const COHORT_GROUP_FIELDS = [
  "appeal_outcome",
  "sentences_received",
  "convict_offences",
] as const;

export type CohortGroupField = (typeof COHORT_GROUP_FIELDS)[number];

/** How many distinct values a card shows before the rest folds into "other". */
const DEFAULT_TOP_N = 10;

function valuesOf(item: PrecedentCohortItem, field: CohortGroupField): string[] {
  const raw = item[field] ?? [];
  const cleaned = raw.map((v) => v.trim()).filter((v) => v.length > 0);
  return Array.from(new Set(cleaned));
}

/**
 * Group the cohort by one multi-valued base field into the same shape the
 * statistics view renders (#708), so `FieldCard` can draw it unchanged.
 *
 * A judgment counts once per distinct value it carries; one with no values at
 * all counts as `null`, never as a category.
 */
export function groupCohort(
  cohort: PrecedentCohortItem[],
  field: CohortGroupField,
  topN: number = DEFAULT_TOP_N,
): FieldAggregate {
  const counts = new Map<string, number>();
  let covered = 0;
  let missing = 0;

  for (const item of cohort) {
    const values = valuesOf(item, field);
    if (values.length === 0) {
      missing += 1;
      continue;
    }
    covered += 1;
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const sorted = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  const kept = sorted.slice(0, topN);
  const other = sorted.slice(topN).reduce((sum, v) => sum + v.count, 0);

  return { kind: "categorical", multi: true, values: kept, other, null: missing, covered };
}

/** Document ids of every cohort member carrying `value` in `field`. */
export function cohortIdsWithValue(
  cohort: PrecedentCohortItem[],
  field: CohortGroupField,
  value: string,
): Set<string> {
  const ids = new Set<string>();
  for (const item of cohort) {
    if (valuesOf(item, field).includes(value)) ids.add(item.document_id);
  }
  return ids;
}

/** The largest value bucket — the one the headline sentence talks about. */
export function topBucket(aggregate: FieldAggregate): { value: string; count: number } | null {
  if (aggregate.kind === "numeric") return null;
  return aggregate.values[0] ?? null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd <worktree>/frontend && npx jest __tests__/lib/precedents/cohort-grouping.test.ts && npm run typecheck
```
Expected: 9 tests pass; typecheck 0 errors.

- [ ] **Step 6: Commit**

```bash
cd <worktree>
git add frontend/lib/api/advanced.ts frontend/lib/precedents/cohort-grouping.ts frontend/__tests__/lib/precedents/cohort-grouping.test.ts
git commit -m "feat(precedents): cohort types and pure grouping helpers

Refs #726"
```

---

### Task 6: i18n keys for the cohort block

**Files:**
- Modify: `frontend/lib/i18n/types.ts` (`Translations` at 709-721, `TranslationKey` at 725-737), `frontend/lib/i18n/translations/en.ts`, `frontend/lib/i18n/translations/pl.ts`

**Interfaces:**
- Produces: `PrecedentsTranslations` and the `precedents` block reachable as `t("precedents.<key>")`.

**These three files are CRLF.** Before editing, run `file frontend/lib/i18n/types.ts` — it must say "with CRLF line terminators", and must still say so afterwards. Insert lines with the same ending; after committing, `git show --numstat HEAD -- frontend/lib/i18n` must show 0 deletions in each file.

- [ ] **Step 1: Write the failing test**

Create `frontend/__tests__/lib/i18n/precedents-keys.test.ts`:

```ts
import en from "@/lib/i18n/translations/en";
import pl from "@/lib/i18n/translations/pl";

const KEYS = [
  "cohortTitle",
  "cohortHeadline",
  "cohortGroupBy",
  "cohortFilterActive",
  "cohortClearFilter",
  "cohortNoRanked",
  "cohortEmpty",
  "resolvedCase",
] as const;

describe("precedents translations", () => {
  it("defines every cohort key in both locales", () => {
    for (const key of KEYS) {
      expect(typeof en.precedents[key]).toBe("string");
      expect(typeof pl.precedents[key]).toBe("string");
      expect(en.precedents[key].length).toBeGreaterThan(0);
      expect(pl.precedents[key].length).toBeGreaterThan(0);
    }
  });

  it("keeps the placeholders the headline and filter copy interpolate", () => {
    for (const locale of [en, pl]) {
      expect(locale.precedents.cohortHeadline).toContain("{{count}}");
      expect(locale.precedents.cohortHeadline).toContain("{{total}}");
      expect(locale.precedents.cohortHeadline).toContain("{{value}}");
      expect(locale.precedents.cohortFilterActive).toContain("{{value}}");
      expect(locale.precedents.cohortFilterActive).toContain("{{count}}");
      expect(locale.precedents.resolvedCase).toContain("{{caseNumber}}");
    }
  });
});
```

If `en.ts` / `pl.ts` export a named const rather than a default, import it the way the existing i18n tests in `frontend/__tests__/` do (grep for `translations/en` there first) and keep the assertions identical.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd <worktree>/frontend && npx jest __tests__/lib/i18n/precedents-keys.test.ts
```
Expected: TypeScript/runtime failure — `precedents` does not exist on the translations object.

- [ ] **Step 3: Add the interface**

In `frontend/lib/i18n/types.ts`, next to `ReasoningLinesTranslations` (interface at line 513), add:

```ts
export interface PrecedentsTranslations {
  /** Heading of the grouped cohort block (spec §7.2). */
  cohortTitle: string;
  cohortHeadline: string;
  cohortGroupBy: string;
  cohortFilterActive: string;
  cohortClearFilter: string;
  cohortNoRanked: string;
  cohortEmpty: string;
  resolvedCase: string;
}
```

Add `precedents: PrecedentsTranslations;` to the `Translations` interface (709-721) and `` | `precedents.${keyof PrecedentsTranslations}` `` to the `TranslationKey` union (725-737), matching the exact style of the neighbouring entries in both places.

- [ ] **Step 4: Add the copy**

`frontend/lib/i18n/translations/en.ts`, as a new `precedents:` block placed after the `reasoningLines:` block (starts at line 450):

```ts
  precedents: {
    cohortTitle: 'In similar cases…',
    cohortHeadline: 'In {{count}} of {{total}} similar cases: {{value}}',
    cohortGroupBy: 'Group by',
    cohortFilterActive: 'Filtered to {{value}} · {{count}} of the ranked results',
    cohortClearFilter: 'Clear filter',
    cohortNoRanked: 'No ranked precedent carries this value — it appears elsewhere in the similar-case cohort.',
    cohortEmpty: 'No similar cases carry a value for this field.',
    resolvedCase: 'Matched case {{caseNumber}} — showing judgments similar to it.',
  },
```

`frontend/lib/i18n/translations/pl.ts`, same position:

```ts
  precedents: {
    cohortTitle: 'W podobnych sprawach…',
    cohortHeadline: 'W {{count}} z {{total}} podobnych spraw: {{value}}',
    cohortGroupBy: 'Grupuj według',
    cohortFilterActive: 'Filtr: {{value}} · {{count}} z wyników rankingu',
    cohortClearFilter: 'Wyczyść filtr',
    cohortNoRanked: 'Żaden z orzeczeń w rankingu nie ma tej wartości — występuje w pozostałej części kohorty podobnych spraw.',
    cohortEmpty: 'Żadna z podobnych spraw nie ma wartości dla tego pola.',
    resolvedCase: 'Dopasowano sprawę {{caseNumber}} — pokazuję orzeczenia podobne do niej.',
  },
```

- [ ] **Step 5: Run the tests and the line-ending check**

```bash
cd <worktree>/frontend
npx jest __tests__/lib/i18n
npm run typecheck
file lib/i18n/types.ts lib/i18n/translations/en.ts lib/i18n/translations/pl.ts
```
Expected: i18n suites pass, typecheck 0, all three files still report "with CRLF line terminators".

- [ ] **Step 6: Commit**

```bash
cd <worktree>
git add frontend/lib/i18n/types.ts frontend/lib/i18n/translations/en.ts frontend/lib/i18n/translations/pl.ts frontend/__tests__/lib/i18n/precedents-keys.test.ts
git commit -m "feat(i18n): precedents cohort copy in English and Polish

Refs #726"
git show --numstat HEAD -- frontend/lib/i18n   # must show 0 deletions per file
```

---

### Task 7: The `CohortInsights` block

**Files:**
- Create: `frontend/app/precedents/_components/CohortInsights.tsx`
- Test: `frontend/__tests__/app/precedents/CohortInsights.test.tsx`

**Interfaces:**
- Consumes: `groupCohort`, `cohortIdsWithValue`, `topBucket`, `COHORT_GROUP_FIELDS`, `CohortGroupField` (Task 5); `FieldCard` (`frontend/app/search/extractions/_components/FieldCard.tsx`, props `{ field, aggregate, sampleN, yAxis, onBarClick?, onRemove? }`); `aggregateFieldLabel` (`frontend/lib/extractions/aggregate-fields.ts`); `useTranslation` (`@/contexts/LanguageContext`).
- Produces:
  ```ts
  export interface CohortFilter { field: CohortGroupField; value: string }
  export interface CohortInsightsProps {
    cohort: PrecedentCohortItem[];
    filter: CohortFilter | null;
    filteredRankedCount: number;
    onFilterChange: (filter: CohortFilter | null) => void;
  }
  export function CohortInsights(props: CohortInsightsProps): JSX.Element | null
  ```

- [ ] **Step 1: Write the failing tests**

Create `frontend/__tests__/app/precedents/CohortInsights.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values
        ? `${key}:${Object.entries(values)
            .map(([k, v]) => `${k}=${v}`)
            .join(",")}`
        : key,
  }),
}));

jest.mock("@/components/charts", () => ({
  HorizontalBarChart: (props: {
    items: { name: string; count: number }[];
    onBarClick?: (name: string) => void;
  }) => (
    <div data-testid="chart">
      {props.items.map((i) => (
        <button key={i.name} onClick={() => props.onBarClick?.(i.name)}>
          {i.name}: {i.count}
        </button>
      ))}
    </div>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CohortInsights } = require("@/app/precedents/_components/CohortInsights");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { makeCohort } = require("./cohort-fixture");

describe("CohortInsights", () => {
  it("renders the headline from the biggest bucket", () => {
    render(
      <CohortInsights
        cohort={makeCohort()}
        filter={null}
        filteredRankedCount={0}
        onFilterChange={() => {}}
      />,
    );

    expect(
      screen.getByText("precedents.cohortHeadline:count=3,total=5,value=dismissed"),
    ).toBeInTheDocument();
  });

  it("groups by a different field when the selector changes", () => {
    render(
      <CohortInsights
        cohort={makeCohort()}
        filter={null}
        filteredRankedCount={0}
        onFilterChange={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("precedents.cohortGroupBy"), {
      target: { value: "convict_offences" },
    });

    expect(screen.getByRole("button", { name: "theft: 2" })).toBeInTheDocument();
  });

  it("reports a bar click as a filter on the active field", () => {
    const onFilterChange = jest.fn();
    render(
      <CohortInsights
        cohort={makeCohort()}
        filter={null}
        filteredRankedCount={0}
        onFilterChange={onFilterChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "dismissed: 3" }));

    expect(onFilterChange).toHaveBeenCalledWith({
      field: "appeal_outcome",
      value: "dismissed",
    });
  });

  it("shows the active filter with a clear control", () => {
    const onFilterChange = jest.fn();
    render(
      <CohortInsights
        cohort={makeCohort()}
        filter={{ field: "appeal_outcome", value: "dismissed" }}
        filteredRankedCount={2}
        onFilterChange={onFilterChange}
      />,
    );

    expect(
      screen.getByText("precedents.cohortFilterActive:value=dismissed,count=2"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "precedents.cohortClearFilter" }));
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });

  it("warns when the filter matches no ranked precedent", () => {
    render(
      <CohortInsights
        cohort={makeCohort()}
        filter={{ field: "appeal_outcome", value: "dismissed" }}
        filteredRankedCount={0}
        onFilterChange={() => {}}
      />,
    );

    expect(screen.getByText("precedents.cohortNoRanked")).toBeInTheDocument();
  });

  it("renders nothing for an empty cohort", () => {
    const { container } = render(
      <CohortInsights cohort={[]} filter={null} filteredRankedCount={0} onFilterChange={() => {}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
```

Create the shared fixture `frontend/__tests__/app/precedents/cohort-fixture.ts` (used by this task and Task 8):

```ts
import type { PrecedentCohortItem } from "@/lib/api/advanced";

function item(id: string, patch: Partial<PrecedentCohortItem> = {}): PrecedentCohortItem {
  return {
    document_id: id,
    similarity_score: 0.7,
    case_number: `case-${id}`,
    title: `Judgment ${id}`,
    jurisdiction: "UK",
    court_name: "Court of Appeal",
    decision_date: "2023-01-01",
    appeal_outcome: [],
    sentences_received: [],
    convict_offences: [],
    ...patch,
  };
}

/** Five judgments: 3 dismissed, 1 allowed, 1 with no outcome; 2 carry "theft". */
export function makeCohort(): PrecedentCohortItem[] {
  return [
    item("d1", { appeal_outcome: ["dismissed"], convict_offences: ["theft"] }),
    item("d2", { appeal_outcome: ["dismissed"], convict_offences: ["theft"] }),
    item("d3", { appeal_outcome: ["dismissed"] }),
    item("a1", { appeal_outcome: ["allowed"], convict_offences: ["burglary"] }),
    item("n1", {}),
  ];
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd <worktree>/frontend && npx jest __tests__/app/precedents/CohortInsights.test.tsx
```
Expected: `Cannot find module '@/app/precedents/_components/CohortInsights'`.

- [ ] **Step 3: Write the component**

Create `frontend/app/precedents/_components/CohortInsights.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";

import { useTranslation } from "@/contexts/LanguageContext";
import { aggregateFieldLabel } from "@/lib/extractions/aggregate-fields";
import type { PrecedentCohortItem } from "@/lib/api/advanced";
import {
  COHORT_GROUP_FIELDS,
  type CohortGroupField,
  groupCohort,
  topBucket,
} from "@/lib/precedents/cohort-grouping";
import { FieldCard } from "@/app/search/extractions/_components/FieldCard";

export interface CohortFilter {
  field: CohortGroupField;
  value: string;
}

export interface CohortInsightsProps {
  cohort: PrecedentCohortItem[];
  filter: CohortFilter | null;
  /** How many of the ranked precedents survive the active filter. */
  filteredRankedCount: number;
  onFilterChange: (filter: CohortFilter | null) => void;
}

/**
 * "In similar cases…" — the Explore chart over a similarity cohort instead of a
 * filter cohort (spec §7.2). Grouping is client-side; the backend only supplies
 * the raw candidates.
 */
export function CohortInsights({
  cohort,
  filter,
  filteredRankedCount,
  onFilterChange,
}: CohortInsightsProps) {
  const { t } = useTranslation();
  const [field, setField] = useState<CohortGroupField>(COHORT_GROUP_FIELDS[0]);

  const aggregate = useMemo(() => groupCohort(cohort, field), [cohort, field]);
  const headline = topBucket(aggregate);

  if (cohort.length === 0) return null;

  return (
    <section
      className="border border-[color:var(--rule)] bg-[color:var(--parchment)] p-4"
      aria-label={t("precedents.cohortTitle")}
      data-testid="cohort-insights"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg text-[color:var(--ink)]">
          {t("precedents.cohortTitle")}
        </h2>
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
          {t("precedents.cohortGroupBy")}
          <select
            aria-label={t("precedents.cohortGroupBy")}
            value={field}
            onChange={(e) => {
              setField(e.target.value as CohortGroupField);
              onFilterChange(null);
            }}
            className="border border-[color:var(--rule)] bg-[color:var(--parchment)] px-2 py-1 text-[color:var(--ink)]"
          >
            {COHORT_GROUP_FIELDS.map((f) => (
              <option key={f} value={f}>
                {aggregateFieldLabel(f)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {headline ? (
        <p className="mb-3 font-serif text-base text-[color:var(--ink)]">
          {t("precedents.cohortHeadline", {
            count: headline.count,
            total: cohort.length,
            value: headline.value,
          })}
        </p>
      ) : (
        <p className="mb-3 text-sm text-[color:var(--ink-soft)]">{t("precedents.cohortEmpty")}</p>
      )}

      <FieldCard
        field={field}
        aggregate={aggregate}
        sampleN={cohort.length}
        yAxis="count"
        onBarClick={(clickedField, value) =>
          onFilterChange({ field: clickedField as CohortGroupField, value })
        }
      />

      {filter && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] text-[color:var(--ink-soft)]">
            {t("precedents.cohortFilterActive", {
              value: filter.value,
              count: filteredRankedCount,
            })}
          </span>
          <button
            type="button"
            onClick={() => onFilterChange(null)}
            className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)] underline hover:text-[color:var(--ink)]"
          >
            {t("precedents.cohortClearFilter")}
          </button>
        </div>
      )}

      {filter && filteredRankedCount === 0 && (
        <p className="mt-2 text-sm text-[color:var(--ink-soft)]">{t("precedents.cohortNoRanked")}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd <worktree>/frontend
npx jest __tests__/app/precedents/CohortInsights.test.tsx
npm run typecheck
npx eslint --max-warnings 0 app/precedents/_components/CohortInsights.tsx __tests__/app/precedents
```
Expected: 6 tests pass; typecheck 0; eslint clean.

- [ ] **Step 5: Commit**

```bash
cd <worktree>
git add frontend/app/precedents/_components/CohortInsights.tsx frontend/__tests__/app/precedents/CohortInsights.test.tsx frontend/__tests__/app/precedents/cohort-fixture.ts
git commit -m "feat(precedents): In similar cases block over the vector cohort

Refs #726"
```

---

### Task 8: Page integration — filtered list and resolved-case banner

**Files:**
- Modify: `frontend/app/precedents/page.tsx` (state at 158-170; results block at 380-420)
- Test: `frontend/__tests__/app/precedents/precedents-cohort.test.tsx`

**Interfaces:**
- Consumes: `CohortInsights`, `CohortFilter` (Task 7); `cohortIdsWithValue` (Task 5); `FindPrecedentsResponse.cohort` / `.resolved_case` (Task 5).
- Produces: no new exports — the page keeps `export default function PrecedentsPage()`.

- [ ] **Step 1: Write the failing test**

Create `frontend/__tests__/app/precedents/precedents-cohort.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockFindPrecedents = jest.fn();

jest.mock("@/lib/api", () => ({
  findPrecedents: (...args: unknown[]) => mockFindPrecedents(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values
        ? `${key}:${Object.entries(values)
            .map(([k, v]) => `${k}=${v}`)
            .join(",")}`
        : key,
  }),
}));

jest.mock("@/components/charts", () => ({
  HorizontalBarChart: (props: {
    items: { name: string; count: number }[];
    onBarClick?: (name: string) => void;
  }) => (
    <div data-testid="chart">
      {props.items.map((i) => (
        <button key={i.name} onClick={() => props.onBarClick?.(i.name)}>
          {i.name}: {i.count}
        </button>
      ))}
    </div>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PrecedentsPage = require("@/app/precedents/page").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { makeCohort } = require("./cohort-fixture");

function precedent(id: string) {
  return {
    document_id: id,
    title: `Judgment ${id}`,
    document_type: "judgment",
    date_issued: "2023-01-01",
    court_name: "Court of Appeal",
    outcome: null,
    legal_bases: null,
    summary: null,
    similarity_score: 0.7,
    relevance_score: null,
    matching_factors: [],
    relevance_explanation: null,
  };
}

async function search(response: Record<string, unknown>) {
  mockFindPrecedents.mockResolvedValueOnce(response);
  render(<PrecedentsPage />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "a juvenile drug appeal with three co-defendants" },
  });
  fireEvent.click(screen.getByRole("button", { name: /find precedents/i }));
  await waitFor(() => expect(mockFindPrecedents).toHaveBeenCalled());
}

beforeEach(() => mockFindPrecedents.mockReset());

describe("precedents page — cohort block", () => {
  it("renders the block above the ranked list", async () => {
    await search({
      query: "q",
      precedents: [precedent("d1")],
      total_found: 1,
      search_strategy: "semantic_similarity",
      enhanced_query: null,
      cohort: makeCohort(),
      resolved_case: null,
    });

    expect(await screen.findByTestId("cohort-insights")).toBeInTheDocument();
  });

  it("filters the ranked list to the judgments carrying the clicked value", async () => {
    await search({
      query: "q",
      precedents: [precedent("d1"), precedent("a1")],
      total_found: 2,
      search_strategy: "semantic_similarity",
      enhanced_query: null,
      cohort: makeCohort(),
      resolved_case: null,
    });

    expect(await screen.findByText("Judgment a1")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "dismissed: 3" }));

    await waitFor(() => expect(screen.queryByText("Judgment a1")).not.toBeInTheDocument());
    expect(screen.getByText("Judgment d1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "precedents.cohortClearFilter" }));
    await waitFor(() => expect(screen.getByText("Judgment a1")).toBeInTheDocument());
  });

  it("shows the resolved-case banner when the query matched a docket", async () => {
    await search({
      query: "III CSK 245/22",
      precedents: [],
      total_found: 0,
      search_strategy: "semantic_similarity",
      enhanced_query: null,
      cohort: [],
      resolved_case: { case_number: "III CSK 245/22", document_id: "uuid", title: "A v B" },
    });

    expect(
      await screen.findByText("precedents.resolvedCase:caseNumber=III CSK 245/22"),
    ).toBeInTheDocument();
  });

  it("renders no block when the cohort is empty", async () => {
    await search({
      query: "q",
      precedents: [precedent("d1")],
      total_found: 1,
      search_strategy: "semantic_similarity",
      enhanced_query: null,
      cohort: [],
      resolved_case: null,
    });

    expect(await screen.findByText("Judgment d1")).toBeInTheDocument();
    expect(screen.queryByTestId("cohort-insights")).not.toBeInTheDocument();
  });
});
```

If the submit button's accessible name differs from `/find precedents/i`, read `frontend/app/precedents/page.tsx:257-268` and use the actual label — do not change the page's copy to satisfy the test.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd <worktree>/frontend && npx jest __tests__/app/precedents/precedents-cohort.test.tsx
```
Expected: the cohort-block assertions fail (`Unable to find an element by: [data-testid="cohort-insights"]`).

- [ ] **Step 3: Wire the page**

In `frontend/app/precedents/page.tsx`:

Add the imports next to the existing ones:

```tsx
import { useTranslation } from '@/contexts/LanguageContext';
import { CohortInsights, type CohortFilter } from '@/app/precedents/_components/CohortInsights';
import { cohortIdsWithValue } from '@/lib/precedents/cohort-grouping';
```

Inside `PrecedentsPage`, next to the other `useState` calls (lines 159-170):

```tsx
  const { t } = useTranslation();
  const [cohortFilter, setCohortFilter] = useState<CohortFilter | null>(null);
```

In `handleSearch`, immediately after `setResults(response);`, drop a stale filter:

```tsx
      setCohortFilter(null);
```

Above the `return (`, derive the filtered list (`useMemo` imported from React):

```tsx
  const cohort = results?.cohort ?? [];
  const visiblePrecedents = useMemo(() => {
    if (!results) return [];
    if (!cohortFilter) return results.precedents;
    const ids = cohortIdsWithValue(cohort, cohortFilter.field, cohortFilter.value);
    return results.precedents.filter((p) => ids.has(p.document_id));
  }, [results, cohort, cohortFilter]);
```

In the results block (line 380 onwards), render the banner and the block **above** the results header, and map over `visiblePrecedents` instead of `results.precedents` (line 405):

```tsx
          {results.resolved_case && (
            <p
              className="border border-rule bg-parchment-deep px-3 py-2 font-mono text-xs text-ink-soft"
              role="status"
            >
              {t('precedents.resolvedCase', { caseNumber: results.resolved_case.case_number })}
            </p>
          )}

          <CohortInsights
            cohort={cohort}
            filter={cohortFilter}
            filteredRankedCount={visiblePrecedents.length}
            onFilterChange={setCohortFilter}
          />
```

```tsx
          {visiblePrecedents.length > 0 ? (
            <div className="space-y-3">
              {visiblePrecedents.map((precedent, idx) => (
                <PrecedentResultCard
                  key={precedent.document_id}
                  precedent={precedent}
                  rank={idx + 1}
                  onViewDocument={handleViewDocument}
                />
              ))}
            </div>
          ) : (
```

Leave the existing "N Precedents Found" header reading `results.total_found` — it describes the search, not the filtered view; the active-filter chip inside the block reports the filtered count.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd <worktree>/frontend
npx jest __tests__/app/precedents
npm run typecheck
npx eslint --max-warnings 0 app/precedents
```
Expected: both precedents suites pass (10 tests), typecheck 0, eslint clean.

- [ ] **Step 5: Commit**

```bash
cd <worktree>
git add frontend/app/precedents/page.tsx frontend/__tests__/app/precedents/precedents-cohort.test.tsx
git commit -m "feat(precedents): render the cohort block and filter the ranked list

Refs #726"
```

---

### Task 9: Route-contract E2E, full gate, PR, merge

**Files:**
- Modify: `frontend/tests/route-contract-e2e/stub-services.mjs`
- Create: `frontend/tests/route-contract-e2e/precedents-cohort.spec.ts`

- [ ] **Step 1: Stub the endpoint**

The harness stubs no precedents route today (grep `precedent` in `stub-services.mjs` → no match). Add a branch next to the other POST stubs, **before** the unhandled-request catch-all (`'unexpected route-contract request'`), using the file's own `sendJson(response, status, body)` helper:

```js
  if (request.method === 'POST' && url.pathname === '/precedents/find') {
    request.resume();
    return sendJson(response, 200, {
      query: 'a juvenile drug appeal with three co-defendants',
      precedents: [
        {
          document_id: 'p-dismissed',
          title: 'R v Dismissed',
          document_type: 'judgment',
          date_issued: '2023-01-01',
          court_name: 'Court of Appeal',
          outcome: null,
          legal_bases: null,
          summary: null,
          similarity_score: 0.82,
          relevance_score: null,
          matching_factors: [],
          relevance_explanation: null,
        },
        {
          document_id: 'p-allowed',
          title: 'R v Allowed',
          document_type: 'judgment',
          date_issued: '2022-06-01',
          court_name: 'Court of Appeal',
          outcome: null,
          legal_bases: null,
          summary: null,
          similarity_score: 0.71,
          relevance_score: null,
          matching_factors: [],
          relevance_explanation: null,
        },
      ],
      total_found: 2,
      search_strategy: 'semantic_similarity',
      enhanced_query: null,
      cohort: [
        { document_id: 'p-dismissed', similarity_score: 0.82, case_number: 'C-1', title: 'R v Dismissed', jurisdiction: 'UK', court_name: 'Court of Appeal', decision_date: '2023-01-01', appeal_outcome: ['dismissed'], sentences_received: [], convict_offences: ['theft'] },
        { document_id: 'c-2', similarity_score: 0.78, case_number: 'C-2', title: 'R v Two', jurisdiction: 'UK', court_name: 'Court of Appeal', decision_date: '2023-02-01', appeal_outcome: ['dismissed'], sentences_received: [], convict_offences: [] },
        { document_id: 'c-3', similarity_score: 0.74, case_number: 'C-3', title: 'R v Three', jurisdiction: 'UK', court_name: 'Court of Appeal', decision_date: '2023-03-01', appeal_outcome: ['dismissed'], sentences_received: [], convict_offences: [] },
        { document_id: 'p-allowed', similarity_score: 0.71, case_number: 'C-4', title: 'R v Allowed', jurisdiction: 'UK', court_name: 'Court of Appeal', decision_date: '2022-06-01', appeal_outcome: ['allowed'], sentences_received: [], convict_offences: ['burglary'] },
      ],
      resolved_case: null,
    });
  }
```

- [ ] **Step 2: Write the spec**

Create `frontend/tests/route-contract-e2e/precedents-cohort.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { expectNoUnexpectedStubRequests, setSyntheticSession } from './synthetic-session';

test.describe('precedents cohort', () => {
  test('renders the grouped block and filters the ranked list', async ({ page, context }) => {
    await setSyntheticSession(context);
    await page.goto('/precedents');

    await page.getByRole('textbox').fill('a juvenile drug appeal with three co-defendants');
    await page.getByRole('button', { name: /find precedents/i }).click();

    const block = page.getByTestId('cohort-insights');
    await expect(block).toBeVisible();
    // 3 of the 4 cohort members were dismissed — the headline names that bucket.
    await expect(block).toContainText('3');
    await expect(block).toContainText('4');

    await expect(page.getByText('R v Allowed')).toBeVisible();

    await block.getByText('dismissed', { exact: true }).click();

    await expect(page.getByText('R v Allowed')).toHaveCount(0);
    await expect(page.getByText('R v Dismissed')).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await expectNoUnexpectedStubRequests(page);
  });
});
```

Adjust the `afterEach` shape to whatever `synthetic-session.ts` exposes (`frontend/tests/route-contract-e2e/statistics-view.spec.ts` is the working precedent — copy its wiring). The bar label is rendered by Plotly as SVG text; if that lookup proves flaky, assert the block's `aria-label`d section and its headline text only, and say so in the report.

- [ ] **Step 3: Run the route-contract suite**

```bash
cd <worktree>/frontend
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4311 NEXT_PUBLIC_SUPABASE_ANON_KEY=route-contract-anon \
       NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4311 API_BASE_URL=http://127.0.0.1:4311 \
       BACKEND_API_KEY=route-contract-backend-key NEXT_TELEMETRY_DISABLED=1
npm run build && npm run test:e2e:route-contract
npm run lint:route-contract-harness
```
Expected: every spec passes (the suite was 17 tests before this branch; it becomes 18). Quote the Playwright summary line in the PR body.

- [ ] **Step 4: Full gate**

```bash
cd <worktree>/frontend
npx jest                # full suite
npm run validate        # deps:check + document types + banned classes + lint
npm run typecheck
```
Expected: Jest green, `validate` exit 0 (79 pre-existing warnings, 0 errors), typecheck 0.

Run the palette validator over the two card colours and record the output in the PR body, with the same ruling as #719 (the grey is a neutral for "other"/"missing" rows on a single-hue chart, and every row carries its own label):

```bash
node /tmp/claude-1000/bundled-skills/*/dataviz/scripts/validate_palette.js "#9A342D,#5A5A5A" --mode light
```

- [ ] **Step 5: Commit, review, push, PR**

```bash
cd <worktree>
git add frontend/tests/route-contract-e2e/stub-services.mjs frontend/tests/route-contract-e2e/precedents-cohort.spec.ts
git commit -m "test(precedents): route-contract spec for the cohort block

Refs #726"
```

Spawn a reviewer on `git diff origin/main...HEAD`, then:

```bash
git push -u origin feat/726-cohort-block
gh pr create --base main \
  --title "feat(precedents): In similar cases block over the vector cohort" \
  --body-file <body>
```

PR body: what the block does and where the grouping lives (pure module, no backend grouping); the bar-filter semantics including the "value is in the cohort but not in the ranked top-N" message; the i18n note (only new copy is keyed; the page's existing copy is untouched); test summary incl. the Playwright line; `Closes #726`, `Refs #687 #724`; and a pointer to #728 for the §7.3 continue actions.

- [ ] **Step 6: Merge and close out**

When the seven required checks are green:

```bash
gh pr merge <n> --merge --delete-branch
git -C <main checkout> worktree remove .worktrees/feat-726-cohort-block
gh issue comment 687 --body "Phase D shipped: #724 (cohort + case-number resolution) and #726 (the \"In similar cases…\" block). Spec §7.3 continue actions remain open in #728."
```

---

## Self-review

**Spec coverage (§7):**

| Spec item | Task |
|---|---|
| §7.1 cohort exposed separately, top-100 candidates, before the LLM pass, `id` + `similarity_score` + base fields joined from `judgments` | Tasks 1–2 |
| §7.1 cohort available while #546 blocks the LLM step | Task 2 (built before `_build_analysis_map`; the LLM path already degrades silently) |
| §7.1 case number detected, resolved, passed as `document_id` | Task 3 |
| §7.2 "In similar cases…" block, grouped client-side, default `base_appeal_outcome`, switchable to the other two | Tasks 5, 7 |
| §7.2 same `HorizontalBarChart` as Phase B, headline sentence | Task 7 (via `FieldCard`) |
| §7.2 each bar filters the list below | Task 8 |
| §7.2 backend change limited to the `cohort` field | Task 2 (plus `resolved_case`, which §7.1 requires) |
| §7.4 grouping unit test over a fixture with nulls and multi-valued fields | Task 5 |
| §7.4 case-number detection unit test (PL and UK patterns) | Task 3 |
| §7.4 E2E: the page renders the grouped block for a logged-in user against a stubbed search response | Task 9 |
| §7.3 continue actions | **Deferred to #728** — see Non-goals |

**Type consistency:** `PrecedentCohortItem` carries the identical ten field names in `backend/app/precedents.py` (Task 2), `frontend/lib/api/advanced.ts` (Task 5), the test fixtures (Tasks 5, 7) and the E2E stub (Task 9). `CohortGroupField` values (`appeal_outcome`, `sentences_received`, `convict_offences`) are the same strings the backend emits and the same keys `aggregateFieldLabel` resolves. `CohortFilter { field, value }` is produced by `CohortInsights` (Task 7) and consumed by the page (Task 8). `groupCohort` returns the `categorical` arm of `FieldAggregate`, which is exactly what `FieldCard` renders.

**Placeholder scan:** no "TBD", no "add error handling", no "similar to Task N" — every code step carries the code to write and every test step the assertions to run.
