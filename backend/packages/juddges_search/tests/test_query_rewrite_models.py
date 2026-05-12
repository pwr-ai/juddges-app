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
def test_arrays_capped_to_six_values():
    payload = QueryRewriteResult(
        rewritten_query="x",
        keywords=["a", "b", "c", "d", "e", "f", "g"],
    )
    assert len(payload.keywords) == 6
