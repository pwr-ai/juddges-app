"""POST /extractions/base-schema/aggregate (#707)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from tests.app.conftest import _install_jwt_user_override

pytestmark = pytest.mark.unit

URL = "/extractions/base-schema/aggregate"
RPC_RESULT = {
    "total": 3,
    "sample_n": 2,
    "seed": 7,
    "fields": {
        "appeal_outcome": {
            "kind": "categorical",
            "multi": True,
            "values": [],
            "other": 0,
            "null": 0,
            "covered": 2,
        }
    },
}


def _supabase(data):
    mock_response = MagicMock()
    mock_response.data = data
    mock_supabase = MagicMock()
    mock_supabase.rpc.return_value.execute.return_value = mock_response
    return mock_supabase


@pytest.fixture(autouse=True)
def _user():
    _install_jwt_user_override("11111111-1111-4111-8111-111111111111")


class TestAggregate:
    @pytest.mark.asyncio
    async def test_calls_rpc_with_defaults_and_returns_payload(
        self, client, valid_api_headers
    ):
        sb = _supabase(RPC_RESULT)
        with patch("app.extraction_domain.results_router.supabase", sb):
            r = await client.post(
                URL,
                json={"filters": {"appeal_outcome": ["allowed"]}},
                headers=valid_api_headers,
            )
        assert r.status_code == 200, r.text
        assert r.json() == RPC_RESULT
        name, params = sb.rpc.call_args.args
        assert name == "aggregate_extracted_data"
        assert params["p_filters"] == {"appeal_outcome": ["allowed"]}
        assert params["p_text_query"] is None
        assert params["p_fields"][:2] == ["offender_age_offence", "offender_gender"]
        assert (
            params["p_sample_size"] is None
            and params["p_seed"] is None
            and params["p_top_n"] == 20
        )

    @pytest.mark.asyncio
    async def test_unwraps_a_one_element_list_from_the_client(
        self, client, valid_api_headers
    ):
        # supabase-py returns a scalar-returning function's value as the value
        # itself; some client versions wrap it in a one-element list.
        sb = _supabase([RPC_RESULT])
        with patch("app.extraction_domain.results_router.supabase", sb):
            r = await client.post(URL, json={}, headers=valid_api_headers)
        assert r.status_code == 200 and r.json()["total"] == 3

    @pytest.mark.asyncio
    async def test_passes_sampling_and_fields_through(self, client, valid_api_headers):
        sb = _supabase(RPC_RESULT)
        with patch("app.extraction_domain.results_router.supabase", sb):
            r = await client.post(
                URL,
                json={
                    "fields": ["appeal_outcome", "court_name"],
                    "sample_size": 100,
                    "seed": 7,
                    "top_n": 5,
                },
                headers=valid_api_headers,
            )
        assert r.status_code == 200
        params = sb.rpc.call_args.args[1]
        assert params["p_fields"] == ["appeal_outcome", "court_name"]
        assert (params["p_sample_size"], params["p_seed"], params["p_top_n"]) == (
            100,
            7,
            5,
        )

    @pytest.mark.asyncio
    async def test_sample_size_without_seed_is_422(self, client, valid_api_headers):
        with patch(
            "app.extraction_domain.results_router.supabase", _supabase(RPC_RESULT)
        ):
            r = await client.post(
                URL, json={"sample_size": 10}, headers=valid_api_headers
            )
        assert r.status_code == 422
        assert "seed" in r.text

    @pytest.mark.asyncio
    async def test_unknown_field_is_422_and_names_it(self, client, valid_api_headers):
        with patch(
            "app.extraction_domain.results_router.supabase", _supabase(RPC_RESULT)
        ):
            r = await client.post(
                URL, json={"fields": ["case_name"]}, headers=valid_api_headers
            )
        assert r.status_code == 422
        assert "case_name" in r.text

    @pytest.mark.asyncio
    async def test_collection_ids_rejected_like_filter_endpoint(
        self, client, valid_api_headers
    ):
        sb = _supabase(RPC_RESULT)
        with patch("app.extraction_domain.results_router.supabase", sb):
            r = await client.post(
                URL,
                json={"filters": {"collection_ids": ["x"]}},
                headers=valid_api_headers,
            )
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "COLLECTION_IDS_NOT_ALLOWED"
        sb.rpc.assert_not_called()

    @pytest.mark.asyncio
    async def test_database_unavailable_is_503(self, client, valid_api_headers):
        with patch("app.extraction_domain.results_router.supabase", None):
            r = await client.post(URL, json={}, headers=valid_api_headers)
        assert r.status_code == 503


@pytest.mark.asyncio
async def test_requires_bearer_user(client, valid_api_headers):
    # Remove the autouse override for this one test by resolving the real dependency.
    from app.core.auth_jwt import get_current_user
    from app.server import app

    app.dependency_overrides.pop(get_current_user, None)
    try:
        with patch(
            "app.extraction_domain.results_router.supabase", _supabase(RPC_RESULT)
        ):
            r = await client.post(URL, json={}, headers=valid_api_headers)
        assert r.status_code in (401, 403)
    finally:
        _install_jwt_user_override("11111111-1111-4111-8111-111111111111")
