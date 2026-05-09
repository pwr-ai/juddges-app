"""Search quality tests with initial judge scoring and latency checks.

These tests cover varied search scenarios:
1. Basic keyword search
2. Pure semantic (alpha=1.0) search
3. Hybrid search
4. Thinking mode search
5. Language filtering
6. Jurisdiction/court/date filtering
7. Array-overlap filtering
8. Pagination page 1
9. Pagination page 2
10. Base-schema extracted-data filtering
11. Misspelled query baseline
12. Multilingual Polish query with jurisdiction filter
13. Boolean-style query parsing behavior
14. Conflicting filters returning no results
15. Adversarial query stability
16. Invalid mode validation
17. Invalid alpha validation
18. Base-schema filter no-match path
"""

from __future__ import annotations

import json
import os
import statistics
import time
from datetime import date
from importlib import import_module
from typing import TYPE_CHECKING, Any

import pytest

import app.documents_pkg.utils as documents_module

if TYPE_CHECKING:
    from httpx import AsyncClient

results_router_module = import_module("app.extraction_domain.results_router")
query_analysis_module = import_module("app.query_analysis")


def _tokenize(text: str | None) -> set[str]:
    if not text:
        return set()
    cleaned = []
    for ch in text.lower():
        if ch.isalnum() or ch.isspace():
            cleaned.append(ch)
        else:
            cleaned.append(" ")
    return {t for t in "".join(cleaned).split() if len(t) > 2}


def _expand_query_tokens(tokens: set[str]) -> set[str]:
    synonyms = {
        "contract": {"agreement", "breach", "lease", "termination"},
        "liability": {"negligence", "damages", "duty", "care"},
        "tax": {"vat", "ruling", "fiscal"},
        "appeal": {"appellate", "challenge"},
        "criminal": {"sentencing", "offence", "fraud"},
    }
    expanded = set(tokens)
    for token in list(tokens):
        expanded |= synonyms.get(token, set())
    return expanded


def _has_real_openai_key() -> bool:
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        return False
    if key.startswith("test-") or key.startswith("sk-dummy"):
        return False
    return key.startswith("sk-")


def _heuristic_judge_validity(
    query: str, chunks: list[dict[str, Any]]
) -> dict[str, Any]:
    """Initial relevance judge used in tests.

    This is intentionally lightweight and deterministic for CI:
    - computes query/content token overlap with synonym expansion
    - returns per-result score + valid flag
    """
    q_tokens = _expand_query_tokens(_tokenize(query))
    judgments = []
    for chunk in chunks[:5]:
        content = " ".join(
            [
                chunk.get("chunk_text", "") or "",
                str((chunk.get("metadata") or {}).get("case_number", "")),
                str((chunk.get("metadata") or {}).get("court_name", "")),
            ]
        )
        c_tokens = _tokenize(content)
        overlap = len(q_tokens & c_tokens)
        score = overlap / max(len(q_tokens), 1)
        judgments.append(
            {
                "document_id": chunk.get("document_id"),
                "score": round(score, 3),
                "is_valid": score >= 0.15,
            }
        )

    valid_ratio = (
        sum(1 for j in judgments if j["is_valid"]) / len(judgments)
        if judgments
        else 0.0
    )
    avg_score = (
        sum(float(j["score"]) for j in judgments) / len(judgments) if judgments else 0.0
    )
    return {
        "judge_name": "initial-validity-judge-v1",
        "valid_ratio": round(valid_ratio, 3),
        "avg_score": round(avg_score, 3),
        "judgments": judgments,
    }


async def _judge_validity(query: str, chunks: list[dict[str, Any]]) -> dict[str, Any]:
    """Judge relevance via LLM (optional) with deterministic fallback.

    To enable real LLM judging for local runs:
    - set `SEARCH_LLM_JUDGE=1`
    - configure a real `OPENAI_API_KEY`
    """
    if os.getenv("SEARCH_LLM_JUDGE") != "1" or not _has_real_openai_key():
        return _heuristic_judge_validity(query, chunks)

    try:
        from openai import AsyncOpenAI
    except Exception:
        return _heuristic_judge_validity(query, chunks)

    try:
        client = AsyncOpenAI()
        judgments = []
        for chunk in chunks[:5]:
            prompt = (
                "Rate if this search result is valid for the query.\n"
                f"Query: {query}\n"
                f"Result text: {chunk.get('chunk_text', '')}\n"
                "Return JSON object with keys: score (0..1), is_valid (bool), rationale (string)."
            )
            completion = await client.chat.completions.create(
                model="gpt-5-mini",
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
            )
            content = completion.choices[0].message.content or "{}"
            payload = json.loads(content)
            score = float(payload.get("score", 0.0))
            judgments.append(
                {
                    "document_id": chunk.get("document_id"),
                    "score": round(max(0.0, min(score, 1.0)), 3),
                    "is_valid": bool(payload.get("is_valid", score >= 0.5)),
                }
            )

        valid_ratio = (
            sum(1 for j in judgments if j["is_valid"]) / len(judgments)
            if judgments
            else 0.0
        )
        avg_score = (
            sum(float(j["score"]) for j in judgments) / len(judgments)
            if judgments
            else 0.0
        )
        return {
            "judge_name": "openai:gpt-5-mini",
            "valid_ratio": round(valid_ratio, 3),
            "avg_score": round(avg_score, 3),
            "judgments": judgments,
        }
    except Exception:
        return _heuristic_judge_validity(query, chunks)


def _to_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _array_overlaps(
    row_values: list[str] | None, filter_values: list[str] | None
) -> bool:
    if filter_values is None:
        return True
    if not row_values:
        return False
    return bool(set(row_values) & set(filter_values))


class _FakeSupabase:
    class _ExecuteResult:
        def __init__(self, data: list[dict[str, Any]]):
            self.data = data

        def __await__(self):
            async def _wrapped():
                return self

            return _wrapped().__await__()

    class _RPCResult:
        def __init__(self, data: list[dict[str, Any]]):
            self._data = data

        def execute(self):
            # Compatible with both call styles:
            # - response = rpc.execute()            (sync)
            # - response = await rpc.execute()      (async)
            return _FakeSupabase._ExecuteResult(self._data)

    def __init__(self, rows: list[dict[str, Any]], embedding_lookup: dict[str, str]):
        self._rows = rows
        self._embedding_lookup = embedding_lookup

    def rpc(self, fn_name: str, params: dict[str, Any]):
        if fn_name == "search_judgments_hybrid":
            data = self._search_judgments_hybrid(params)
            return self._RPCResult(data)
        if fn_name == "filter_documents_by_extracted_data":
            data = self._filter_documents_by_extracted_data(params)
            return self._RPCResult(data)
        raise AssertionError(f"Unexpected RPC: {fn_name}")

    def _search_judgments_hybrid(self, params: dict[str, Any]) -> list[dict[str, Any]]:
        query_embedding = params.get("query_embedding")
        embedding_key = ",".join(f"{float(v):.6f}" for v in (query_embedding or []))
        recovered_query = self._embedding_lookup.get(embedding_key, "")
        search_text = params.get("search_text") or recovered_query

        filter_jurisdictions = params.get("filter_jurisdictions")
        filter_court_names = params.get("filter_court_names")
        filter_court_levels = params.get("filter_court_levels")
        filter_case_types = params.get("filter_case_types")
        filter_decision_types = params.get("filter_decision_types")
        filter_outcomes = params.get("filter_outcomes")
        filter_keywords = params.get("filter_keywords")
        filter_legal_topics = params.get("filter_legal_topics")
        filter_cited_legislation = params.get("filter_cited_legislation")
        filter_date_from = _to_date(params.get("filter_date_from"))
        filter_date_to = _to_date(params.get("filter_date_to"))

        alpha = float(params.get("hybrid_alpha", 0.5))
        limit = int(params.get("result_limit", 20))
        offset = int(params.get("result_offset", 0))

        query_tokens = _expand_query_tokens(_tokenize(search_text))
        matched = []

        for row in self._rows:
            row_date = _to_date(row.get("decision_date"))
            if (
                filter_jurisdictions
                and row.get("jurisdiction") not in filter_jurisdictions
            ):
                continue
            if filter_court_names and row.get("court_name") not in filter_court_names:
                continue
            if (
                filter_court_levels
                and row.get("court_level") not in filter_court_levels
            ):
                continue
            if filter_case_types and row.get("case_type") not in filter_case_types:
                continue
            if (
                filter_decision_types
                and row.get("decision_type") not in filter_decision_types
            ):
                continue
            if filter_outcomes and row.get("outcome") not in filter_outcomes:
                continue
            if filter_date_from and row_date and row_date < filter_date_from:
                continue
            if filter_date_to and row_date and row_date > filter_date_to:
                continue
            if not _array_overlaps(row.get("keywords"), filter_keywords):
                continue
            if not _array_overlaps(row.get("legal_topics"), filter_legal_topics):
                continue
            if not _array_overlaps(
                row.get("cited_legislation"), filter_cited_legislation
            ):
                continue

            text_tokens = _tokenize(
                " ".join(
                    [
                        row.get("title", "") or "",
                        row.get("summary", "") or "",
                        row.get("full_text", "") or "",
                    ]
                )
            )
            semantic_tokens = set(row.get("semantic_tags", []))
            text_score = len(query_tokens & text_tokens) / max(len(query_tokens), 1)
            vector_score = len(query_tokens & semantic_tokens) / max(
                len(query_tokens), 1
            )
            combined_score = (alpha * vector_score) + ((1.0 - alpha) * text_score)

            if search_text and combined_score == 0:
                continue

            matched.append(
                {
                    "id": row["id"],
                    "case_number": row["case_number"],
                    "title": row["title"],
                    "summary": row["summary"],
                    "full_text": row["full_text"],
                    "jurisdiction": row["jurisdiction"],
                    "court_name": row["court_name"],
                    "court_level": row["court_level"],
                    "case_type": row["case_type"],
                    "decision_type": row["decision_type"],
                    "outcome": row["outcome"],
                    "decision_date": row["decision_date"],
                    "publication_date": row["publication_date"],
                    "keywords": row["keywords"],
                    "legal_topics": row["legal_topics"],
                    "cited_legislation": row["cited_legislation"],
                    "judges": row["judges"],
                    "metadata": row["metadata"],
                    "source_dataset": row["source_dataset"],
                    "source_id": row["source_id"],
                    "source_url": row["source_url"],
                    "vector_score": round(vector_score, 4),
                    "text_score": round(text_score, 4),
                    "combined_score": round(combined_score, 4),
                    "chunk_text": row["summary"] or row["title"],
                    "chunk_type": "summary",
                    "chunk_start_pos": 0,
                    "chunk_end_pos": len(row["summary"] or row["title"]),
                    "chunk_metadata": {
                        "court_name": row["court_name"],
                        "case_number": row["case_number"],
                        "jurisdiction": row["jurisdiction"],
                    },
                }
            )

        matched.sort(key=lambda r: r["combined_score"], reverse=True)
        return matched[offset : offset + limit]

    def _filter_documents_by_extracted_data(
        self, params: dict[str, Any]
    ) -> list[dict[str, Any]]:
        p_filters = params.get("p_filters") or {}
        p_text_query = (params.get("p_text_query") or "").lower().strip()
        p_limit = int(params.get("p_limit", 50))
        p_offset = int(params.get("p_offset", 0))

        filtered = []
        for row in self._rows:
            if row.get("base_extraction_status") != "completed":
                continue

            if "appellant" in p_filters:
                expected = p_filters["appellant"]
                if isinstance(expected, list):
                    if row.get("base_appellant") not in expected:
                        continue
                elif row.get("base_appellant") != expected:
                    continue

            if "appeal_outcome" in p_filters:
                expected_outcomes = p_filters["appeal_outcome"]
                if not isinstance(expected_outcomes, list):
                    expected_outcomes = [expected_outcomes]
                if not _array_overlaps(
                    row.get("base_appeal_outcome"), expected_outcomes
                ):
                    continue

            if p_text_query:
                searchable = " ".join(
                    [
                        row.get("base_case_name", "") or "",
                        row.get("base_neutral_citation_number", "") or "",
                        " ".join(row.get("base_keywords") or []),
                    ]
                ).lower()
                if p_text_query not in searchable:
                    continue

            filtered.append(
                {
                    "id": row["id"],
                    "case_number": row["case_number"],
                    "title": row["title"],
                    "jurisdiction": row["jurisdiction"],
                    "decision_date": row["decision_date"],
                    "extracted_data": row["base_raw_extraction"],
                }
            )

        total = len(filtered)
        paged = filtered[p_offset : p_offset + p_limit]
        for item in paged:
            item["total_count"] = total
        return paged


@pytest.fixture
def anyio_backend() -> str:
    """Force asyncio backend for deterministic timing behavior."""
    return "asyncio"


@pytest.fixture
def mocked_search_stack(monkeypatch: pytest.MonkeyPatch):
    """Mock embeddings + Supabase RPC for deterministic search tests."""
    embedding_lookup: dict[str, str] = {}

    rows = [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "case_number": "UK-CA-2024-001",
            "title": "Contract breach and damages",
            "summary": "The court found breach of contract and awarded damages.",
            "full_text": "Breach of contract, payment default, damages and remedies.",
            "jurisdiction": "UK",
            "court_name": "Court of Appeal",
            "court_level": "Appeal Court",
            "case_type": "Civil",
            "decision_type": "Judgment",
            "outcome": "Granted",
            "decision_date": "2024-01-15",
            "publication_date": "2024-01-20",
            "keywords": ["contract", "damages", "breach"],
            "legal_topics": ["contract law", "civil procedure"],
            "cited_legislation": ["Contract Act"],
            "judges": [],
            "metadata": {"language": "en"},
            "source_dataset": "demo",
            "source_id": "1",
            "source_url": "https://example.test/1",
            "semantic_tags": {"contract", "breach", "damages", "agreement"},
            "base_extraction_status": "completed",
            "base_appellant": "prosecution",
            "base_appeal_outcome": ["outcome_dismissed_or_refused"],
            "base_case_name": "R v Smith",
            "base_neutral_citation_number": "UKCA 2024/100",
            "base_keywords": ["contract", "damages"],
            "base_raw_extraction": {
                "appellant": "prosecution",
                "appeal_outcome": ["outcome_dismissed_or_refused"],
            },
        },
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "case_number": "UK-HC-2023-013",
            "title": "Negligence and duty of care",
            "summary": "Liability established for negligence and breach of duty of care.",
            "full_text": "Tort case with accident damages and negligence analysis.",
            "jurisdiction": "UK",
            "court_name": "High Court",
            "court_level": "High Court",
            "case_type": "Civil",
            "decision_type": "Judgment",
            "outcome": "Granted",
            "decision_date": "2023-09-10",
            "publication_date": "2023-09-12",
            "keywords": ["negligence", "liability", "damages"],
            "legal_topics": ["tort law"],
            "cited_legislation": ["Torts Act"],
            "judges": [],
            "metadata": {"language": "en"},
            "source_dataset": "demo",
            "source_id": "2",
            "source_url": "https://example.test/2",
            "semantic_tags": {"liability", "negligence", "damages", "duty", "care"},
            "base_extraction_status": "completed",
            "base_appellant": "defense",
            "base_appeal_outcome": ["outcome_other"],
            "base_case_name": "R v Daniels",
            "base_neutral_citation_number": "UKHC 2023/19",
            "base_keywords": ["negligence"],
            "base_raw_extraction": {"appellant": "defense"},
        },
        {
            "id": "33333333-3333-3333-3333-333333333333",
            "case_number": "PL-NSA-2024-055",
            "title": "VAT tax ruling appeal",
            "summary": "Taxpayer challenged VAT ruling; appeal partially allowed.",
            "full_text": "Fiscal dispute over VAT deduction and administrative procedure.",
            "jurisdiction": "PL",
            "court_name": "Naczelny Sąd Administracyjny",
            "court_level": "Supreme Court",
            "case_type": "Administrative",
            "decision_type": "Judgment",
            "outcome": "Partially Granted",
            "decision_date": "2024-05-22",
            "publication_date": "2024-05-25",
            "keywords": ["tax", "vat", "appeal"],
            "legal_topics": ["tax law"],
            "cited_legislation": ["VAT Act"],
            "judges": [],
            "metadata": {"language": "pl"},
            "source_dataset": "demo",
            "source_id": "3",
            "source_url": "https://example.test/3",
            "semantic_tags": {"tax", "vat", "ruling", "appeal", "fiscal"},
            "base_extraction_status": "completed",
            "base_appellant": "prosecution",
            "base_appeal_outcome": ["outcome_sentence_more_lenient"],
            "base_case_name": "Podatnik v Organ",
            "base_neutral_citation_number": "PLNSA 2024/55",
            "base_keywords": ["tax", "vat"],
            "base_raw_extraction": {"appellant": "prosecution"},
        },
        {
            "id": "44444444-4444-4444-4444-444444444444",
            "case_number": "UK-CC-2022-220",
            "title": "Criminal sentencing for fraud",
            "summary": "Court reviewed fraud sentence and upheld custodial term.",
            "full_text": "Criminal offence sentencing decision regarding fraud.",
            "jurisdiction": "UK",
            "court_name": "Crown Court",
            "court_level": "Trial Court",
            "case_type": "Criminal",
            "decision_type": "Order",
            "outcome": "Dismissed",
            "decision_date": "2022-11-03",
            "publication_date": "2022-11-08",
            "keywords": ["criminal", "sentencing", "fraud"],
            "legal_topics": ["criminal law"],
            "cited_legislation": ["Penal Code"],
            "judges": [],
            "metadata": {"language": "en"},
            "source_dataset": "demo",
            "source_id": "4",
            "source_url": "https://example.test/4",
            "semantic_tags": {"criminal", "sentencing", "offence", "fraud"},
            "base_extraction_status": "completed",
            "base_appellant": "defense",
            "base_appeal_outcome": ["outcome_dismissed_or_refused"],
            "base_case_name": "R v Fraudster",
            "base_neutral_citation_number": "UKCC 2022/220",
            "base_keywords": ["fraud"],
            "base_raw_extraction": {"appellant": "defense"},
        },
        {
            "id": "55555555-5555-5555-5555-555555555555",
            "case_number": "UK-LC-2021-420",
            "title": "Lease termination dispute",
            "summary": "Landlord sought lease termination after rent arrears.",
            "full_text": "Property lease agreement dispute and termination request.",
            "jurisdiction": "UK",
            "court_name": "High Court",
            "court_level": "High Court",
            "case_type": "Civil",
            "decision_type": "Judgment",
            "outcome": "Granted",
            "decision_date": "2021-03-14",
            "publication_date": "2021-03-18",
            "keywords": ["lease", "termination", "property"],
            "legal_topics": ["property law", "contract law"],
            "cited_legislation": ["Lease Act"],
            "judges": [],
            "metadata": {"language": "en"},
            "source_dataset": "demo",
            "source_id": "5",
            "source_url": "https://example.test/5",
            "semantic_tags": {"lease", "termination", "agreement", "contract"},
            "base_extraction_status": "pending",
            "base_appellant": None,
            "base_appeal_outcome": [],
            "base_case_name": "Lease Co v Tenant",
            "base_neutral_citation_number": "UKLC 2021/420",
            "base_keywords": ["lease"],
            "base_raw_extraction": {},
        },
    ]

    async def fake_generate_embedding(text: str) -> list[float]:
        token_count = len(_tokenize(text))
        value = (sum(ord(ch) for ch in text) % 1000) / 1000
        embedding = [round(value, 6), float(token_count), 0.123456]
        key = ",".join(f"{float(v):.6f}" for v in embedding)
        embedding_lookup[key] = text
        return embedding

    fake_supabase = _FakeSupabase(rows=rows, embedding_lookup=embedding_lookup)

    async def fake_get_async_supabase_client():
        return fake_supabase

    async def fake_analyze_query_with_fallback(query: str, llm=None):
        return (
            query_analysis_module.QueryAnalysisResult(
                semantic_query=query,
                keyword_query=query,
                query_type="mixed",
            ),
            "heuristic",
            None,
        )

    monkeypatch.setattr(documents_module, "generate_embedding", fake_generate_embedding)
    monkeypatch.setattr("app.core.supabase.get_supabase_client", lambda: fake_supabase)
    monkeypatch.setattr(
        "app.core.supabase.get_async_supabase_client",
        fake_get_async_supabase_client,
    )
    monkeypatch.setattr(
        query_analysis_module,
        "analyze_query_with_fallback",
        fake_analyze_query_with_fallback,
    )
    monkeypatch.setattr(results_router_module, "supabase", fake_supabase)

    return {"rows": rows}


async def _post_with_timing(client: AsyncClient, path: str, payload: dict[str, Any]):
    start = time.perf_counter()
    response = await client.post(path, json=payload)
    latency_ms = (time.perf_counter() - start) * 1000
    return response, latency_ms


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_01_basic_keyword_search(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {"query": "contract breach", "alpha": 0.0, "mode": "rabbit", "limit_docs": 10},
    )
    assert response.status_code == 200
    assert latency_ms < 1500

    data = response.json()
    assert data["chunks"]
    judge = await _judge_validity("contract breach", data["chunks"])
    assert judge["valid_ratio"] >= 0.6


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_02_pure_semantic_search(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {
            "query": "duty of care accident damages",
            "alpha": 1.0,
            "mode": "rabbit",
            "limit_docs": 10,
        },
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["chunks"]
    judge = await _judge_validity("duty of care accident damages", data["chunks"])
    assert judge["avg_score"] >= 0.15


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_03_hybrid_search(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {"query": "lease termination agreement", "alpha": 0.5, "limit_docs": 10},
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["chunks"]
    judge = await _judge_validity("lease termination agreement", data["chunks"])
    assert judge["valid_ratio"] >= 0.5


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_04_thinking_mode(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {
            "query": "challenge vat ruling",
            "mode": "thinking",
            "alpha": 0.5,
            "limit_docs": 10,
        },
    )
    assert response.status_code == 200
    assert latency_ms < 2000
    data = response.json()
    assert data["query_enhancement_used"] is True
    assert data["chunks"]
    judge = await _judge_validity("challenge vat ruling", data["chunks"])
    assert judge["valid_ratio"] >= 0.5


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_05_language_filtering(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {"query": "appeal judgment", "languages": ["en"], "limit_docs": 10},
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["documents"]
    # Current implementation uses `languages` to select text-search configuration
    # (e.g., english/simple), not as a hard jurisdiction filter.
    assert all(doc.get("language") in {"en", "pl"} for doc in data["documents"])


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_06_jurisdiction_court_date_filters(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {
            "query": "contract damages",
            "jurisdictions": ["UK"],
            "court_names": ["Court of Appeal"],
            "date_from": "2024-01-01",
            "date_to": "2024-12-31",
            "limit_docs": 10,
        },
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["documents"]
    assert all(doc["country"] == "UK" for doc in data["documents"])
    assert all(doc["court_name"] == "Court of Appeal" for doc in data["documents"])


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_07_array_overlap_filters(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {
            "query": "fraud sentencing",
            "keywords": ["fraud"],
            "legal_topics": ["criminal law"],
            "cited_legislation": ["Penal Code"],
            "limit_docs": 10,
        },
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["documents"]
    for doc in data["documents"]:
        assert "fraud" in (doc.get("keywords") or [])


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_08_pagination_page_1(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {"query": "law", "limit_docs": 2, "offset": 0},
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert len(data["documents"]) <= 2
    assert data["pagination"]["offset"] == 0


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_09_pagination_page_2(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response_1 = await authenticated_client.post(
        "/documents/search",
        json={"query": "law", "limit_docs": 2, "offset": 0},
    )
    response_2, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {"query": "law", "limit_docs": 2, "offset": 2},
    )
    assert response_1.status_code == 200
    assert response_2.status_code == 200
    assert latency_ms < 1500

    data_1 = response_1.json()
    data_2 = response_2.json()
    ids_1 = {doc["document_id"] for doc in data_1["documents"]}
    ids_2 = {doc["document_id"] for doc in data_2["documents"]}
    assert data_2["pagination"]["offset"] == 2
    assert ids_1.isdisjoint(ids_2)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_10_base_schema_filtering(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/extractions/base-schema/filter",
        {
            "filters": {
                "appellant": "prosecution",
                "appeal_outcome": ["outcome_dismissed_or_refused"],
            },
            "text_query": "Smith",
            "limit": 50,
            "offset": 0,
        },
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["documents"]
    assert data["total_count"] >= 1
    assert data["documents"][0]["extracted_data"]["appellant"] == "prosecution"


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_11_misspelled_query_baseline(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    """Baseline quality check: typo query currently returns no matches."""
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {"query": "contrcat brech", "alpha": 0.0, "mode": "rabbit", "limit_docs": 10},
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["documents"] == []
    assert data["chunks"] == []


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_12_multilingual_polish_query_with_filter(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {
            "query": "podatek vat apelacja",
            "languages": ["pl"],
            "jurisdictions": ["PL"],
            "alpha": 0.0,
            "mode": "rabbit",
            "limit_docs": 10,
        },
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["documents"]
    assert all(doc["country"] == "PL" for doc in data["documents"])


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_13_boolean_style_query(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {
            "query": "fraud AND sentencing",
            "alpha": 0.5,
            "mode": "rabbit",
            "limit_docs": 10,
        },
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["documents"]
    assert any(doc["document_number"] == "UK-CC-2022-220" for doc in data["documents"])


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_14_conflicting_filters_return_empty(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {
            "query": "appeal",
            "jurisdictions": ["PL"],
            "court_names": ["Court of Appeal"],
            "limit_docs": 10,
        },
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["documents"] == []
    assert data["chunks"] == []


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_15_adversarial_query_stability(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/documents/search",
        {
            "query": "'; DROP TABLE judgments;--",
            "alpha": 0.0,
            "mode": "rabbit",
            "limit_docs": 10,
        },
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert isinstance(data["documents"], list)
    assert isinstance(data["chunks"], list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_16_invalid_mode_validation(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response = await authenticated_client.post(
        "/documents/search",
        json={"query": "contract breach", "mode": "turbo"},
    )
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_17_invalid_alpha_validation(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response = await authenticated_client.post(
        "/documents/search",
        json={"query": "contract breach", "alpha": 1.5},
    )
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_case_18_base_schema_filtering_no_match(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    response, latency_ms = await _post_with_timing(
        authenticated_client,
        "/extractions/base-schema/filter",
        {
            "filters": {
                "appellant": "prosecution",
                "appeal_outcome": ["outcome_conviction_quashed"],
            },
            "text_query": "non-existent-phrase",
            "limit": 50,
            "offset": 0,
        },
    )
    assert response.status_code == 200
    assert latency_ms < 1500
    data = response.json()
    assert data["documents"] == []
    assert data["total_count"] == 0


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.search
async def test_latency_and_judged_accuracy_summary(
    authenticated_client: AsyncClient, mocked_search_stack: dict[str, Any]
):
    """Aggregate guardrail: p95 latency + judged validity across core cases."""
    core_cases = [
        {"query": "contract breach", "alpha": 0.0, "limit_docs": 5},
        {"query": "duty of care damages", "alpha": 1.0, "limit_docs": 5},
        {"query": "challenge vat ruling", "alpha": 0.5, "limit_docs": 5},
        {"query": "fraud sentencing", "alpha": 0.5, "limit_docs": 5},
        {"query": "lease termination", "alpha": 0.5, "limit_docs": 5},
    ]

    latencies = []
    avg_scores = []
    valid_ratios = []

    for payload in core_cases:
        response, latency_ms = await _post_with_timing(
            authenticated_client,
            "/documents/search",
            payload,
        )
        assert response.status_code == 200
        latencies.append(latency_ms)

        data = response.json()
        judge = await _judge_validity(payload["query"], data["chunks"])
        avg_scores.append(judge["avg_score"])
        valid_ratios.append(judge["valid_ratio"])

    p95 = (
        statistics.quantiles(latencies, n=20)[18]
        if len(latencies) >= 20
        else max(latencies)
    )
    avg_latency = statistics.mean(latencies)
    avg_judge_score = statistics.mean(avg_scores)
    avg_valid_ratio = statistics.mean(valid_ratios)

    print("\n=== Search Judge Summary ===")
    print(f"avg_latency_ms={avg_latency:.2f}")
    print(f"p95_latency_ms={p95:.2f}")
    print(f"avg_judge_score={avg_judge_score:.3f}")
    print(f"avg_valid_ratio={avg_valid_ratio:.3f}")
    print("judge=initial-validity-judge-v1")

    assert p95 < 1500
    assert avg_judge_score >= 0.12
    assert avg_valid_ratio >= 0.45
