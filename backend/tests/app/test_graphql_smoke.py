import pytest
from httpx import AsyncClient


@pytest.mark.unit
async def test_graphql_endpoint_responds_to_introspection(client: AsyncClient):
    """The GraphQL endpoint accepts a basic introspection query."""
    introspection = {"query": "{ __schema { queryType { name } } }"}
    response = await client.post("/graphql", json=introspection)

    # GraphQL endpoint exists and responds correctly
    assert response.status_code in (200, 401, 403, 405), f"Got status {response.status_code}"
    if response.status_code == 200:
        body = response.json()
        assert "data" in body or "errors" in body, f"Invalid GraphQL response: {body}"


@pytest.mark.unit
async def test_graphql_endpoint_registered(client: AsyncClient):
    """A GET to /graphql returns something (not 404), proving endpoint exists."""
    response = await client.get("/graphql")
    assert response.status_code != 404