"""POST /documents/search mirrors each call into app_events (`search_submitted`,
surface='api') with derived fields only, never the query text."""

from __future__ import annotations

from typing import Any

import pytest

import app.judgments_pkg as judgments_pkg
from app.models import SearchChunksRequest, SearchChunksResponse


@pytest.fixture
def emitted(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        judgments_pkg,
        "emit_app_event_in_background",
        lambda name, **kw: calls.append({"event_name": name, **kw}),
    )
    return calls


def _stub_search(monkeypatch: pytest.MonkeyPatch, response: SearchChunksResponse):
    async def fake(_request: SearchChunksRequest) -> SearchChunksResponse:
        return response

    monkeypatch.setattr(judgments_pkg, "run_document_search", fake)


@pytest.mark.unit
async def test_search_mirrors_a_search_submitted_event(monkeypatch, emitted):
    response = SearchChunksResponse(chunks=[], total_chunks=0, unique_documents=0)
    _stub_search(monkeypatch, response)

    result = await judgments_pkg.search_documents(
        SearchChunksRequest(query="  umowa najmu lokalu  ", mode="thinking")
    )

    assert result is response
    assert len(emitted) == 1
    event = emitted[0]
    assert event["event_name"] == "search_submitted"
    assert event["surface"] == "api"
    assert event["properties"] == {
        "endpoint": "POST /documents/search",
        "result_count": 0,
        "query_length": len("umowa najmu lokalu"),
        "mode": "thinking",
        "facets_only": False,
    }
    assert "umowa" not in repr(event)


@pytest.mark.unit
async def test_facets_only_call_is_flagged(monkeypatch, emitted):
    _stub_search(
        monkeypatch,
        SearchChunksResponse(chunks=[], total_chunks=0, unique_documents=0),
    )

    await judgments_pkg.search_documents(
        SearchChunksRequest(query="", facets=["court_name"])
    )

    assert emitted[0]["properties"]["facets_only"] is True
    assert emitted[0]["properties"]["query_length"] == 0


@pytest.mark.unit
async def test_failed_search_emits_nothing(monkeypatch, emitted):
    async def boom(_request: SearchChunksRequest) -> SearchChunksResponse:
        raise RuntimeError("search down")

    monkeypatch.setattr(judgments_pkg, "run_document_search", boom)

    with pytest.raises(RuntimeError):
        await judgments_pkg.search_documents(SearchChunksRequest(query="x"))
    assert emitted == []
