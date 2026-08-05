"""Runtime route-order contracts for the composed extraction router."""

from unittest.mock import patch

import pytest


@pytest.mark.unit
async def test_prompts_collection_resolves_before_dynamic_job_route(
    client, valid_api_headers
) -> None:
    """GET /extractions/prompts must not be parsed as job_id='prompts'."""
    with patch(
        "app.extraction_domain.prompts_router.InformationExtractor.list_prompts",
        return_value=["info_extraction"],
    ) as list_prompts:
        response = await client.get("/extractions/prompts", headers=valid_api_headers)

    assert response.status_code == 200
    assert response.json() == ["info_extraction"]
    list_prompts.assert_called_once_with()


@pytest.mark.unit
async def test_legacy_schema_collection_resolves_before_dynamic_job_route(
    client, valid_api_headers
) -> None:
    """The advertised compatibility route must not resolve as a job lookup."""
    with patch(
        "app.extraction_domain.prompts_router.InformationExtractor.list_schemas",
        return_value=["court_judgment"],
    ) as list_schemas:
        response = await client.get("/extractions/schemas", headers=valid_api_headers)

    assert response.status_code == 200
    assert response.json() == ["court_judgment"]
    list_schemas.assert_called_once_with()
