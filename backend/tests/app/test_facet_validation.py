"""FacetValidator unit tests — arrays only at this step."""

from unittest.mock import AsyncMock

import pytest
from juddges_search.chains.query_rewrite_models import QueryRewriteResult

from app.services.facet_validation import FacetValidator


@pytest.mark.unit
@pytest.mark.asyncio
async def test_arrays_are_canonicalised_via_facet_search():
    meili = AsyncMock()

    async def _facet_search(field: str, query: str, limit: int = 3) -> list[str]:
        responses = {
            ("keywords", "vat"): ["VAT"],
            ("keywords", "podatek"): ["podatek od towarów i usług"],
            ("legal_topics", "tax"): ["taxation"],
            ("cited_legislation", "kk 286"): [],
        }
        return responses.get((field, query.lower()), [])

    meili.facet_search.side_effect = _facet_search
    validator = FacetValidator(meili=meili)

    result = QueryRewriteResult(
        rewritten_query="x",
        keywords=["vat", "podatek", "ghost"],
        legal_topics=["tax"],
        cited_legislation=["KK 286"],
    )

    envelope = await validator.validate(result)

    assert envelope.filters.arrays.keywords == ["VAT", "podatek od towarów i usług"]
    assert envelope.filters.arrays.legal_topics == ["taxation"]
    assert envelope.filters.arrays.cited_legislation == []
    assert set(envelope.diagnostics.dropped_terms) == {
        "keywords:ghost",
        "cited_legislation:KK 286",
    }


@pytest.mark.unit
@pytest.mark.asyncio
async def test_facet_search_failure_drops_field_silently():
    meili = AsyncMock()
    meili.facet_search.side_effect = TimeoutError("meili slow")
    validator = FacetValidator(meili=meili)

    result = QueryRewriteResult(rewritten_query="x", keywords=["vat"])
    envelope = await validator.validate(result)

    assert envelope.filters.arrays.keywords == []
    assert envelope.diagnostics.dropped_terms == ["keywords:vat"]
    assert envelope.degraded is False  # array failure ≠ full degraded
