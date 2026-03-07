"""Integration tests for evaluations endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_create_evaluation_requires_auth(client: AsyncClient):
    """Create evaluation should reject unauthenticated requests."""
    response = await client.post(
        "/evaluations", json={"schema_id": "s1", "document_id": "d1", "score": 0.9}
    )
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_get_evaluation_requires_auth(client: AsyncClient):
    """Get evaluation should reject unauthenticated requests."""
    response = await client.get("/evaluations/fake-eval-id")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_schema_evaluations_requires_auth(client: AsyncClient):
    """Schema evaluations should reject unauthenticated requests."""
    response = await client.get("/evaluations/schema/fake-schema-id")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_document_evaluations_requires_auth(client: AsyncClient):
    """Document evaluations should reject unauthenticated requests."""
    response = await client.get("/evaluations/document/fake-doc-id")
    assert response.status_code in [401, 403]
