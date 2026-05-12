"""Pydantic schema for the LLM query rewriter."""

from datetime import date

import pytest
from pydantic import ValidationError

from juddges_search.chains.query_rewrite_models import (
    DateRange,
    NumericRange,
    QueryRewriteResult,
)


@pytest.mark.unit
def test_minimal_valid_payload():
    payload = QueryRewriteResult(rewritten_query="VAT contracts")
    assert payload.rewritten_query == "VAT contracts"
    assert payload.jurisdiction is None
    assert payload.keywords == []
    assert payload.base_num_victims is None


@pytest.mark.unit
def test_numeric_range_requires_min_le_max():
    NumericRange(min=1, max=5)  # ok
    with pytest.raises(ValidationError):
        NumericRange(min=10, max=1)


@pytest.mark.unit
def test_date_range_requires_from_le_to():
    DateRange(from_=date(2020, 1, 1), to=date(2024, 12, 31))  # ok
    with pytest.raises(ValidationError):
        DateRange(from_=date(2024, 1, 1), to=date(2020, 1, 1))


@pytest.mark.unit
def test_categorical_enum_rejects_unknown():
    with pytest.raises(ValidationError):
        QueryRewriteResult(rewritten_query="x", jurisdiction="FR")


@pytest.mark.unit
def test_arrays_capped_dedupe_strip():
    payload = QueryRewriteResult(
        rewritten_query="x",
        keywords=["VAT", "vat", "  VAT  ", "topic1", "topic2", "topic3", "topic4", "topic5", "topic6"],
    )
    # case-insensitive dedupe → keeps the first form; then capped at 6
    assert payload.keywords == ["VAT", "topic1", "topic2", "topic3", "topic4", "topic5"]


@pytest.mark.unit
def test_extra_fields_rejected():
    with pytest.raises(ValidationError):
        QueryRewriteResult(rewritten_query="x", unknown_field=1)


@pytest.mark.unit
def test_date_range_accepts_from_alias():
    dr = DateRange.model_validate({"from": "2020-01-01", "to": "2024-12-31"})
    assert dr.from_ == date(2020, 1, 1)
    assert dr.to == date(2024, 12, 31)
