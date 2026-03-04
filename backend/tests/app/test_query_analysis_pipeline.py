"""Unit tests for LLM query analysis in /documents/search."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.documents import search_documents
from app.models import SearchChunksRequest
from app.query_analysis import QueryAnalysisResult


class _FakeSupabase:
    def __init__(self, capture: dict[str, Any]):
        self.capture = capture

    def rpc(self, fn_name: str, params: dict[str, Any]):
        self.capture["rpc_name"] = fn_name
        self.capture["rpc_params"] = params

        row = {
            "id": "11111111-1111-1111-1111-111111111111",
            "case_number": "UK-CA-2024-001",
            "title": "Contract breach and damages",
            "summary": "The court found breach of contract and awarded damages.",
            "full_text": "Full text",
            "jurisdiction": "UK",
            "court_name": "Court of Appeal",
            "court_level": "Appeal Court",
            "case_type": "Civil",
            "decision_type": "Judgment",
            "outcome": "Granted",
            "decision_date": "2024-01-15",
            "publication_date": "2024-01-20",
            "keywords": ["contract", "damages"],
            "legal_topics": ["contract law"],
            "cited_legislation": ["Contract Act"],
            "judges": [],
            "metadata": {"language": "en"},
            "source_dataset": "demo",
            "source_id": "1",
            "source_url": "https://example.test/1",
            "vector_score": 0.81,
            "text_score": 0.62,
            "combined_score": 0.73,
            "chunk_text": "The court found breach of contract and awarded damages.",
            "chunk_type": "summary",
            "chunk_start_pos": 0,
            "chunk_end_pos": 56,
            "chunk_metadata": {"court_name": "Court of Appeal"},
        }

        return SimpleNamespace(execute=lambda: SimpleNamespace(data=[row]))


@pytest.mark.unit
@pytest.mark.asyncio
async def test_thinking_mode_uses_separate_semantic_and_keyword_queries(monkeypatch):
    capture: dict[str, Any] = {}

    async def fake_generate_embedding(text: str):
        capture["embedded_text"] = text
        return [0.123, 0.456, 0.789]

    async def fake_analyze_query_with_fallback(_query: str):
        return QueryAnalysisResult(
            semantic_query="semantic contract breach remedies",
            keyword_query="contract breach damages",
            jurisdictions=["UK"],
            case_types=["Civil"],
            keywords=["contract"],
            date_from="2024-01-01",
        ), "llm", None

    monkeypatch.setattr("app.documents.generate_embedding", fake_generate_embedding)
    monkeypatch.setattr(
        "app.query_analysis.analyze_query_with_fallback",
        fake_analyze_query_with_fallback,
    )
    monkeypatch.setattr(
        "app.core.supabase.get_supabase_client",
        lambda: _FakeSupabase(capture),
    )

    response = await search_documents(
        SearchChunksRequest(
            query="contract dispute",
            mode="thinking",
            alpha=0.5,
            limit_docs=5,
        )
    )

    assert capture["embedded_text"] == "semantic contract breach remedies"
    assert capture["rpc_name"] == "search_judgments_hybrid"
    assert capture["rpc_params"]["search_text"] == "contract breach damages"
    assert capture["rpc_params"]["filter_jurisdictions"] == ["UK"]
    assert capture["rpc_params"]["filter_case_types"] == ["Civil"]
    assert capture["rpc_params"]["filter_keywords"] == ["contract"]
    assert capture["rpc_params"]["filter_date_from"] == "2024-01-01"

    assert response.semantic_query == "semantic contract breach remedies"
    assert response.keyword_query == "contract breach damages"
    assert response.inferred_filters is not None
    assert response.inferred_filters["jurisdictions"] == ["UK"]
    assert response.inferred_filters["case_types"] == ["Civil"]
    assert response.query_analysis_source == "llm"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_explicit_filters_override_inferred_filters(monkeypatch):
    capture: dict[str, Any] = {}

    async def fake_generate_embedding(text: str):
        capture["embedded_text"] = text
        return [0.123, 0.456, 0.789]

    async def fake_analyze_query_with_fallback(_query: str):
        return QueryAnalysisResult(
            semantic_query="semantic contract breach remedies",
            keyword_query="contract breach damages",
            jurisdictions=["UK"],
            case_types=["Civil"],
        ), "llm", None

    monkeypatch.setattr("app.documents.generate_embedding", fake_generate_embedding)
    monkeypatch.setattr(
        "app.query_analysis.analyze_query_with_fallback",
        fake_analyze_query_with_fallback,
    )
    monkeypatch.setattr(
        "app.core.supabase.get_supabase_client",
        lambda: _FakeSupabase(capture),
    )

    response = await search_documents(
        SearchChunksRequest(
            query="contract dispute",
            mode="thinking",
            alpha=0.5,
            limit_docs=5,
            jurisdictions=["PL"],
        )
    )

    assert capture["rpc_params"]["filter_jurisdictions"] == ["PL"]
    assert response.inferred_filters is not None
    assert "jurisdictions" not in response.inferred_filters
    assert response.inferred_filters["case_types"] == ["Civil"]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_thinking_mode_heuristic_fallback_source(monkeypatch):
    capture: dict[str, Any] = {}

    async def fake_generate_embedding(text: str):
        capture["embedded_text"] = text
        return [0.123, 0.456, 0.789]

    async def fake_analyze_query_with_fallback(_query: str):
        return QueryAnalysisResult(
            semantic_query="contract dispute agreement breach",
            keyword_query="contract dispute",
            jurisdictions=["UK"],
            case_types=["Civil"],
        ), "heuristic", "invalid_api_key"

    monkeypatch.setattr("app.documents.generate_embedding", fake_generate_embedding)
    monkeypatch.setattr(
        "app.query_analysis.analyze_query_with_fallback",
        fake_analyze_query_with_fallback,
    )
    monkeypatch.setattr(
        "app.core.supabase.get_supabase_client",
        lambda: _FakeSupabase(capture),
    )

    response = await search_documents(
        SearchChunksRequest(
            query="uk contract dispute",
            mode="thinking",
            alpha=0.5,
            limit_docs=5,
        )
    )

    assert response.query_analysis_source == "heuristic"
    assert response.keyword_query == "contract dispute"
