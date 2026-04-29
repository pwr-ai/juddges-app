"""
Unit tests for feedback endpoint abuse-prevention logic.

Tests cover:
- Body size cap (413 when request body > 4 KiB).
- Empty comment/reason rejection (422).
- URL-spam rejection (422 when > 5 URLs in free-text fields).
- Normal valid payloads still pass validation (reach the DB layer).
"""

from __future__ import annotations

import json
import os

import pytest
from httpx import ASGITransport, AsyncClient

# Ensure env vars are set before app import.
os.environ.setdefault("BACKEND_API_KEY", "test-api-key-12345")
os.environ.setdefault("SUPABASE_URL", "http://test-supabase.local")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.server import app


@pytest.fixture
async def client():
    """Async test client with rate-limiting disabled."""
    limiter = getattr(app.state, "limiter", None)
    if limiter is not None:
        limiter.enabled = False

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    if limiter is not None:
        limiter.enabled = True


# ---------------------------------------------------------------------------
# /api/feedback/search — spam rejection
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
async def test_search_feedback_empty_reason_rejected(client: AsyncClient):
    """Whitespace-only reason (length passes max_length=500) must be rejected with 422."""
    # 20 spaces — passes Pydantic max_length=500 but our check strips it.
    response = await client.post(
        "/api/feedback/search",
        json={
            "document_id": "doc-1",
            "search_query": "contract law",
            "rating": "relevant",
            "reason": "                    ",  # 20 spaces, passes length validation
        },
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    # Our custom check returns a string detail; Pydantic returns a list.
    assert isinstance(detail, str)
    assert "empty" in detail.lower()


@pytest.mark.anyio
@pytest.mark.unit
async def test_search_feedback_url_spam_rejected(client: AsyncClient):
    """Reason with more than 5 URLs must be rejected with 422."""
    urls = " ".join(f"http://spam{i}.example.com" for i in range(6))
    response = await client.post(
        "/api/feedback/search",
        json={
            "document_id": "doc-1",
            "search_query": "contract law",
            "rating": "relevant",
            "reason": f"Great! {urls}",  # stays under 500 chars
        },
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, str)
    assert "url" in detail.lower()


@pytest.mark.anyio
@pytest.mark.unit
async def test_search_feedback_five_urls_allowed(client: AsyncClient):
    """Reason with exactly 5 URLs is within the limit and should not be spam-rejected."""
    urls = " ".join(f"http://ref{i}.example.com" for i in range(5))
    response = await client.post(
        "/api/feedback/search",
        json={
            "document_id": "doc-1",
            "search_query": "contract law",
            "rating": "relevant",
            "reason": f"See: {urls}",
        },
    )
    # May fail at DB (500) or succeed (200) — not a spam 422.
    if response.status_code == 422:
        detail = response.json()["detail"]
        # If 422, it must not be because of our URL check
        assert not (isinstance(detail, str) and "url" in detail.lower())


@pytest.mark.anyio
@pytest.mark.unit
async def test_search_feedback_no_reason_accepted(client: AsyncClient):
    """Omitting the optional reason field entirely should pass spam validation."""
    response = await client.post(
        "/api/feedback/search",
        json={
            "document_id": "doc-1",
            "search_query": "contract law",
            "rating": "relevant",
        },
    )
    # 200 or 500 (DB error) — either is fine; 422 would indicate a false rejection.
    assert response.status_code in (200, 500)


# ---------------------------------------------------------------------------
# /api/feedback/feature — spam rejection
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
async def test_feature_feedback_empty_description_rejected(client: AsyncClient):
    """Whitespace-only description (length >= min_length=10) must be rejected with 422."""
    # 15 spaces: passes Pydantic's min_length=10 but is stripped to empty by our check.
    response = await client.post(
        "/api/feedback/feature",
        json={
            "feedback_type": "feature_request",
            "title": "Add dark mode",
            "description": "               ",  # 15 spaces
        },
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, str)
    assert "empty" in detail.lower()


@pytest.mark.anyio
@pytest.mark.unit
async def test_feature_feedback_url_spam_rejected(client: AsyncClient):
    """Description with more than 5 URLs must be rejected with 422."""
    # Build a description under 2000 chars that contains 6 URLs
    urls = " ".join(f"https://spam{i}.example.com" for i in range(6))
    description = f"Please visit these sites for context: {urls}"
    assert len(description) < 2000  # sanity: stays within Pydantic max_length
    response = await client.post(
        "/api/feedback/feature",
        json={
            "feedback_type": "feature_request",
            "title": "Add dark mode please",
            "description": description,
        },
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, str)
    assert "url" in detail.lower()


@pytest.mark.anyio
@pytest.mark.unit
async def test_feature_feedback_valid_description_passes_spam_check(
    client: AsyncClient,
):
    """A legitimate description with a couple of URLs should pass spam validation."""
    response = await client.post(
        "/api/feedback/feature",
        json={
            "feedback_type": "improvement",
            "title": "Improve search ranking",
            "description": (
                "The search could be improved. See https://example.com and "
                "https://other.example.com for prior art."
            ),
        },
    )
    # Only DB-level errors (500) or success (200) are acceptable; not 422 from spam check.
    assert response.status_code in (200, 500)


# ---------------------------------------------------------------------------
# Body size cap — use search_context dict to push body past 4 KiB
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.unit
async def test_large_body_rejected_on_search_feedback(client: AsyncClient):
    """Bodies larger than 4 KiB must be rejected with 413.

    We use the unconstrained search_context dict field to craft a valid-but-large body.
    """
    # Build a large search_context dict (~5 KiB when JSON-encoded)
    large_context = {"data": "x" * 5000}
    response = await client.post(
        "/api/feedback/search",
        json={
            "document_id": "doc-1",
            "search_query": "test",
            "rating": "relevant",
            "search_context": large_context,
        },
    )
    assert response.status_code == 413


@pytest.mark.anyio
@pytest.mark.unit
async def test_large_body_rejected_on_feature_feedback(client: AsyncClient):
    """Bodies larger than 4 KiB must be rejected with 413 on feature feedback.

    The feature_name field has no max_length, so we can use it to pad the body.
    We use a raw JSON payload sent as bytes to bypass FastAPI's Pydantic body parsing.
    """
    # Build a raw payload that is over 4096 bytes in total.
    # feature_name has no max_length constraint, so a large value is valid JSON.
    big_feature_name = "x" * 5000
    payload = {
        "feedback_type": "bug_report",
        "title": "Something is broken here",
        "description": "This is a valid description.",
        "feature_name": big_feature_name,
    }
    content = json.dumps(payload).encode()
    assert len(content) > 4096

    response = await client.post(
        "/api/feedback/feature",
        content=content,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413
