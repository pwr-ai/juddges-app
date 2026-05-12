# LLM Query Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an LLM-based query rewriter to the "thinking" search mode that returns a cleaned query string plus structured filters validated against Meilisearch's live facet vocabulary, applied silently through the existing `useSearchStore`.

**Architecture:** One LLM call (`gpt-5-mini`, structured output via Pydantic) inside a new `query_rewrite_chain`, followed by a `FacetValidator` that round-trips open-vocab arrays through Meilisearch facet-search. Exposed as a plain FastAPI POST endpoint on the existing judgments router (`/documents/search/rewrite`), proxied through a new Next.js BFF route, consumed by a new `useQueryRewrite` hook that hydrates the search store before the regular Meili search fires.

**Tech Stack:** Python 3.12, LangChain, LangChain-OpenAI structured outputs, FastAPI, Pydantic v2, cachetools.TTLCache, Meilisearch, Next.js 15 App Router, Zustand, React Query, Zod, Jest, Playwright, pytest.

**Spec:** [`docs/superpowers/specs/2026-05-12-llm-query-rewrite-design.md`](../specs/2026-05-12-llm-query-rewrite-design.md)

---

## File structure

### Create

| Path | Purpose |
|---|---|
| `backend/packages/juddges_search/juddges_search/chains/query_rewrite_models.py` | Pydantic schema for LLM structured output (enums + numeric ranges + ISO dates) |
| `backend/packages/juddges_search/juddges_search/chains/query_rewrite.py` | LangChain Runnable: prompt → `with_structured_output(QueryRewriteResult)` |
| `backend/packages/juddges_search/tests/test_query_rewrite_chain.py` | Unit tests with `FakeListLLM` and JSON-shaped outputs |
| `backend/app/services/facet_validation.py` | `FacetValidator` — canonicalises arrays via Meili facet-search, clamps numerics, normalises langs/dates |
| `backend/app/judgments_pkg/query_rewrite.py` | `RewrittenQueryEnvelope` + route handler (registered on `documents_router`) |
| `backend/tests/app/test_facet_validation.py` | Unit tests for the validator |
| `backend/tests/app/test_query_rewrite_route.py` | Route-level tests (chain + validator mocked) |
| `frontend/types/query-rewrite.ts` | TS types for `RewrittenQueryEnvelope` |
| `frontend/lib/validation/query-rewrite-schema.ts` | Zod schemas for request/response |
| `frontend/app/api/query_rewrite/route.ts` | Next.js BFF (passes request to backend, maps errors with `AppError`) |
| `frontend/hooks/useQueryRewrite.ts` | Hook that runs the BFF call, applies envelope to `useSearchStore`, returns telemetry |
| `frontend/__tests__/hooks/useQueryRewrite.test.ts` | Jest tests for the hook |
| `frontend/__tests__/e2e/query-rewrite.spec.ts` | Playwright scenario |

### Modify

| Path | Change |
|---|---|
| `backend/app/services/meilisearch_config.py` | Add `MEILISEARCH_FACET_VOCABULARY` constant + helpers |
| `backend/app/services/search.py` | Add `MeiliSearchService.facet_search()` method |
| `backend/packages/juddges_search/juddges_search/chains/__init__.py` | Export `query_rewrite_chain` |
| `backend/app/judgments_pkg/__init__.py` | Import and mount `/search/rewrite` route |
| `frontend/hooks/useSearchResults.ts` | When `searchType === "thinking"`, call `useQueryRewrite.run()` before the search request |

---

## Pre-flight

- [ ] **Step 0a: Sync with main and create the feature branch**

```bash
git fetch origin
git switch -c feat/llm-query-rewrite origin/main
```

- [ ] **Step 0b: Verify required tooling exists**

```bash
cd backend && poetry run python -c "import cachetools; print(cachetools.__version__)"
cd ../frontend && npx --yes jest --version
```

Expected: cachetools prints a version (already a dep); jest prints 29.x or 30.x.

---

## Task 1 — Facet vocabulary constants

**Why:** Both the Pydantic schema (Task 2) and the validator (Task 5–7) need a single source of truth for which categorical values are legal. Hard-coded enums get out of sync; deriving them from one constant is the only sane option.

**Files:**
- Modify: `backend/app/services/meilisearch_config.py`
- Test: `backend/tests/app/test_meilisearch_config_vocab.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/app/test_meilisearch_config_vocab.py`:

```python
"""Vocabulary constants exposed by meilisearch_config."""

import pytest

from app.services.meilisearch_config import (
    MEILISEARCH_FACET_VOCABULARY,
    MEILISEARCH_NUMERIC_FACETS,
    MEILISEARCH_OPEN_ARRAY_FACETS,
)


@pytest.mark.unit
def test_facet_vocab_covers_all_filterable_categoricals():
    expected = {
        "jurisdiction",
        "court_level",
        "case_type",
        "decision_type",
        "outcome",
    }
    assert expected.issubset(MEILISEARCH_FACET_VOCABULARY.keys())
    for field, values in MEILISEARCH_FACET_VOCABULARY.items():
        assert isinstance(values, tuple)
        assert all(isinstance(v, str) and v for v in values)
        assert len(values) == len(set(values)), f"duplicates in {field}"


@pytest.mark.unit
def test_numeric_facets_list_matches_base_columns():
    assert MEILISEARCH_NUMERIC_FACETS == (
        "base_num_victims",
        "base_victim_age_offence",
        "base_case_number",
        "base_co_def_acc_num",
        "base_date_of_appeal_court_judgment_ts",
    )


@pytest.mark.unit
def test_open_array_facets_match_filterable_attributes():
    assert set(MEILISEARCH_OPEN_ARRAY_FACETS) == {
        "keywords",
        "legal_topics",
        "cited_legislation",
    }
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && poetry run pytest tests/app/test_meilisearch_config_vocab.py -v
```

Expected: ImportError — `MEILISEARCH_FACET_VOCABULARY` is not defined.

- [ ] **Step 3: Add the constants**

Append to `backend/app/services/meilisearch_config.py` after the existing settings dict:

```python
# Vocabulary contracts shared by the LLM query rewriter and the facet
# validator. Keep these in this file so a settings change forces a code
# change in the prompt/schema at the same time.

MEILISEARCH_FACET_VOCABULARY: dict[str, tuple[str, ...]] = {
    "jurisdiction": ("PL", "UK"),
    "court_level": (
        "supreme",
        "constitutional",
        "appellate",
        "regional",
        "district",
        "local",
        "administrative",
    ),
    "case_type": ("criminal", "civil", "administrative", "commercial"),
    "decision_type": ("judgment", "order", "resolution"),
    "outcome": ("granted", "dismissed", "partial", "remanded"),
}

MEILISEARCH_NUMERIC_FACETS: tuple[str, ...] = (
    "base_num_victims",
    "base_victim_age_offence",
    "base_case_number",
    "base_co_def_acc_num",
    "base_date_of_appeal_court_judgment_ts",
)

MEILISEARCH_OPEN_ARRAY_FACETS: tuple[str, ...] = (
    "keywords",
    "legal_topics",
    "cited_legislation",
)
```

> The categorical value lists above are seeded from the values currently
> present in the production Meili index. Confirm them with
> `MeiliSearchService.facet_search(<field>, "", limit=50)` before merging
> if the index has drifted.

- [ ] **Step 4: Run test, verify it passes**

```bash
cd backend && poetry run pytest tests/app/test_meilisearch_config_vocab.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/meilisearch_config.py backend/tests/app/test_meilisearch_config_vocab.py
git commit -m "feat(search): vocabulary constants for query rewriter"
```

---

## Task 2 — `QueryRewriteResult` Pydantic schema

**Files:**
- Create: `backend/packages/juddges_search/juddges_search/chains/query_rewrite_models.py`
- Test: `backend/packages/juddges_search/tests/test_query_rewrite_models.py`

- [ ] **Step 1: Write the failing test**

Create `backend/packages/juddges_search/tests/test_query_rewrite_models.py`:

```python
"""Pydantic schema for the LLM query rewriter."""

from datetime import date

import pytest
from pydantic import ValidationError

from juddges_search.chains.query_rewrite_models import (
    DateRange,
    NumericRange,
    QueryRewriteResult,
)


@pytest.mark.unit
def test_minimal_valid_payload():
    payload = QueryRewriteResult(rewritten_query="VAT contracts")
    assert payload.rewritten_query == "VAT contracts"
    assert payload.jurisdiction is None
    assert payload.keywords == []
    assert payload.base_num_victims is None


@pytest.mark.unit
def test_numeric_range_requires_min_le_max():
    NumericRange(min=1, max=5)  # ok
    with pytest.raises(ValidationError):
        NumericRange(min=10, max=1)


@pytest.mark.unit
def test_date_range_requires_from_le_to():
    DateRange(from_=date(2020, 1, 1), to=date(2024, 12, 31))  # ok
    with pytest.raises(ValidationError):
        DateRange(from_=date(2024, 1, 1), to=date(2020, 1, 1))


@pytest.mark.unit
def test_categorical_enum_rejects_unknown():
    with pytest.raises(ValidationError):
        QueryRewriteResult(rewritten_query="x", jurisdiction="FR")


@pytest.mark.unit
def test_arrays_capped_to_six_values():
    payload = QueryRewriteResult(
        rewritten_query="x",
        keywords=["a", "b", "c", "d", "e", "f", "g"],
    )
    assert len(payload.keywords) == 6
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && poetry run pytest packages/juddges_search/tests/test_query_rewrite_models.py -v
```

Expected: ImportError on `query_rewrite_models`.

- [ ] **Step 3: Implement the schema**

Create `backend/packages/juddges_search/juddges_search/chains/query_rewrite_models.py`:

```python
"""Pydantic schema for the LLM query rewriter's structured output."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class NumericRange(BaseModel):
    """Closed numeric range used for base_* range filters."""

    model_config = ConfigDict(extra="forbid")

    min: float | None = Field(default=None)
    max: float | None = Field(default=None)

    @model_validator(mode="after")
    def _check_bounds(self) -> "NumericRange":
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("min must be <= max")
        return self


class DateRange(BaseModel):
    """ISO-8601 date range used for decision_date filters."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: date | None = Field(default=None, alias="from")
    to: date | None = Field(default=None)

    @model_validator(mode="after")
    def _check_order(self) -> "DateRange":
        if self.from_ is not None and self.to is not None and self.from_ > self.to:
            raise ValueError("from must be <= to")
        return self


# Categorical enums — mirror MEILISEARCH_FACET_VOCABULARY in
# backend/app/services/meilisearch_config.py. We re-declare here as
# Literal types because juddges_search is a standalone package and must
# not import from backend.app.
Jurisdiction = Literal["PL", "UK"]
CourtLevel = Literal[
    "supreme",
    "constitutional",
    "appellate",
    "regional",
    "district",
    "local",
    "administrative",
]
CaseType = Literal["criminal", "civil", "administrative", "commercial"]
DecisionType = Literal["judgment", "order", "resolution"]
Outcome = Literal["granted", "dismissed", "partial", "remanded"]
LanguageCode = Literal["pl", "uk"]


MAX_ARRAY_VALUES = 6


def _cap_array(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for v in values:
        v = v.strip()
        if not v or v.lower() in seen:
            continue
        seen.add(v.lower())
        out.append(v)
        if len(out) == MAX_ARRAY_VALUES:
            break
    return out


class QueryRewriteResult(BaseModel):
    """Structured output emitted by the LLM."""

    model_config = ConfigDict(extra="forbid")

    rewritten_query: str = Field(min_length=1, max_length=400)

    jurisdiction: Jurisdiction | None = None
    court_level: CourtLevel | None = None
    case_type: CaseType | None = None
    decision_type: DecisionType | None = None
    outcome: Outcome | None = None

    keywords: list[str] = Field(default_factory=list)
    legal_topics: list[str] = Field(default_factory=list)
    cited_legislation: list[str] = Field(default_factory=list)

    decision_date: DateRange | None = None
    languages: list[LanguageCode] = Field(default_factory=list)

    base_num_victims: NumericRange | None = None
    base_victim_age_offence: NumericRange | None = None
    base_case_number: NumericRange | None = None
    base_co_def_acc_num: NumericRange | None = None
    base_date_of_appeal_court_judgment_ts: NumericRange | None = None

    @field_validator("keywords", "legal_topics", "cited_legislation", mode="after")
    @classmethod
    def _cap(cls, v: list[str]) -> list[str]:
        return _cap_array(v)
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd backend && poetry run pytest packages/juddges_search/tests/test_query_rewrite_models.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/juddges_search/juddges_search/chains/query_rewrite_models.py \
        backend/packages/juddges_search/tests/test_query_rewrite_models.py
git commit -m "feat(search): QueryRewriteResult Pydantic schema for LLM output"
```

---

## Task 3 — `query_rewrite_chain` LangChain runnable

**Files:**
- Create: `backend/packages/juddges_search/juddges_search/chains/query_rewrite.py`
- Modify: `backend/packages/juddges_search/juddges_search/chains/__init__.py`
- Test: `backend/packages/juddges_search/tests/test_query_rewrite_chain.py`

- [ ] **Step 1: Write the failing test**

Create `backend/packages/juddges_search/tests/test_query_rewrite_chain.py`:

```python
"""query_rewrite_chain unit tests with a fake LLM."""

from datetime import date

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from juddges_search.chains.query_rewrite import build_query_rewrite_chain
from juddges_search.chains.query_rewrite_models import QueryRewriteResult


@pytest.mark.unit
def test_chain_invokes_with_today_and_returns_pydantic():
    canned = QueryRewriteResult(
        rewritten_query="VAT digital services tax",
        jurisdiction="PL",
        keywords=["VAT", "digital services"],
    ).model_dump_json(by_alias=True)
    llm = FakeListChatModel(responses=[canned]).with_structured_output(
        QueryRewriteResult
    )

    chain = build_query_rewrite_chain(structured_llm=llm)
    out = chain.invoke(
        {
            "query": "podatek VAT od usług cyfrowych",
            "today": "2026-05-12",
        }
    )

    assert isinstance(out, QueryRewriteResult)
    assert out.jurisdiction == "PL"
    assert out.keywords == ["VAT", "digital services"]


@pytest.mark.unit
def test_chain_passes_languages_hint_in_prompt():
    captured: list[str] = []

    class CapturingLLM(FakeListChatModel):
        def _generate(self, messages, *args, **kwargs):  # type: ignore[override]
            captured.append("\n".join(m.content for m in messages))
            return super()._generate(messages, *args, **kwargs)

    canned = QueryRewriteResult(rewritten_query="x").model_dump_json(by_alias=True)
    llm = CapturingLLM(responses=[canned]).with_structured_output(QueryRewriteResult)
    chain = build_query_rewrite_chain(structured_llm=llm)

    chain.invoke({"query": "test", "today": "2026-05-12", "languages_hint": ["pl"]})

    prompt_text = captured[0]
    assert "pl" in prompt_text.lower()
    assert "2026-05-12" in prompt_text
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && poetry run pytest packages/juddges_search/tests/test_query_rewrite_chain.py -v
```

Expected: ImportError on `query_rewrite`.

- [ ] **Step 3: Implement the chain**

Create `backend/packages/juddges_search/juddges_search/chains/query_rewrite.py`:

```python
"""LLM chain that converts NL search queries into structured filters + a
cleaned query string for Meilisearch.

Outputs follow `QueryRewriteResult`. The chain expects three input keys:

    {"query": str, "today": str (YYYY-MM-DD), "languages_hint": list[str] | None}
"""

from __future__ import annotations

from operator import itemgetter

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable, RunnableLambda

from juddges_search.chains.callbacks import callbacks
from juddges_search.chains.query_rewrite_models import QueryRewriteResult
from juddges_search.llms import get_default_llm

# Few-shot examples kept short and outcome-focused. Each pair shows the
# *intent* of the rewrite: extract chip-worthy facts, leave the rest as
# rewritten_query.
SYSTEM_PROMPT = """You convert legal-research questions about Polish (PL) and UK court judgments into a Meilisearch query envelope.

Today's date: {today}
User's language hint (informational): {languages_hint}

Rules:
- Emit every field. Use null when the user did not state the value. Never guess.
- Keep Polish accents intact (ą, ć, ę, ł, ń, ó, ś, ź, ż). Do not transliterate.
- Use the rewritten_query for ranking signal: expand legal abbreviations (k.k. -> kodeks karny), drop the parts you turned into chips, keep useful synonyms.
- Numeric ranges (base_*): only when the user gives an explicit bound ("at least 3", "between 2018 and 2022").
- Arrays (keywords, legal_topics, cited_legislation): at most 6 candidates, no duplicates; the backend will canonicalise.
- decision_date: ISO 8601 dates (YYYY-MM-DD). Resolve relative phrases ("ostatnie 5 lat", "since 2020") against the date above.
- languages: only 'pl' or 'uk'. Lowercase. Include both when the user does not specify.

Categorical vocabulary (use exactly these values or null):
- jurisdiction: PL | UK
- court_level: supreme | constitutional | appellate | regional | district | local | administrative
- case_type: criminal | civil | administrative | commercial
- decision_type: judgment | order | resolution
- outcome: granted | dismissed | partial | remanded

Examples:

User: "wyroki sądu apelacyjnego z 2022 dotyczące VAT"
Output:
  rewritten_query: "VAT podatek od towarów i usług"
  jurisdiction: PL
  court_level: appellate
  decision_date: {{from: "2022-01-01", to: "2022-12-31"}}
  keywords: ["VAT", "podatek od towarów i usług"]

User: "criminal appeals with at least 3 victims since 2020"
Output:
  rewritten_query: "criminal appeal victims"
  case_type: criminal
  court_level: appellate
  decision_date: {{from: "2020-01-01"}}
  base_num_victims: {{min: 3}}

User: "kodeks karny art 286"
Output:
  rewritten_query: "kodeks karny artykuł 286 oszustwo"
  cited_legislation: ["kodeks karny art. 286"]

User: "umowy najmu mieszkania"
Output:
  rewritten_query: "umowa najmu mieszkania lokal mieszkalny dzierżawa"
  jurisdiction: PL
  case_type: civil
  keywords: ["najem", "umowa najmu", "mieszkanie"]
"""

USER_PROMPT = "{query}"

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT),
    ]
)


def build_query_rewrite_chain(
    structured_llm: Runnable | None = None,
) -> Runnable:
    """Build the chain. `structured_llm` is injectable for tests."""
    if structured_llm is None:
        structured_llm = get_default_llm(use_mini_model=True).with_structured_output(
            QueryRewriteResult
        )

    def _coerce_inputs(d: dict) -> dict:
        return {
            "query": d["query"],
            "today": d["today"],
            "languages_hint": d.get("languages_hint") or ["pl", "uk"],
        }

    return (
        RunnableLambda(_coerce_inputs)
        | prompt
        | structured_llm
    ).with_config(run_name="juddges_query_rewrite_chain", callbacks=callbacks)


# Module-level chain for production wiring. Tests should call
# build_query_rewrite_chain() with their own FakeLLM.
query_rewrite_chain = build_query_rewrite_chain()
```

- [ ] **Step 4: Export the chain**

Open `backend/packages/juddges_search/juddges_search/chains/__init__.py` and append:

```python
from juddges_search.chains.query_rewrite import (  # noqa: F401
    build_query_rewrite_chain,
    query_rewrite_chain,
)
from juddges_search.chains.query_rewrite_models import (  # noqa: F401
    QueryRewriteResult,
)
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd backend && poetry run pytest packages/juddges_search/tests/test_query_rewrite_chain.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/packages/juddges_search/juddges_search/chains/query_rewrite.py \
        backend/packages/juddges_search/juddges_search/chains/__init__.py \
        backend/packages/juddges_search/tests/test_query_rewrite_chain.py
git commit -m "feat(search): query_rewrite_chain with few-shot prompt and structured output"
```

---

## Task 4 — `MeiliSearchService.facet_search`

**Why:** The validator needs to round-trip candidate strings through Meilisearch's facet-search endpoint to canonicalise. The existing service has no such method.

**Files:**
- Modify: `backend/app/services/search.py`
- Test: `backend/tests/app/test_meili_facet_search.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/app/test_meili_facet_search.py`:

```python
"""MeiliSearchService.facet_search HTTP contract."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.search import MeiliSearchService, SearchServiceError


def _service() -> MeiliSearchService:
    return MeiliSearchService(
        base_url="http://meili.test",
        api_key="k",
        admin_key="k",
        index_name="judgments",
        timeout_seconds=2.0,
    )


def _mock_response(status_code: int, data: dict) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = data
    resp.raise_for_status = MagicMock()
    return resp


@pytest.mark.unit
@pytest.mark.asyncio
async def test_facet_search_returns_canonical_hits():
    service = _service()
    mock_resp = _mock_response(
        200,
        {"facetHits": [{"value": "VAT", "count": 12}, {"value": "vatovska", "count": 1}]},
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        hits = await service.facet_search("keywords", "VAT", limit=3)

    assert hits == ["VAT", "vatovska"]
    payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
    assert payload == {"facetName": "keywords", "facetQuery": "VAT", "limit": 3}
    url = mock_post.call_args.args[0] if mock_post.call_args.args else mock_post.call_args.kwargs["url"]
    assert url.endswith("/indexes/judgments/facet-search")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_facet_search_raises_on_http_error():
    service = _service()
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.ConnectError("boom")
        with pytest.raises(SearchServiceError):
            await service.facet_search("keywords", "VAT")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_facet_search_returns_empty_when_unconfigured():
    service = MeiliSearchService(
        base_url=None, api_key=None, admin_key=None, index_name="judgments"
    )
    assert await service.facet_search("keywords", "x") == []
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && poetry run pytest tests/app/test_meili_facet_search.py -v
```

Expected: AttributeError — `facet_search` does not exist.

- [ ] **Step 3: Add the method**

In `backend/app/services/search.py`, insert immediately after the `documents_search` method:

```python
    async def facet_search(
        self,
        facet_name: str,
        query: str,
        limit: int = 10,
    ) -> list[str]:
        """Look up canonical facet values matching a free-text query.

        Returns an empty list when Meilisearch is not configured — callers
        should treat this as "no canonicalisation available" rather than
        an error.
        """
        if not self.configured:
            return []

        url = f"{self.base_url}/indexes/{self.index_name}/facet-search"
        payload = {"facetName": facet_name, "facetQuery": query, "limit": limit}

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    url, json=payload, headers=self._search_headers()
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPError as exc:
            raise SearchServiceError(str(exc)) from exc

        hits = data.get("facetHits") or []
        return [h["value"] for h in hits if isinstance(h, dict) and "value" in h]
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd backend && poetry run pytest tests/app/test_meili_facet_search.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/search.py backend/tests/app/test_meili_facet_search.py
git commit -m "feat(search): MeiliSearchService.facet_search for vocabulary canonicalisation"
```

---

## Task 5 — `FacetValidator` arrays canonicalisation

**Files:**
- Create: `backend/app/services/facet_validation.py`
- Test: `backend/tests/app/test_facet_validation.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/app/test_facet_validation.py`:

```python
"""FacetValidator unit tests — arrays only at this step."""

from unittest.mock import AsyncMock

import pytest

from app.services.facet_validation import FacetValidator
from juddges_search.chains.query_rewrite_models import QueryRewriteResult


@pytest.mark.unit
@pytest.mark.asyncio
async def test_arrays_are_canonicalised_via_facet_search():
    meili = AsyncMock()

    async def _facet_search(field: str, query: str, limit: int = 3) -> list[str]:
        responses = {
            ("keywords", "vat"): ["VAT"],
            ("keywords", "podatek"): ["podatek od towarów i usług"],
            ("legal_topics", "tax"): ["taxation"],
            ("cited_legislation", "kk 286"): [],
        }
        return responses.get((field, query.lower()), [])

    meili.facet_search.side_effect = _facet_search
    validator = FacetValidator(meili=meili)

    result = QueryRewriteResult(
        rewritten_query="x",
        keywords=["vat", "podatek", "ghost"],
        legal_topics=["tax"],
        cited_legislation=["KK 286"],
    )

    envelope = await validator.validate(result)

    assert envelope.filters.arrays.keywords == ["VAT", "podatek od towarów i usług"]
    assert envelope.filters.arrays.legal_topics == ["taxation"]
    assert envelope.filters.arrays.cited_legislation == []
    assert set(envelope.diagnostics.dropped_terms) == {"keywords:ghost", "cited_legislation:KK 286"}


@pytest.mark.unit
@pytest.mark.asyncio
async def test_facet_search_failure_drops_field_silently():
    meili = AsyncMock()
    meili.facet_search.side_effect = TimeoutError("meili slow")
    validator = FacetValidator(meili=meili)

    result = QueryRewriteResult(rewritten_query="x", keywords=["vat"])
    envelope = await validator.validate(result)

    assert envelope.filters.arrays.keywords == []
    assert envelope.diagnostics.dropped_terms == ["keywords:vat"]
    assert envelope.degraded is False  # array failure ≠ full degraded
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && poetry run pytest tests/app/test_facet_validation.py -v
```

Expected: ImportError on `facet_validation`.

- [ ] **Step 3: Implement minimum to pass — array canonicalisation only**

Create `backend/app/services/facet_validation.py`:

```python
"""Validator that turns an LLM `QueryRewriteResult` into a frontend
envelope, dropping or canonicalising values against the live Meili index.

This module owns NO LLM logic — it only validates what the LLM produced.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

from loguru import logger
from pydantic import BaseModel, Field

from app.services.search import MeiliSearchService
from juddges_search.chains.query_rewrite_models import (
    NumericRange,
    QueryRewriteResult,
)


# ── Envelope models ──────────────────────────────────────────────────────


class EnvelopeBaseFilters(BaseModel):
    base_num_victims: NumericRange | None = None
    base_victim_age_offence: NumericRange | None = None
    base_case_number: NumericRange | None = None
    base_co_def_acc_num: NumericRange | None = None
    base_date_of_appeal_court_judgment_ts: NumericRange | None = None


class EnvelopeFacets(BaseModel):
    jurisdiction: str | None = None
    court_level: str | None = None
    case_type: str | None = None
    decision_type: str | None = None
    outcome: str | None = None


class EnvelopeArrays(BaseModel):
    keywords: list[str] = Field(default_factory=list)
    legal_topics: list[str] = Field(default_factory=list)
    cited_legislation: list[str] = Field(default_factory=list)


class EnvelopeDateRange(BaseModel):
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None

    model_config = {"populate_by_name": True}


class EnvelopeFilters(BaseModel):
    base: EnvelopeBaseFilters = Field(default_factory=EnvelopeBaseFilters)
    facets: EnvelopeFacets = Field(default_factory=EnvelopeFacets)
    arrays: EnvelopeArrays = Field(default_factory=EnvelopeArrays)
    decision_date: EnvelopeDateRange | None = None
    languages: list[str] = Field(default_factory=list)


class EnvelopeDiagnostics(BaseModel):
    dropped_terms: list[str] = Field(default_factory=list)
    latency_ms: int = 0
    model: str = "gpt-5-mini"


class RewrittenQueryEnvelope(BaseModel):
    rewritten_query: str
    filters: EnvelopeFilters = Field(default_factory=EnvelopeFilters)
    diagnostics: EnvelopeDiagnostics = Field(default_factory=EnvelopeDiagnostics)
    degraded: bool = False


# ── Validator ────────────────────────────────────────────────────────────


_ARRAY_FIELDS = ("keywords", "legal_topics", "cited_legislation")


@dataclass
class FacetValidator:
    meili: MeiliSearchService
    per_field_timeout_s: float = 0.25
    total_timeout_s: float = 1.0

    async def validate(
        self, result: QueryRewriteResult, model_name: str = "gpt-5-mini"
    ) -> RewrittenQueryEnvelope:
        started = time.monotonic()

        diagnostics = EnvelopeDiagnostics(model=model_name)

        arrays = await self._canonicalise_arrays(result, diagnostics)

        envelope = RewrittenQueryEnvelope(
            rewritten_query=result.rewritten_query,
            filters=EnvelopeFilters(
                facets=EnvelopeFacets(
                    jurisdiction=result.jurisdiction,
                    court_level=result.court_level,
                    case_type=result.case_type,
                    decision_type=result.decision_type,
                    outcome=result.outcome,
                ),
                arrays=arrays,
            ),
            diagnostics=diagnostics,
        )
        envelope.diagnostics.latency_ms = int((time.monotonic() - started) * 1000)
        return envelope

    async def _canonicalise_arrays(
        self,
        result: QueryRewriteResult,
        diagnostics: EnvelopeDiagnostics,
    ) -> EnvelopeArrays:
        out = EnvelopeArrays()

        async def _resolve_one(field: str, value: str) -> str | None:
            try:
                hits = await asyncio.wait_for(
                    self.meili.facet_search(field, value, limit=3),
                    timeout=self.per_field_timeout_s,
                )
            except Exception:
                logger.opt(exception=True).debug(
                    "facet_search failed for {}={}", field, value
                )
                return None
            for h in hits:
                if h.lower() == value.lower():
                    return h
            return hits[0] if hits else None

        # Dispatch every (field, value) lookup concurrently per spec §5.
        # asyncio.gather preserves submission order so we keep the LLM's
        # original ordering.
        tasks: list[tuple[str, str, asyncio.Task[str | None]]] = []
        for field_name in _ARRAY_FIELDS:
            values: list[str] = getattr(result, field_name)
            for v in values:
                tasks.append(
                    (
                        field_name,
                        v,
                        asyncio.create_task(_resolve_one(field_name, v)),
                    )
                )

        if tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*(t for _, _, t in tasks), return_exceptions=True),
                    timeout=self.total_timeout_s,
                )
            except asyncio.TimeoutError:
                for _, _, t in tasks:
                    if not t.done():
                        t.cancel()

        for field_name, original, task in tasks:
            canonical = task.result() if task.done() and not task.cancelled() else None
            if canonical is None:
                diagnostics.dropped_terms.append(f"{field_name}:{original}")
                continue
            getattr(out, field_name).append(canonical)

        return out
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd backend && poetry run pytest tests/app/test_facet_validation.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/facet_validation.py backend/tests/app/test_facet_validation.py
git commit -m "feat(search): FacetValidator canonicalises open-vocab arrays via Meili"
```

---

## Task 6 — `FacetValidator` numeric clamp + dates + languages

**Files:**
- Modify: `backend/app/services/facet_validation.py`
- Modify: `backend/tests/app/test_facet_validation.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/app/test_facet_validation.py`:

```python
from datetime import date

from juddges_search.chains.query_rewrite_models import DateRange


@pytest.mark.unit
@pytest.mark.asyncio
async def test_numeric_clamp_uses_bounds_map():
    meili = AsyncMock()
    meili.facet_search.return_value = []
    validator = FacetValidator(
        meili=meili,
        numeric_bounds={"base_num_victims": (0, 50)},
    )

    result = QueryRewriteResult(
        rewritten_query="x",
        base_num_victims=NumericRange(min=-3, max=200),
    )
    envelope = await validator.validate(result)

    base = envelope.filters.base.base_num_victims
    assert base is not None
    assert base.min == 0
    assert base.max == 50


@pytest.mark.unit
@pytest.mark.asyncio
async def test_numeric_dropped_when_both_outside_bounds():
    meili = AsyncMock()
    meili.facet_search.return_value = []
    validator = FacetValidator(
        meili=meili, numeric_bounds={"base_num_victims": (0, 50)}
    )

    result = QueryRewriteResult(
        rewritten_query="x",
        base_num_victims=NumericRange(min=100, max=200),
    )
    envelope = await validator.validate(result)
    assert envelope.filters.base.base_num_victims is None
    assert "base_num_victims" in "|".join(envelope.diagnostics.dropped_terms)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_decision_date_passthrough_when_valid():
    meili = AsyncMock()
    meili.facet_search.return_value = []
    validator = FacetValidator(meili=meili)

    result = QueryRewriteResult(
        rewritten_query="x",
        decision_date=DateRange(from_=date(2020, 1, 1), to=date(2024, 12, 31)),
    )
    envelope = await validator.validate(result)
    assert envelope.filters.decision_date is not None
    assert envelope.filters.decision_date.from_ == "2020-01-01"
    assert envelope.filters.decision_date.to == "2024-12-31"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_decision_date_dropped_when_out_of_range():
    meili = AsyncMock()
    meili.facet_search.return_value = []
    validator = FacetValidator(meili=meili, today=date(2026, 5, 12))

    result = QueryRewriteResult(
        rewritten_query="x",
        decision_date=DateRange(from_=date(1500, 1, 1), to=date(1600, 1, 1)),
    )
    envelope = await validator.validate(result)
    assert envelope.filters.decision_date is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_languages_normalised_and_deduped():
    meili = AsyncMock()
    meili.facet_search.return_value = []
    validator = FacetValidator(meili=meili)

    # The LLM enum already constrains to ('pl', 'uk') so we test the
    # passthrough + dedup behaviour explicitly.
    result = QueryRewriteResult(rewritten_query="x", languages=["pl", "uk", "pl"])
    envelope = await validator.validate(result)
    assert envelope.filters.languages == ["pl", "uk"]
```

- [ ] **Step 2: Run tests, verify the new ones fail**

```bash
cd backend && poetry run pytest tests/app/test_facet_validation.py -v
```

Expected: 5 failed (new ones), 2 still passing.

- [ ] **Step 3: Implement clamp / date / languages logic**

Replace the `FacetValidator` class in `backend/app/services/facet_validation.py` with:

```python
from datetime import date as _date


@dataclass
class FacetValidator:
    meili: MeiliSearchService
    per_field_timeout_s: float = 0.25
    total_timeout_s: float = 1.0
    numeric_bounds: dict[str, tuple[float, float]] = field(default_factory=dict)
    today: _date | None = None

    _NUMERIC_FIELDS = (
        "base_num_victims",
        "base_victim_age_offence",
        "base_case_number",
        "base_co_def_acc_num",
        "base_date_of_appeal_court_judgment_ts",
    )

    async def validate(
        self, result: QueryRewriteResult, model_name: str = "gpt-5-mini"
    ) -> RewrittenQueryEnvelope:
        started = time.monotonic()
        diagnostics = EnvelopeDiagnostics(model=model_name)

        arrays = await self._canonicalise_arrays(result, diagnostics)
        base = self._clamp_numerics(result, diagnostics)
        date_range = self._validate_date(result, diagnostics)
        languages = self._normalise_languages(result)

        envelope = RewrittenQueryEnvelope(
            rewritten_query=result.rewritten_query,
            filters=EnvelopeFilters(
                base=base,
                facets=EnvelopeFacets(
                    jurisdiction=result.jurisdiction,
                    court_level=result.court_level,
                    case_type=result.case_type,
                    decision_type=result.decision_type,
                    outcome=result.outcome,
                ),
                arrays=arrays,
                decision_date=date_range,
                languages=languages,
            ),
            diagnostics=diagnostics,
        )
        envelope.diagnostics.latency_ms = int((time.monotonic() - started) * 1000)
        return envelope

    # _canonicalise_arrays unchanged from Task 5 — keep the same body.

    def _clamp_numerics(
        self,
        result: QueryRewriteResult,
        diagnostics: EnvelopeDiagnostics,
    ) -> EnvelopeBaseFilters:
        out = EnvelopeBaseFilters()
        for field_name in self._NUMERIC_FIELDS:
            raw: NumericRange | None = getattr(result, field_name)
            if raw is None:
                continue
            bounds = self.numeric_bounds.get(field_name)
            lo, hi = (raw.min, raw.max)
            if bounds is not None:
                b_lo, b_hi = bounds
                if lo is not None:
                    lo = max(lo, b_lo)
                if hi is not None:
                    hi = min(hi, b_hi)
                # Drop if the clamped range is empty or both ends fell
                # outside the legal range.
                if lo is not None and hi is not None and lo > hi:
                    diagnostics.dropped_terms.append(f"{field_name}:out-of-range")
                    continue
                if (
                    (raw.min is not None and raw.min > b_hi)
                    and (raw.max is not None and raw.max > b_hi)
                ) or (
                    (raw.min is not None and raw.min < b_lo)
                    and (raw.max is not None and raw.max < b_lo)
                ):
                    diagnostics.dropped_terms.append(f"{field_name}:out-of-range")
                    continue
            setattr(out, field_name, NumericRange(min=lo, max=hi))
        return out

    def _validate_date(
        self,
        result: QueryRewriteResult,
        diagnostics: EnvelopeDiagnostics,
    ) -> EnvelopeDateRange | None:
        dr = result.decision_date
        if dr is None or (dr.from_ is None and dr.to is None):
            return None
        today = self.today or _date.today()
        floor = _date(1900, 1, 1)
        ceil = _date(today.year + 1, today.month, today.day)

        def _ok(d: _date | None) -> bool:
            return d is None or (floor <= d <= ceil)

        if not (_ok(dr.from_) and _ok(dr.to)):
            diagnostics.dropped_terms.append("decision_date:out-of-range")
            return None

        return EnvelopeDateRange(
            **{
                "from": dr.from_.isoformat() if dr.from_ else None,
                "to": dr.to.isoformat() if dr.to else None,
            }
        )

    def _normalise_languages(self, result: QueryRewriteResult) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for lang in result.languages:
            lc = lang.lower()
            if lc == "en":
                lc = "uk"
            if lc in seen or lc not in {"pl", "uk"}:
                continue
            seen.add(lc)
            out.append(lc)
        return out
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
cd backend && poetry run pytest tests/app/test_facet_validation.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/facet_validation.py backend/tests/app/test_facet_validation.py
git commit -m "feat(search): FacetValidator clamps numerics, validates dates, normalises langs"
```

---

## Task 7 — Backend route `/documents/search/rewrite`

**Files:**
- Create: `backend/app/judgments_pkg/query_rewrite.py`
- Modify: `backend/app/judgments_pkg/__init__.py`
- Test: `backend/tests/app/test_query_rewrite_route.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/app/test_query_rewrite_route.py`:

```python
"""Route-level test for POST /documents/search/rewrite."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.server import app
from app.services.facet_validation import (
    EnvelopeFacets,
    EnvelopeFilters,
    RewrittenQueryEnvelope,
)
from juddges_search.chains.query_rewrite_models import QueryRewriteResult


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.unit
def test_rewrite_route_returns_envelope(monkeypatch, client):
    rewrite_result = QueryRewriteResult(
        rewritten_query="VAT digital services",
        jurisdiction="PL",
        keywords=["VAT"],
    )

    async def _fake_chain_ainvoke(_inputs):
        return rewrite_result

    chain_mock = AsyncMock()
    chain_mock.ainvoke.side_effect = _fake_chain_ainvoke

    envelope = RewrittenQueryEnvelope(
        rewritten_query="VAT digital services",
        filters=EnvelopeFilters(facets=EnvelopeFacets(jurisdiction="PL")),
    )

    validator_mock = AsyncMock()
    validator_mock.validate.return_value = envelope

    with patch(
        "app.judgments_pkg.query_rewrite._get_chain", return_value=chain_mock
    ), patch(
        "app.judgments_pkg.query_rewrite._get_validator", return_value=validator_mock
    ):
        resp = client.post(
            "/documents/search/rewrite",
            json={"query": "podatek VAT", "languages_hint": ["pl"]},
            headers={"X-API-Key": "test"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["rewritten_query"] == "VAT digital services"
    assert body["filters"]["facets"]["jurisdiction"] == "PL"
    assert body["degraded"] is False


@pytest.mark.unit
def test_rewrite_route_falls_back_on_chain_failure(monkeypatch, client):
    chain_mock = AsyncMock()
    chain_mock.ainvoke.side_effect = RuntimeError("openai timeout")
    validator_mock = AsyncMock()

    with patch(
        "app.judgments_pkg.query_rewrite._get_chain", return_value=chain_mock
    ), patch(
        "app.judgments_pkg.query_rewrite._get_validator", return_value=validator_mock
    ):
        resp = client.post(
            "/documents/search/rewrite",
            json={"query": "anything", "languages_hint": ["pl"]},
            headers={"X-API-Key": "test"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["degraded"] is True
    assert body["rewritten_query"] == "anything"
    assert body["filters"]["arrays"]["keywords"] == []
    validator_mock.validate.assert_not_called()


@pytest.mark.unit
def test_rewrite_route_rejects_empty_query(client):
    resp = client.post(
        "/documents/search/rewrite",
        json={"query": "   "},
        headers={"X-API-Key": "test"},
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && poetry run pytest tests/app/test_query_rewrite_route.py -v
```

Expected: 404 on the POST (route not yet registered).

- [ ] **Step 3: Implement the route**

Create `backend/app/judgments_pkg/query_rewrite.py`:

```python
"""POST /documents/search/rewrite — LLM query rewriter + facet validation."""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from loguru import logger
from pydantic import BaseModel, Field, field_validator

from app.services.facet_validation import (
    FacetValidator,
    RewrittenQueryEnvelope,
)
from app.services.search import MeiliSearchService
from juddges_search.chains.query_rewrite import build_query_rewrite_chain
from juddges_search.chains.query_rewrite_models import QueryRewriteResult


# ── request model ────────────────────────────────────────────────────────


class QueryRewriteRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    languages_hint: list[str] | None = None
    today: date | None = None  # injected for deterministic tests

    @field_validator("query")
    @classmethod
    def _non_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("query must not be blank")
        return v.strip()


# ── lazy singletons (so tests can patch them) ────────────────────────────


_CHAIN: Any | None = None
_VALIDATOR: FacetValidator | None = None


def _get_chain():
    global _CHAIN
    if _CHAIN is None:
        _CHAIN = build_query_rewrite_chain()
    return _CHAIN


def _get_validator() -> FacetValidator:
    global _VALIDATOR
    if _VALIDATOR is None:
        # Numeric bounds populated from the index aggregates is a future
        # task; an empty map still produces correct behaviour (no clamp).
        _VALIDATOR = FacetValidator(meili=MeiliSearchService.from_env())
    return _VALIDATOR


# ── router ───────────────────────────────────────────────────────────────


router = APIRouter(tags=["search"])


@router.post(
    "/search/rewrite",
    response_model=RewrittenQueryEnvelope,
    summary="LLM query rewrite + structured filter extraction (thinking mode)",
)
async def rewrite_query(request: Request, body: QueryRewriteRequest) -> RewrittenQueryEnvelope:
    chain = _get_chain()
    validator = _get_validator()

    chain_inputs = {
        "query": body.query,
        "today": (body.today or date.today()).isoformat(),
        "languages_hint": body.languages_hint or ["pl", "uk"],
    }

    try:
        rewrite_result: QueryRewriteResult = await chain.ainvoke(chain_inputs)
    except Exception as exc:  # noqa: BLE001 — we explicitly degrade on any failure
        logger.warning(
            "query_rewrite_chain failed — degrading: {}: {}",
            type(exc).__name__,
            exc,
        )
        return RewrittenQueryEnvelope(rewritten_query=body.query, degraded=True)

    return await validator.validate(rewrite_result)
```

- [ ] **Step 4: Mount the router**

Open `backend/app/judgments_pkg/__init__.py` and add near the other `@router.post` decorators (top-level, after the existing router declaration around line 76):

```python
from app.judgments_pkg.query_rewrite import router as _query_rewrite_router

router.include_router(_query_rewrite_router)
```

> Why `include_router`: the existing `documents_router` already has
> `prefix="/documents"`. Including the sub-router preserves that prefix
> while keeping the new endpoint isolated for testing.

- [ ] **Step 5: Run tests, verify all pass**

```bash
cd backend && poetry run pytest tests/app/test_query_rewrite_route.py -v
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/judgments_pkg/query_rewrite.py \
        backend/app/judgments_pkg/__init__.py \
        backend/tests/app/test_query_rewrite_route.py
git commit -m "feat(search): POST /documents/search/rewrite route with degrade-on-failure"
```

---

## Task 8 — TTL cache on the route

**Why:** Users iterate filters more often than they retype the question. Caching the (query, languages) → envelope mapping for 60s removes ~60–80% of redundant LLM calls in typical sessions.

**Files:**
- Modify: `backend/app/judgments_pkg/query_rewrite.py`
- Modify: `backend/tests/app/test_query_rewrite_route.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/app/test_query_rewrite_route.py`:

```python
@pytest.mark.unit
def test_rewrite_route_caches_identical_requests(client):
    chain_mock = AsyncMock()
    chain_mock.ainvoke.return_value = QueryRewriteResult(rewritten_query="hello")

    validator_mock = AsyncMock()
    validator_mock.validate.return_value = RewrittenQueryEnvelope(
        rewritten_query="hello"
    )

    with patch(
        "app.judgments_pkg.query_rewrite._get_chain", return_value=chain_mock
    ), patch(
        "app.judgments_pkg.query_rewrite._get_validator", return_value=validator_mock
    ), patch(
        "app.judgments_pkg.query_rewrite._CACHE", new=__import__("cachetools").TTLCache(maxsize=128, ttl=60)
    ):
        for _ in range(3):
            resp = client.post(
                "/documents/search/rewrite",
                json={"query": "podatek VAT", "languages_hint": ["pl"]},
                headers={"X-API-Key": "test"},
            )
            assert resp.status_code == 200

    assert chain_mock.ainvoke.await_count == 1
    assert validator_mock.validate.await_count == 1
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && poetry run pytest tests/app/test_query_rewrite_route.py -v -k caches
```

Expected: AssertionError — chain awaited 3 times.

- [ ] **Step 3: Add the cache**

Edit `backend/app/judgments_pkg/query_rewrite.py`:

Add near the other module-level singletons:

```python
import cachetools

_CACHE: cachetools.TTLCache = cachetools.TTLCache(maxsize=256, ttl=60)


def _cache_key(body: QueryRewriteRequest) -> tuple:
    langs = tuple(sorted((body.languages_hint or [])))
    return (body.query.lower(), langs)
```

Wrap the route body:

```python
async def rewrite_query(request: Request, body: QueryRewriteRequest) -> RewrittenQueryEnvelope:
    key = _cache_key(body)
    cached = _CACHE.get(key)
    if cached is not None:
        return cached

    chain = _get_chain()
    validator = _get_validator()

    chain_inputs = {
        "query": body.query,
        "today": (body.today or date.today()).isoformat(),
        "languages_hint": body.languages_hint or ["pl", "uk"],
    }

    try:
        rewrite_result = await chain.ainvoke(chain_inputs)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "query_rewrite_chain failed — degrading: {}: {}",
            type(exc).__name__,
            exc,
        )
        envelope = RewrittenQueryEnvelope(rewritten_query=body.query, degraded=True)
    else:
        envelope = await validator.validate(rewrite_result)

    _CACHE[key] = envelope
    return envelope
```

- [ ] **Step 4: Run all route tests, verify they pass**

```bash
cd backend && poetry run pytest tests/app/test_query_rewrite_route.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/judgments_pkg/query_rewrite.py backend/tests/app/test_query_rewrite_route.py
git commit -m "feat(search): 60s TTL cache on query-rewrite endpoint"
```

---

## Task 9 — Frontend types + Zod schema

**Files:**
- Create: `frontend/types/query-rewrite.ts`
- Create: `frontend/lib/validation/query-rewrite-schema.ts`
- Test: `frontend/__tests__/lib/validation/query-rewrite-schema.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `frontend/__tests__/lib/validation/query-rewrite-schema.test.ts`:

```ts
import {
  queryRewriteRequestSchema,
  queryRewriteEnvelopeSchema,
} from '@/lib/validation/query-rewrite-schema';

describe('query rewrite schemas', () => {
  it('accepts a minimal request', () => {
    expect(() =>
      queryRewriteRequestSchema.parse({ query: 'podatek VAT' }),
    ).not.toThrow();
  });

  it('rejects empty query', () => {
    expect(() => queryRewriteRequestSchema.parse({ query: '   ' })).toThrow();
  });

  it('parses a full envelope', () => {
    const parsed = queryRewriteEnvelopeSchema.parse({
      rewritten_query: 'VAT',
      filters: {
        base: { base_num_victims: { min: 1 } },
        facets: { jurisdiction: 'PL' },
        arrays: { keywords: ['VAT'], legal_topics: [], cited_legislation: [] },
        decision_date: { from: '2020-01-01', to: '2024-12-31' },
        languages: ['pl'],
      },
      diagnostics: { dropped_terms: [], latency_ms: 200, model: 'gpt-5-mini' },
      degraded: false,
    });
    expect(parsed.filters.facets.jurisdiction).toBe('PL');
  });

  it('treats missing optional sections as defaults', () => {
    const parsed = queryRewriteEnvelopeSchema.parse({
      rewritten_query: 'fallback',
      degraded: true,
    });
    expect(parsed.filters.arrays.keywords).toEqual([]);
    expect(parsed.filters.languages).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npx jest __tests__/lib/validation/query-rewrite-schema.test.ts
```

Expected: module not found.

- [ ] **Step 3: Define the types**

Create `frontend/types/query-rewrite.ts`:

```ts
import type { BaseFilters } from '@/lib/store/searchStore';

export type Jurisdiction = 'PL' | 'UK';
export type CourtLevel =
  | 'supreme'
  | 'constitutional'
  | 'appellate'
  | 'regional'
  | 'district'
  | 'local'
  | 'administrative';
export type CaseType = 'criminal' | 'civil' | 'administrative' | 'commercial';
export type DecisionType = 'judgment' | 'order' | 'resolution';
export type Outcome = 'granted' | 'dismissed' | 'partial' | 'remanded';

export interface RewrittenQueryEnvelope {
  rewritten_query: string;
  filters: {
    base: BaseFilters;
    facets: {
      jurisdiction?: Jurisdiction;
      court_level?: CourtLevel;
      case_type?: CaseType;
      decision_type?: DecisionType;
      outcome?: Outcome;
    };
    arrays: {
      keywords: string[];
      legal_topics: string[];
      cited_legislation: string[];
    };
    decision_date?: { from?: string; to?: string };
    languages: string[];
  };
  diagnostics: {
    dropped_terms: string[];
    latency_ms: number;
    model: string;
  };
  degraded: boolean;
}

export interface QueryRewriteRequest {
  query: string;
  languages_hint?: string[];
}
```

- [ ] **Step 4: Define the Zod schemas**

Create `frontend/lib/validation/query-rewrite-schema.ts`:

```ts
import { z } from 'zod';

const numericRangeSchema = z
  .object({ min: z.number().optional(), max: z.number().optional() })
  .partial();

const baseFiltersSchema = z
  .object({
    base_num_victims: numericRangeSchema.optional(),
    base_victim_age_offence: numericRangeSchema.optional(),
    base_case_number: numericRangeSchema.optional(),
    base_co_def_acc_num: numericRangeSchema.optional(),
    base_date_of_appeal_court_judgment_ts: numericRangeSchema.optional(),
  })
  .partial()
  .default({});

const arraysSchema = z
  .object({
    keywords: z.array(z.string()).default([]),
    legal_topics: z.array(z.string()).default([]),
    cited_legislation: z.array(z.string()).default([]),
  })
  .default({ keywords: [], legal_topics: [], cited_legislation: [] });

export const queryRewriteEnvelopeSchema = z.object({
  rewritten_query: z.string().min(1),
  filters: z
    .object({
      base: baseFiltersSchema,
      facets: z
        .object({
          jurisdiction: z.enum(['PL', 'UK']).optional(),
          court_level: z
            .enum([
              'supreme',
              'constitutional',
              'appellate',
              'regional',
              'district',
              'local',
              'administrative',
            ])
            .optional(),
          case_type: z
            .enum(['criminal', 'civil', 'administrative', 'commercial'])
            .optional(),
          decision_type: z.enum(['judgment', 'order', 'resolution']).optional(),
          outcome: z
            .enum(['granted', 'dismissed', 'partial', 'remanded'])
            .optional(),
        })
        .default({}),
      arrays: arraysSchema,
      decision_date: z
        .object({ from: z.string().optional(), to: z.string().optional() })
        .partial()
        .optional(),
      languages: z.array(z.string()).default([]),
    })
    .default({
      base: {},
      facets: {},
      arrays: { keywords: [], legal_topics: [], cited_legislation: [] },
      languages: [],
    }),
  diagnostics: z
    .object({
      dropped_terms: z.array(z.string()).default([]),
      latency_ms: z.number().int().nonnegative().default(0),
      model: z.string().default('gpt-5-mini'),
    })
    .default({ dropped_terms: [], latency_ms: 0, model: 'gpt-5-mini' }),
  degraded: z.boolean().default(false),
});

export const queryRewriteRequestSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(2000)
    .refine((v) => v.trim().length > 0, 'query must not be blank'),
  languages_hint: z.array(z.string()).optional(),
});

export type QueryRewriteEnvelope = z.infer<typeof queryRewriteEnvelopeSchema>;
export type QueryRewriteRequestBody = z.infer<typeof queryRewriteRequestSchema>;
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
cd frontend && npx jest __tests__/lib/validation/query-rewrite-schema.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/types/query-rewrite.ts \
        frontend/lib/validation/query-rewrite-schema.ts \
        frontend/__tests__/lib/validation/query-rewrite-schema.test.ts
git commit -m "feat(search): query-rewrite types and Zod schemas on the frontend"
```

---

## Task 10 — Next.js BFF route `/api/query_rewrite`

**Files:**
- Create: `frontend/app/api/query_rewrite/route.ts`
- Test: `frontend/__tests__/api/query_rewrite-route.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `frontend/__tests__/api/query_rewrite-route.test.ts`:

```ts
import { POST } from '@/app/api/query_rewrite/route';

const buildRequest = (body: unknown): Request =>
  new Request('http://localhost/api/query_rewrite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/query_rewrite', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('forwards body to the backend with X-API-Key', async () => {
    process.env.BACKEND_API_KEY = 'test-key';
    const fetchSpy = jest.fn(async () =>
      new Response(
        JSON.stringify({
          rewritten_query: 'VAT',
          filters: {
            base: {},
            facets: { jurisdiction: 'PL' },
            arrays: { keywords: [], legal_topics: [], cited_legislation: [] },
            languages: [],
          },
          diagnostics: { dropped_terms: [], latency_ms: 50, model: 'gpt-5-mini' },
          degraded: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    global.fetch = fetchSpy as unknown as typeof global.fetch;

    const response = await POST(buildRequest({ query: 'podatek VAT' }) as any);
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({ 'X-API-Key': 'test-key' }),
    );
  });

  it('returns 422 on validation failure without calling backend', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof global.fetch;
    const response = await POST(buildRequest({ query: '   ' }) as any);
    expect(response.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps backend 5xx to AppError with degraded envelope', async () => {
    const fetchSpy = jest.fn(async () => new Response('boom', { status: 503 }));
    global.fetch = fetchSpy as unknown as typeof global.fetch;
    const response = await POST(buildRequest({ query: 'anything' }) as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.degraded).toBe(true);
    expect(body.rewritten_query).toBe('anything');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npx jest __tests__/api/query_rewrite-route.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement the BFF**

Create `frontend/app/api/query_rewrite/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import { AppError, ErrorCode } from '@/lib/errors';
import {
  queryRewriteRequestSchema,
  queryRewriteEnvelopeSchema,
} from '@/lib/validation/query-rewrite-schema';
import { validateRequestBody } from '@/lib/validation/schemas';

const apiLogger = logger.child('query-rewrite-api');
const API_BASE_URL = getBackendUrl();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      new AppError('Invalid JSON body', ErrorCode.VALIDATION_ERROR, 400).toErrorDetail(),
      { status: 400 },
    );
  }

  let validated;
  try {
    validated = validateRequestBody(queryRewriteRequestSchema, body);
  } catch (err) {
    apiLogger.warn('validation failed', { requestId });
    return NextResponse.json(
      new AppError('Invalid query rewrite request', ErrorCode.VALIDATION_ERROR, 422, {
        details: err instanceof Error ? err.message : String(err),
      }).toErrorDetail(),
      { status: 422 },
    );
  }

  try {
    const upstream = await fetch(`${API_BASE_URL}/documents/search/rewrite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY ?? '',
      },
      body: JSON.stringify(validated),
    });

    if (!upstream.ok) {
      apiLogger.warn('backend returned non-2xx — degrading', {
        requestId,
        status: upstream.status,
      });
      return NextResponse.json(
        queryRewriteEnvelopeSchema.parse({
          rewritten_query: validated.query,
          degraded: true,
        }),
      );
    }

    const parsed = queryRewriteEnvelopeSchema.parse(await upstream.json());
    apiLogger.info('query_rewrite ok', {
      requestId,
      durationMs: Date.now() - startedAt,
      degraded: parsed.degraded,
      droppedCount: parsed.diagnostics.dropped_terms.length,
    });
    return NextResponse.json(parsed);
  } catch (err) {
    apiLogger.error('query_rewrite call failed', err, { requestId });
    return NextResponse.json(
      queryRewriteEnvelopeSchema.parse({
        rewritten_query: validated.query,
        degraded: true,
      }),
    );
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd frontend && npx jest __tests__/api/query_rewrite-route.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/query_rewrite/route.ts \
        frontend/__tests__/api/query_rewrite-route.test.ts
git commit -m "feat(search): /api/query_rewrite BFF with degrade-on-failure"
```

---

## Task 11 — `useQueryRewrite` hook

**Files:**
- Create: `frontend/hooks/useQueryRewrite.ts`
- Test: `frontend/__tests__/hooks/useQueryRewrite.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/__tests__/hooks/useQueryRewrite.test.ts`:

```tsx
import { renderHook, act } from '@testing-library/react';

import { useQueryRewrite } from '@/hooks/useQueryRewrite';
import { useSearchStore } from '@/lib/store/searchStore';

const buildEnvelope = (overrides: Partial<Record<string, unknown>> = {}) => ({
  rewritten_query: 'VAT digital services',
  filters: {
    base: { base_num_victims: { min: 3 } },
    facets: { jurisdiction: 'PL' },
    arrays: { keywords: ['VAT'], legal_topics: [], cited_legislation: [] },
    decision_date: { from: '2022-01-01', to: '2022-12-31' },
    languages: ['pl'],
  },
  diagnostics: { dropped_terms: [], latency_ms: 100, model: 'gpt-5-mini' },
  degraded: false,
  ...overrides,
});

describe('useQueryRewrite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useSearchStore.getState().resetFilters();
    useSearchStore.getState().resetBaseFilters();
    useSearchStore.getState().setSelectedLanguages(new Set(['pl', 'uk']));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('hydrates the store with envelope filters and returns rewritten query', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify(buildEnvelope()), { status: 200 }),
    ) as unknown as typeof global.fetch;

    const { result } = renderHook(() => useQueryRewrite());

    let envelope;
    await act(async () => {
      envelope = await result.current.run({ query: 'podatek VAT z 2022' });
    });

    expect(envelope?.rewritten_query).toBe('VAT digital services');

    const state = useSearchStore.getState();
    expect(state.baseFilters.numVictims).toEqual({ min: 3 });
    expect(Array.from(state.filters.issuingBodies)).toEqual([]); // facets sidebar untouched
    expect(Array.from(state.filters.keywords)).toEqual(['VAT']);
    expect(state.filters.dateFrom?.toISOString().startsWith('2022-01-01')).toBe(true);
    expect(Array.from(state.selectedLanguages)).toEqual(['pl']);
  });

  it('does not mutate the store when envelope is degraded', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify(buildEnvelope({ degraded: true, filters: undefined })),
        { status: 200 },
      ),
    ) as unknown as typeof global.fetch;

    const { result } = renderHook(() => useQueryRewrite());

    let envelope;
    await act(async () => {
      envelope = await result.current.run({ query: 'x' });
    });

    expect(envelope?.degraded).toBe(true);
    const state = useSearchStore.getState();
    expect(state.baseFilters).toEqual({});
    expect(state.filters.keywords.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npx jest __tests__/hooks/useQueryRewrite.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement the hook**

Create `frontend/hooks/useQueryRewrite.ts`:

```ts
import { useCallback } from 'react';

import { useSearchStore } from '@/lib/store/searchStore';
import logger from '@/lib/logger';
import type {
  QueryRewriteRequest,
  RewrittenQueryEnvelope,
} from '@/types/query-rewrite';
import { queryRewriteEnvelopeSchema } from '@/lib/validation/query-rewrite-schema';

const hookLogger = logger.child('useQueryRewrite');

interface UseQueryRewriteReturn {
  run: (req: QueryRewriteRequest) => Promise<RewrittenQueryEnvelope>;
}

export function useQueryRewrite(): UseQueryRewriteReturn {
  const setBaseFilters = useSearchStore((s) => s.setBaseFilters);
  const setSelectedLanguages = useSearchStore((s) => s.setSelectedLanguages);
  const toggleFilter = useSearchStore((s) => s.toggleFilter);
  const setDateFilter = useSearchStore((s) => s.setDateFilter);
  const toggleCustomMetadataFilter = useSearchStore(
    (s) => s.toggleCustomMetadataFilter,
  );

  const run = useCallback<UseQueryRewriteReturn['run']>(
    async (req) => {
      const response = await fetch('/api/query_rewrite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      });

      const json = await response.json();
      const envelope = queryRewriteEnvelopeSchema.parse(json) as RewrittenQueryEnvelope;

      if (envelope.degraded) {
        hookLogger.warn('query rewrite degraded', {
          query: req.query,
        });
        return envelope;
      }

      // Numeric base filters
      const next = {
        numVictims: envelope.filters.base.base_num_victims,
        victimAgeOffence: envelope.filters.base.base_victim_age_offence,
        caseNumber: envelope.filters.base.base_case_number,
        coDefAccNum: envelope.filters.base.base_co_def_acc_num,
        appealJudgmentDate: envelope.filters.base.base_date_of_appeal_court_judgment_ts,
      };
      const cleaned = Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== undefined),
      );
      setBaseFilters(cleaned as never);

      // Language hint
      if (envelope.filters.languages.length > 0) {
        setSelectedLanguages(new Set(envelope.filters.languages));
      }

      // Keywords / legal_topics / cited_legislation → facet sidebar
      envelope.filters.arrays.keywords.forEach((v) =>
        toggleFilter('keywords', v),
      );
      envelope.filters.arrays.legal_topics.forEach((v) =>
        toggleFilter('legalConcepts', v),
      );
      envelope.filters.arrays.cited_legislation.forEach((v) =>
        toggleCustomMetadataFilter('cited_legislation', v),
      );

      // Categorical facets
      const facets = envelope.filters.facets;
      if (facets.jurisdiction) toggleFilter('jurisdictions', facets.jurisdiction);
      if (facets.court_level) toggleFilter('courtLevels', facets.court_level);
      if (facets.case_type) toggleCustomMetadataFilter('case_type', facets.case_type);
      if (facets.decision_type)
        toggleCustomMetadataFilter('decision_type', facets.decision_type);
      if (facets.outcome) toggleCustomMetadataFilter('outcome', facets.outcome);

      // Decision date → dateFrom / dateTo
      if (envelope.filters.decision_date?.from) {
        setDateFilter('dateFrom', new Date(envelope.filters.decision_date.from));
      }
      if (envelope.filters.decision_date?.to) {
        setDateFilter('dateTo', new Date(envelope.filters.decision_date.to));
      }

      return envelope;
    },
    [
      setBaseFilters,
      setSelectedLanguages,
      toggleFilter,
      setDateFilter,
      toggleCustomMetadataFilter,
    ],
  );

  return { run };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd frontend && npx jest __tests__/hooks/useQueryRewrite.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useQueryRewrite.ts \
        frontend/__tests__/hooks/useQueryRewrite.test.ts
git commit -m "feat(search): useQueryRewrite hydrates store with extracted filters"
```

---

## Task 12 — Wire into `useSearchResults` for thinking mode

**Files:**
- Modify: `frontend/hooks/useSearchResults.ts`
- Test: `frontend/__tests__/hooks/useSearchResults.thinking.test.tsx` (new)

- [ ] **Step 1: Re-read the existing hook to anchor the edit**

The hook's `search` function lives at `frontend/hooks/useSearchResults.ts:340`.
The right insertion point is **after** the existing `setIsSearching(true)`
call (currently around line 407) and **before** the Meilisearch branch
("STEP 3: Text and hybrid modes → Meilisearch" — currently around line
409). Run this to confirm the anchors before editing:

```bash
cd frontend && sed -n '340,420p' hooks/useSearchResults.ts | grep -n "setIsSearching(true)\|STEP 3:"
```

- [ ] **Step 2: Write the failing test**

Create `frontend/__tests__/hooks/useSearchResults.thinking.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react';

import { useSearchResults } from '@/hooks/useSearchResults';
import { useSearchStore } from '@/lib/store/searchStore';

jest.mock('@/hooks/useQueryRewrite', () => {
  const run = jest.fn(async () => ({
    rewritten_query: 'REWRITTEN',
    filters: {
      base: {},
      facets: {},
      arrays: { keywords: [], legal_topics: [], cited_legislation: [] },
      languages: [],
    },
    diagnostics: { dropped_terms: [], latency_ms: 0, model: 'fake' },
    degraded: false,
  }));
  return { useQueryRewrite: () => ({ run }), __run: run };
});

describe('useSearchResults — thinking mode rewrite hand-off', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    useSearchStore.setState({ searchType: 'thinking' });
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ documents: [], total: 0 }), { status: 200 }),
    ) as unknown as typeof global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('calls the rewriter before the search request and uses the rewritten query', async () => {
    const { result } = renderHook(() => useSearchResults());

    await act(async () => {
      await result.current.search('podatek VAT', { overrideMode: 'thinking' });
    });

    const { __run } = jest.requireMock('@/hooks/useQueryRewrite');
    expect(__run).toHaveBeenCalledWith({
      query: 'podatek VAT',
      languages_hint: expect.any(Array),
    });
    const fetchMock = global.fetch as jest.Mock;
    const searchRequest = fetchMock.mock.calls.find(
      ([url]) => typeof url === 'string' && url.includes('/api/search/documents'),
    );
    expect(searchRequest).toBeDefined();
    const body = JSON.parse(searchRequest![1].body as string);
    expect(body.query).toBe('REWRITTEN');
  });

  it('skips the rewriter in rabbit mode', async () => {
    const { result } = renderHook(() => useSearchResults());

    await act(async () => {
      await result.current.search('podatek VAT', { overrideMode: 'rabbit' });
    });

    const { __run } = jest.requireMock('@/hooks/useQueryRewrite');
    expect(__run).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

```bash
cd frontend && npx jest __tests__/hooks/useSearchResults.thinking.test.tsx
```

Expected: AssertionError — rewriter not called, search uses original query.

- [ ] **Step 4: Wire the rewriter into `useSearchResults`**

In `frontend/hooks/useSearchResults.ts`:

**(a)** Add the import near the other hook imports at the top of the file:

```ts
import { useQueryRewrite } from '@/hooks/useQueryRewrite';
```

**(b)** Inside the `useSearchResults` hook body, alongside the other hook
instantiations (search for `searchInProgressRef = useRef(false)` around
line 167 — add this nearby):

```ts
const { run: runRewrite } = useQueryRewrite();
```

**(c)** Inside the `search` callback (declared at line 340), insert the
following block **immediately after** `setIsSearching(true)` (currently
line 407) and **before** the "STEP 3" comment block:

```ts
// STEP 2b: In thinking mode, run the LLM rewriter first. The hook
// hydrates the store with extracted filters; we use the rewritten
// query for the actual search. Degrade silently on any failure.
let effectiveQuery = searchQuery;
if (modeToUse === 'thinking') {
  try {
    const envelope = await runRewrite({
      query: searchQuery,
      languages_hint: languagesToUse,
    });
    if (!envelope.degraded && envelope.rewritten_query) {
      effectiveQuery = envelope.rewritten_query;
    }
  } catch (err) {
    searchLogger.warn('query rewrite failed, using original query', { err });
  }
}
```

**(d)** Substitute `effectiveQuery` for `searchQuery` in the body of the
Meilisearch search request (search for `body: JSON.stringify({` inside
the same `search` callback). Leave the `searchQuery` parameter usage in
logging and `searchParamsKey` untouched — telemetry should reference the
user's original text.

- [ ] **Step 5: Run all hook tests, verify they pass**

```bash
cd frontend && npx jest hooks/useSearchResults hooks/useQueryRewrite -v 2>&1 | tail -30
```

Expected: existing useSearchResults tests still green, new ones pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/hooks/useSearchResults.ts \
        frontend/__tests__/hooks/useSearchResults.thinking.test.tsx
git commit -m "feat(search): thinking mode awaits query rewriter before issuing search"
```

---

## Task 13 — Playwright E2E

**Files:**
- Create: `frontend/__tests__/e2e/query-rewrite.spec.ts`

- [ ] **Step 1: Add the spec**

Create `frontend/__tests__/e2e/query-rewrite.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test.describe('LLM query rewrite — thinking mode', () => {
  test('extracts a court_level chip and uses the rewritten query', async ({
    page,
  }) => {
    await page.route('**/api/query_rewrite', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rewritten_query: 'VAT podatek od towarów i usług',
          filters: {
            base: {},
            facets: { jurisdiction: 'PL', court_level: 'appellate' },
            arrays: {
              keywords: ['VAT'],
              legal_topics: [],
              cited_legislation: [],
            },
            decision_date: { from: '2022-01-01', to: '2022-12-31' },
            languages: ['pl'],
          },
          diagnostics: {
            dropped_terms: [],
            latency_ms: 200,
            model: 'gpt-5-mini',
          },
          degraded: false,
        }),
      }),
    );

    const searchRequests: { url: string; body: string }[] = [];
    await page.route('**/api/search/documents**', async (route, request) => {
      searchRequests.push({
        url: request.url(),
        body: request.postData() ?? '',
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents: [], total: 0 }),
      });
    });

    await page.goto('/search');
    await page.getByRole('textbox', { name: /search/i }).fill(
      'wyroki sądu apelacyjnego z 2022 dotyczące VAT',
    );
    await page.getByRole('button', { name: /thinking/i }).click();
    await page.getByRole('button', { name: /^search$/i }).click();

    await expect(page.getByText(/court level/i)).toBeVisible();
    await expect(page.getByText('appellate')).toBeVisible();
    await expect.poll(() => searchRequests.length).toBeGreaterThan(0);
    const lastSearch = searchRequests[searchRequests.length - 1];
    expect(lastSearch.body).toContain('VAT podatek od towarów i usług');
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
cd frontend && npx playwright test query-rewrite.spec.ts --reporter=line
```

Expected: 1 passed.

> If the existing search page uses a different submit selector, adjust
> the `getByRole` queries to match. Selectors should not be invented —
> run `npx playwright codegen http://localhost:3026/search` to capture
> the real ones.

- [ ] **Step 3: Commit**

```bash
git add frontend/__tests__/e2e/query-rewrite.spec.ts
git commit -m "test(search): Playwright E2E for thinking-mode query rewrite"
```

---

## Task 14 — Feature gate + docs

**Files:**
- Modify: `backend/app/judgments_pkg/query_rewrite.py`
- Modify: `.env.example`
- Create: `docs/how-to/run-query-rewrite-locally.md`

- [ ] **Step 1: Add the gate**

In `backend/app/judgments_pkg/query_rewrite.py`, add at module scope:

```python
import os

QUERY_REWRITE_ENABLED = os.getenv("QUERY_REWRITE_ENABLED", "true").lower() == "true"
```

In `rewrite_query`, at the top:

```python
if not QUERY_REWRITE_ENABLED:
    return RewrittenQueryEnvelope(rewritten_query=body.query, degraded=True)
```

- [ ] **Step 2: Document the env var**

Append to `.env.example`:

```
# Toggle the LLM query rewriter for /search thinking mode. When false,
# the endpoint immediately returns the user's query with degraded=true
# and the frontend transparently falls back to the original query.
QUERY_REWRITE_ENABLED=true
```

- [ ] **Step 3: Add the how-to doc**

Create `docs/how-to/run-query-rewrite-locally.md`:

```markdown
# Run the LLM query rewriter locally

The LLM query rewriter converts natural-language Polish and English search
queries into a cleaned query string plus structured Meilisearch filters.
It runs only in the `/search` page's "thinking" mode.

## Prerequisites

- Backend running on port 8004 (`poetry run uvicorn app.server:app --reload --port 8004`).
- Frontend running on port 3026 (`cd frontend && npm run dev`).
- `OPENAI_API_KEY` set; the chain uses `gpt-5-mini`.
- Meilisearch reachable (used by the facet validator).

## Toggling the feature

The endpoint reads `QUERY_REWRITE_ENABLED` (default `true`). To disable
without touching code, set:

```sh
export QUERY_REWRITE_ENABLED=false
```

The frontend falls back transparently to the original query when the
endpoint returns `degraded: true`.

## Smoke test the backend route

```sh
curl -s http://localhost:8004/documents/search/rewrite \
  -H "X-API-Key: $BACKEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "wyroki sądu apelacyjnego z 2022 dotyczące VAT", "languages_hint": ["pl"]}' \
  | jq
```

Expected: `filters.facets.court_level == "appellate"` and
`filters.decision_date.from` is `2022-01-01`.

## Tests

- `backend && poetry run pytest tests/app/test_query_rewrite_route.py tests/app/test_facet_validation.py packages/juddges_search/tests/test_query_rewrite_chain.py -v`
- `frontend && npx jest hooks/useQueryRewrite lib/validation/query-rewrite-schema api/query_rewrite-route`
- `frontend && npx playwright test query-rewrite.spec.ts`
```

- [ ] **Step 4: Run the full suite as a sanity check**

```bash
cd backend && poetry run poe check-all 2>&1 | tail -20
cd ../frontend && npm run validate 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/judgments_pkg/query_rewrite.py \
        .env.example \
        docs/how-to/run-query-rewrite-locally.md
git commit -m "feat(search): QUERY_REWRITE_ENABLED gate and how-to docs"
```

---

## Task 15 — Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/llm-query-rewrite
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(search): LLM-based query rewrite for thinking mode" \
  --body "$(cat <<'EOF'
## Summary
- Adds POST /documents/search/rewrite — LLM (gpt-5-mini, structured output) returns rewritten query + structured filters.
- FacetValidator round-trips open-vocab arrays through Meilisearch facet-search; clamps numeric ranges; validates dates; normalises languages.
- Thinking-mode search now hydrates the search store with extracted filters before issuing the Meilisearch request.
- Behind QUERY_REWRITE_ENABLED (default true) — flip to false to disable without a redeploy.

## Test plan
- [ ] Backend unit: `poetry run pytest packages/juddges_search/tests/test_query_rewrite_models.py packages/juddges_search/tests/test_query_rewrite_chain.py tests/app/test_query_rewrite_route.py tests/app/test_facet_validation.py tests/app/test_meili_facet_search.py tests/app/test_meilisearch_config_vocab.py`
- [ ] Frontend unit: `npx jest hooks/useQueryRewrite hooks/useSearchResults.thinking api/query_rewrite-route lib/validation/query-rewrite-schema`
- [ ] E2E: `npx playwright test query-rewrite.spec.ts`
- [ ] Manual: `/search` thinking mode submits a Polish query, expected facet chips appear, results render
EOF
)"
```

---

## Deferred follow-ups (out of scope for this plan)

These items appear in the spec but are intentionally left for a follow-up
PR. They are not required for the feature to ship behind the
`QUERY_REWRITE_ENABLED` gate.

- **8-golden-query backend integration suite** (spec §8). Runs against
  real OpenAI + real Meilisearch facet-search and is marked
  `@pytest.mark.integration` so it stays out of the required CI checks.
  Track in a follow-up issue: include 4 PL queries (e.g. court-level +
  date range, numeric range, cited-legislation, multi-keyword) and 4 EN
  queries; assert `dropped_terms == []` and at least one expected facet
  per query.
- **Numeric `MIN_MAX_BY_FIELD` bounds populated from index aggregates**
  at app startup (spec §5). The plan ships with `numeric_bounds={}`
  (no clamp). Add once we have a SQL aggregate query and a startup hook
  that doesn't slow boot.

## Acceptance checklist

- [ ] All four required CI checks green (Backend Lint, Backend Unit Tests, Frontend Lint & Typecheck, Frontend Unit Tests).
- [ ] Manual smoke test: submit `wyroki sądu apelacyjnego z 2022 dotyczące VAT` in thinking mode — facet sidebar shows the appellate chip; results call uses the rewritten query (verify via DevTools network panel).
- [ ] Setting `QUERY_REWRITE_ENABLED=false` in the backend env restores the pre-feature behaviour exactly.
- [ ] No regression in rabbit mode — the rewriter is never called for it (asserted by Task 12's second test).
