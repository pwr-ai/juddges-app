"""Integration tests for OCR endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_list_ocr_jobs_requires_auth(client: AsyncClient):
    """List OCR jobs should reject unauthenticated requests."""
    response = await client.get("/ocr/jobs")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_submit_ocr_text_requires_auth(client: AsyncClient):
    """Submit OCR text job should reject unauthenticated requests."""
    response = await client.post("/ocr/jobs/text", json={"text": "sample text"})
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_ocr_job_requires_auth(client: AsyncClient):
    """Get OCR job should reject unauthenticated requests."""
    response = await client.get("/ocr/jobs/fake-job-id")
    assert response.status_code in [401, 403]
