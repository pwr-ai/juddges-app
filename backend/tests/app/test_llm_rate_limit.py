"""Unit tests for the LangServe LLM route budget.

These routes (/qa, /chat, /enhance_query) are the only endpoints that bill
OpenAI on every call and the only ones @limiter.limit cannot decorate.
Each test uses a distinct client IP so the shared in-process storage does
not leak budget between tests.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.llm_rate_limit import enforce_llm_rate_limit


def _request(client_host: str) -> MagicMock:
    """Build a minimal Starlette-like Request with no proxy headers."""
    request = MagicMock()
    request.client = MagicMock()
    request.client.host = client_host
    request.headers = {}
    return request


@pytest.mark.unit
def test_allows_calls_up_to_the_configured_limit(monkeypatch):
    monkeypatch.setenv("LLM_RATE_LIMIT", "3/hour")
    request = _request("203.0.113.10")

    for _ in range(3):
        enforce_llm_rate_limit(request)


@pytest.mark.unit
def test_blocks_the_call_that_exceeds_the_limit(monkeypatch):
    monkeypatch.setenv("LLM_RATE_LIMIT", "2/hour")
    request = _request("203.0.113.11")

    enforce_llm_rate_limit(request)
    enforce_llm_rate_limit(request)

    with pytest.raises(HTTPException) as exc_info:
        enforce_llm_rate_limit(request)

    assert exc_info.value.status_code == 429


@pytest.mark.unit
def test_two_clients_have_independent_budgets(monkeypatch):
    monkeypatch.setenv("LLM_RATE_LIMIT", "1/hour")

    enforce_llm_rate_limit(_request("203.0.113.12"))
    enforce_llm_rate_limit(_request("203.0.113.13"))


@pytest.mark.unit
def test_authenticated_bff_identity_gets_its_own_budget(monkeypatch):
    """A signed-in user must not inherit the shared BFF socket budget."""
    monkeypatch.setenv("LLM_RATE_LIMIT", "1/hour")
    monkeypatch.setenv("BACKEND_API_KEY", "test-backend-key")

    first = _request("203.0.113.14")
    first.headers = {
        "X-API-Key": "test-backend-key",
        "X-RateLimit-Identity": "a" * 64,
    }
    second = _request("203.0.113.14")
    second.headers = {
        "X-API-Key": "test-backend-key",
        "X-RateLimit-Identity": "b" * 64,
    }

    enforce_llm_rate_limit(first)
    enforce_llm_rate_limit(second)


@pytest.mark.unit
def test_storage_error_falls_back_instead_of_raising(monkeypatch):
    """A Redis outage must degrade, not surface as an unhandled exception."""
    monkeypatch.setenv("LLM_RATE_LIMIT", "5/hour")
    from app import llm_rate_limit

    def _boom(*_args, **_kwargs):
        raise ConnectionError("redis unreachable")

    monkeypatch.setattr(llm_rate_limit._limiter, "hit", _boom)

    # Should not raise despite the primary storage being down.
    enforce_llm_rate_limit(_request("203.0.113.20"))


@pytest.mark.unit
def test_storage_error_fallback_still_enforces_limit(monkeypatch):
    """The in-memory fallback must not become unlimited."""
    monkeypatch.setenv("LLM_RATE_LIMIT", "2/hour")
    from app import llm_rate_limit

    def _boom(*_args, **_kwargs):
        raise ConnectionError("redis unreachable")

    monkeypatch.setattr(llm_rate_limit._limiter, "hit", _boom)

    request = _request("203.0.113.21")
    enforce_llm_rate_limit(request)
    enforce_llm_rate_limit(request)

    with pytest.raises(HTTPException) as exc_info:
        enforce_llm_rate_limit(request)

    assert exc_info.value.status_code == 429


@pytest.mark.unit
def test_all_llm_routes_carry_the_budget_dependency():
    """Regression guard: a new LangServe route must not escape the budget."""
    from app.llm_rate_limit import enforce_llm_rate_limit as dependency
    from app.server import app

    llm_prefixes = ("/qa", "/chat", "/enhance_query")
    guarded = {
        route.path
        for route in app.routes
        if getattr(route, "dependant", None)
        and any(d.call is dependency for d in route.dependant.dependencies)
    }

    for prefix in llm_prefixes:
        assert any(path.startswith(prefix) for path in guarded), (
            f"No route under {prefix} enforces the LLM budget"
        )
