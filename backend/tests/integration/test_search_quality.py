"""Integration tests for search quality regressions.

These tests call the real /documents/search endpoint against a running
backend (default http://localhost:8004) and assert that the fixture
queries return healthy hit counts with a live embedding provider.

They are SKIPPED unless RUN_INTEGRATION_TESTS=1 (or the live backend is
explicitly selected via JUDDGES_BENCHMARK_API_URL), so unit CI stays fast.

What they cover:
- embedding_ms > 0 and vector_fallback is False → TEI/provider healthy
- per-query min_hits threshold → Bug #3 (conceptual AND) regression guard
- forbidden_query_type → Bug #2 (case_number misroute) regression guard
- 2001-char query → 400 with "query too long"

Fixtures live in tests/fixtures/search_queries.yaml, shared with
scripts/search_benchmark.py so edits propagate to both.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
import pytest
import yaml

FIXTURES_PATH = (
    Path(__file__).resolve().parent.parent / "fixtures" / "search_queries.yaml"
)

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not (
            os.getenv("RUN_INTEGRATION_TESTS") == "1"
            or os.getenv("JUDDGES_BENCHMARK_API_URL")
        ),
        reason="Set RUN_INTEGRATION_TESTS=1 to run live-backend tests",
    ),
]


def _api_url() -> str:
    return (
        os.getenv("JUDDGES_BENCHMARK_API_URL")
        or os.getenv("BENCHMARK_API_URL")
        or "http://localhost:8004"
    )


def _api_key() -> str:
    key = os.getenv("BACKEND_API_KEY", "")
    if not key:
        pytest.skip("BACKEND_API_KEY env var not set")
    return key


@pytest.fixture(scope="module")
def client() -> httpx.Client:
    with httpx.Client(base_url=_api_url(), timeout=60.0) as c:
        yield c


@pytest.fixture(scope="module")
def fixtures() -> list[dict[str, Any]]:
    return yaml.safe_load(FIXTURES_PATH.read_text())["queries"]


def _search(client: httpx.Client, query: str, limit: int = 50) -> dict[str, Any]:
    resp = client.post(
        "/documents/search",
        json={"query": query, "limit": limit},
        headers={"X-API-Key": _api_key()},
    )
    resp.raise_for_status()
    return resp.json()


@pytest.mark.parametrize(
    "fixture_id",
    ["Q1_short", "Q2_conceptual", "Q3_question", "Q4_paragraph", "Q5_skarga_kasacyjna"],
)
def test_fixture_query_recall(client: httpx.Client, fixtures, fixture_id: str) -> None:
    """Every fixture query must meet its min_hits and healthy-embedding bar."""
    fixture = next(f for f in fixtures if f["id"] == fixture_id)
    query = " ".join(fixture["query"].split())
    data = _search(client, query)
    tb = data.get("timing_breakdown") or {}
    hits = len(data.get("chunks") or [])

    # Embedding must be live — no silent fallback.
    assert tb.get("vector_fallback") is False, (
        f"{fixture_id}: vector_fallback=True (provider unhealthy, check logs)"
    )
    assert (tb.get("embedding_ms") or 0) > 0, (
        f"{fixture_id}: embedding_ms=0 — embedding not running"
    )

    # Recall floor from fixture.
    min_hits = fixture.get("min_hits", 0)
    assert hits >= min_hits, f"{fixture_id}: {hits} hits < min_hits={min_hits}"

    # Query-type contract.
    qt = tb.get("query_type")
    expected = fixture.get("expected_query_type")
    forbidden = fixture.get("forbidden_query_type")
    if expected:
        assert qt == expected, f"{fixture_id}: query_type={qt!r} != {expected!r}"
    if forbidden:
        assert qt != forbidden, (
            f"{fixture_id}: query_type={forbidden!r} is forbidden (regression)"
        )


def test_query_over_2000_chars_returns_400(client: httpx.Client) -> None:
    """Explicit character-limit contract — frontend uses this to show the counter."""
    resp = client.post(
        "/documents/search",
        json={"query": "x" * 2015, "limit": 3},
        headers={"X-API-Key": _api_key()},
    )
    assert resp.status_code == 400
    assert "too long" in resp.text.lower()
    assert "2000" in resp.text


def test_exact_sygnatura_still_routes_as_case_number(client: httpx.Client) -> None:
    """Short sygnatura (Bug #2 fix must not over-correct)."""
    data = _search(client, "II CSK 604/17", limit=5)
    tb = data.get("timing_breakdown") or {}
    assert tb.get("query_type") == "case_number", (
        f"'II CSK 604/17' alone must still route as case_number, got "
        f"{tb.get('query_type')!r}"
    )
