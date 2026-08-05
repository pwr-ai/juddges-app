"""Runtime routing contracts for the documents API."""

from types import SimpleNamespace

import pytest
from httpx import AsyncClient
from starlette.routing import Match

from app.judgments_pkg import router


@pytest.mark.unit
def test_facets_path_resolves_to_facets_handler() -> None:
    """The static facets path must not be captured as a document ID."""
    scope = {
        "type": "http",
        "path": "/documents/facets",
        "method": "GET",
        "headers": [],
        "query_string": b"",
    }

    matched_endpoint = None
    for route in router.routes:
        match, _ = route.matches(scope)
        if match is Match.FULL:
            matched_endpoint = route.endpoint.__name__
            break

    assert matched_endpoint == "get_facets"


@pytest.mark.anyio
@pytest.mark.unit
async def test_facets_returns_grouped_counts(
    authenticated_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The reachable endpoint keeps its HTTP status and response-body contract."""

    class FacetsRpc:
        def execute(self) -> SimpleNamespace:
            return SimpleNamespace(
                data=[
                    {
                        "facet_type": "jurisdiction",
                        "facet_value": "PL",
                        "facet_count": 12,
                    },
                    {
                        "facet_type": "jurisdiction",
                        "facet_value": "UK",
                        "facet_count": 7,
                    },
                ]
            )

    class SupabaseStub:
        def rpc(self, name: str, params: dict[str, object]) -> FacetsRpc:
            assert name == "get_judgment_facets"
            assert params == {
                "pre_filter_jurisdictions": ["PL"],
                "pre_filter_date_from": None,
                "pre_filter_date_to": None,
            }
            return FacetsRpc()

    monkeypatch.setattr("app.core.supabase.get_supabase_client", lambda: SupabaseStub())

    response = await authenticated_client.get(
        "/documents/facets", params={"jurisdiction": "PL"}
    )

    assert response.status_code == 200
    assert response.json() == {
        "facets": {
            "jurisdiction": [
                {"value": "PL", "count": 12},
                {"value": "UK", "count": 7},
            ]
        }
    }
