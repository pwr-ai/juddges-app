"""Route-level test for POST /documents/search/rewrite."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from juddges_search.chains.query_rewrite_models import QueryRewriteResult

from app.server import app
from app.services.facet_validation import (
    EnvelopeFacets,
    EnvelopeFilters,
    RewrittenQueryEnvelope,
)

# Auth: tests/app/conftest.py sets BACKEND_API_KEY="test-api-key-12345" before
# importing app, and the verify_api_key dependency uses constant-time compare
# against that exact value — so the header must match it verbatim.
_API_KEY = "test-api-key-12345"


@pytest.fixture
def test_client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_rewrite_cache():
    """Isolate tests from each other (and from neighbouring suites) by
    clearing the module-level TTL cache before every test in this file."""
    from app.judgments_pkg.query_rewrite import _CACHE

    _CACHE.clear()
    yield
    _CACHE.clear()


@pytest.mark.unit
def test_rewrite_route_returns_envelope(test_client):
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

    with (
        patch("app.judgments_pkg.query_rewrite._get_chain", return_value=chain_mock),
        patch(
            "app.judgments_pkg.query_rewrite._get_validator",
            return_value=validator_mock,
        ),
    ):
        resp = test_client.post(
            "/documents/search/rewrite",
            json={"query": "podatek VAT", "languages_hint": ["pl"]},
            headers={"X-API-Key": _API_KEY},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["rewritten_query"] == "VAT digital services"
    assert body["filters"]["facets"]["jurisdiction"] == "PL"
    assert body["degraded"] is False


@pytest.mark.unit
def test_rewrite_route_falls_back_on_chain_failure(test_client):
    chain_mock = AsyncMock()
    chain_mock.ainvoke.side_effect = RuntimeError("openai timeout")
    validator_mock = AsyncMock()

    with (
        patch("app.judgments_pkg.query_rewrite._get_chain", return_value=chain_mock),
        patch(
            "app.judgments_pkg.query_rewrite._get_validator",
            return_value=validator_mock,
        ),
    ):
        resp = test_client.post(
            "/documents/search/rewrite",
            json={"query": "anything", "languages_hint": ["pl"]},
            headers={"X-API-Key": _API_KEY},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["degraded"] is True
    assert body["rewritten_query"] == "anything"
    assert body["filters"]["arrays"]["keywords"] == []
    validator_mock.validate.assert_not_called()


def test_rewrite_route_falls_back_on_validator_failure(test_client):
    """Validation errors must degrade (not 500) and must not be cached."""
    from app.judgments_pkg.query_rewrite import _CACHE

    chain_mock = AsyncMock()
    chain_mock.ainvoke.return_value = QueryRewriteResult(rewritten_query="vat")
    validator_mock = AsyncMock()
    validator_mock.validate.side_effect = ValueError("day is out of range for month")

    with (
        patch("app.judgments_pkg.query_rewrite._get_chain", return_value=chain_mock),
        patch(
            "app.judgments_pkg.query_rewrite._get_validator",
            return_value=validator_mock,
        ),
    ):
        resp = test_client.post(
            "/documents/search/rewrite",
            json={"query": "vat", "languages_hint": ["pl"]},
            headers={"X-API-Key": _API_KEY},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["degraded"] is True
    assert body["rewritten_query"] == "vat"
    # Degraded results are never negatively cached.
    assert _CACHE == {}


@pytest.mark.unit
def test_rewrite_route_rejects_empty_query(test_client):
    resp = test_client.post(
        "/documents/search/rewrite",
        json={"query": "   "},
        headers={"X-API-Key": _API_KEY},
    )
    assert resp.status_code == 422


@pytest.mark.unit
def test_rewrite_route_caches_identical_requests(test_client):
    import cachetools

    chain_mock = AsyncMock()
    chain_mock.ainvoke.return_value = QueryRewriteResult(rewritten_query="hello")

    validator_mock = AsyncMock()
    validator_mock.validate.return_value = RewrittenQueryEnvelope(
        rewritten_query="hello"
    )

    with (
        patch("app.judgments_pkg.query_rewrite._get_chain", return_value=chain_mock),
        patch(
            "app.judgments_pkg.query_rewrite._get_validator",
            return_value=validator_mock,
        ),
        patch(
            "app.judgments_pkg.query_rewrite._CACHE",
            new=cachetools.TTLCache(maxsize=128, ttl=60),
        ),
    ):
        for _ in range(3):
            resp = test_client.post(
                "/documents/search/rewrite",
                json={"query": "podatek VAT", "languages_hint": ["pl"]},
                headers={"X-API-Key": _API_KEY},
            )
            assert resp.status_code == 200

    assert chain_mock.ainvoke.await_count == 1
    assert validator_mock.validate.await_count == 1
