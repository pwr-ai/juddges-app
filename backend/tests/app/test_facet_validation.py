"""FacetValidator unit tests — arrays only at this step."""

from datetime import date
from unittest.mock import AsyncMock

import pytest
from juddges_search.chains.query_rewrite_models import (
    DateRange,
    NumericRange,
    QueryRewriteResult,
)

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


@pytest.mark.unit
@pytest.mark.asyncio
async def test_numeric_clamp_uses_bounds_map():
    meili = AsyncMock()
    meili.facet_search.return_value = []
    validator = FacetValidator(
        meili=meili,
        numeric_bounds={"base_num_victims": (0, 50)},
    )

    result = QueryRewriteResult(
        rewritten_query="x",
        base_num_victims=NumericRange(min=-3, max=200),
    )
    envelope = await validator.validate(result)

    base = envelope.filters.base.base_num_victims
    assert base is not None
    assert base.min == 0
    assert base.max == 50


@pytest.mark.unit
@pytest.mark.asyncio
async def test_numeric_dropped_when_both_outside_bounds():
    meili = AsyncMock()
    meili.facet_search.return_value = []
    validator = FacetValidator(
        meili=meili, numeric_bounds={"base_num_victims": (0, 50)}
    )

    result = QueryRewriteResult(
        rewritten_query="x",
        base_num_victims=NumericRange(min=100, max=200),
    )
    envelope = await validator.validate(result)
    assert envelope.filters.base.base_num_victims is None
    assert "base_num_victims" in "|".join(envelope.diagnostics.dropped_terms)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_decision_date_passthrough_when_valid():
    meili = AsyncMock()
    meili.facet_search.return_value = []
    validator = FacetValidator(meili=meili)

    result = QueryRewriteResult(
        rewritten_query="x",
        decision_date=DateRange(from_=date(2020, 1, 1), to=date(2024, 12, 31)),
    )
    envelope = await validator.validate(result)
    assert envelope.filters.decision_date is not None
    assert envelope.filters.decision_date.from_ == "2020-01-01"
    assert envelope.filters.decision_date.to == "2024-12-31"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_decision_date_dropped_when_out_of_range():
    meili = AsyncMock()
    meili.facet_search.return_value = []
    validator = FacetValidator(meili=meili, today=date(2026, 5, 12))

    result = QueryRewriteResult(
        rewritten_query="x",
        decision_date=DateRange(from_=date(1500, 1, 1), to=date(1600, 1, 1)),
    )
    envelope = await validator.validate(result)
    assert envelope.filters.decision_date is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_languages_normalised_and_deduped():
    meili = AsyncMock()
    meili.facet_search.return_value = []
    validator = FacetValidator(meili=meili)

    # The LLM enum already constrains to ('pl', 'uk') so we test the
    # passthrough + dedup behaviour explicitly.
    result = QueryRewriteResult(rewritten_query="x", languages=["pl", "uk", "pl"])
    envelope = await validator.validate(result)
    assert envelope.filters.languages == ["pl", "uk"]
