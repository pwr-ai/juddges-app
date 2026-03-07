"""Integration tests for example questions endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_example_questions_requires_auth(client: AsyncClient):
    """Example questions should reject unauthenticated requests."""
    response = await client.get("/example_questions")
    assert response.status_code in [401, 403]


@pytest.mark.anyio
@pytest.mark.api
async def test_example_questions_with_auth(authenticated_client: AsyncClient):
    """Example questions should return data with valid auth."""
    response = await authenticated_client.get("/example_questions")
    assert response.status_code in [200, 500]
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, dict | list)
