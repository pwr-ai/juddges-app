"""Unit tests for the NL → base-schema filter generator.

Covers:
- BaseSchemaFilter schema validation (Literal constraints reject unknown enums).
- to_rpc_payload() shape matches what filter_documents_by_extracted_data accepts.
- generate_base_schema_filter() wires the LLM chain and returns a parsed model
  (LLM is mocked).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.extraction_domain.nl_filter_generator import (
    BaseSchemaFilter,
    DateRange,
    NumericRange,
    create_nl_filter_chain,
    generate_base_schema_filter,
)

# ---------------------------------------------------------------------------
# Schema construction & validation
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBaseSchemaFilterValidation:
    def test_empty_filter_is_valid(self):
        f = BaseSchemaFilter()
        assert f.to_rpc_payload() == {"filters": {}, "text_query": None}

    def test_numeric_min_filter(self):
        f = BaseSchemaFilter(co_def_acc_num=NumericRange(min=2))
        payload = f.to_rpc_payload()
        assert payload["filters"] == {"co_def_acc_num": {"min": 2.0}}
        assert payload["text_query"] is None

    def test_numeric_equality_filter(self):
        f = BaseSchemaFilter(num_victims=3)
        payload = f.to_rpc_payload()
        assert payload["filters"] == {"num_victims": 3.0}

    def test_date_range_uses_from_alias(self):
        f = BaseSchemaFilter(
            date_of_appeal_court_judgment=DateRange.model_validate(
                {"from": "2025-01-01", "to": "2025-12-31"}
            )
        )
        payload = f.to_rpc_payload()
        assert payload["filters"]["date_of_appeal_court_judgment"] == {
            "from": "2025-01-01",
            "to": "2025-12-31",
        }

    def test_text_query_split_from_filters(self):
        f = BaseSchemaFilter(
            text_query="robbery knife", offender_gender=["gender_female"]
        )
        payload = f.to_rpc_payload()
        assert payload["text_query"] == "robbery knife"
        assert payload["filters"] == {"offender_gender": ["gender_female"]}

    def test_unknown_enum_rejected(self):
        with pytest.raises(ValidationError):
            BaseSchemaFilter(
                appeal_outcome=["outcome_quashed"]
            )  # missing 'conviction_'

    def test_unknown_top_level_field_rejected(self):
        with pytest.raises(ValidationError):
            BaseSchemaFilter.model_validate({"foo_bar": "baz"})

    def test_substring_strings_pass_through(self):
        f = BaseSchemaFilter(appeal_court_judges_names="Edis")
        assert f.to_rpc_payload()["filters"] == {"appeal_court_judges_names": "Edis"}

    def test_boolean_flags(self):
        f = BaseSchemaFilter(did_offender_confess=True, vic_impact_statement=False)
        payload = f.to_rpc_payload()
        # exclude_none keeps False (it is not None)
        assert payload["filters"] == {
            "did_offender_confess": True,
            "vic_impact_statement": False,
        }

    def test_composite_query_serialises_round_trip(self):
        f = BaseSchemaFilter(
            offender_gender=["gender_female"],
            offender_intox_offence=["intox_drugs"],
            co_def_acc_num=NumericRange(min=1),
            appeal_court_judges_names="Holroyde",
            date_of_appeal_court_judgment=DateRange.model_validate(
                {"from": "2024-01-01"}
            ),
            text_query="firearm",
        )
        payload = f.to_rpc_payload()
        assert payload["text_query"] == "firearm"
        assert payload["filters"] == {
            "offender_gender": ["gender_female"],
            "offender_intox_offence": ["intox_drugs"],
            "co_def_acc_num": {"min": 1.0},
            "appeal_court_judges_names": "Holroyde",
            "date_of_appeal_court_judgment": {"from": "2024-01-01"},
        }


# ---------------------------------------------------------------------------
# NumericRange / DateRange
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestRangeHelpers:
    def test_numeric_range_open_upper(self):
        r = NumericRange(min=2)
        assert r.model_dump(exclude_none=True) == {"min": 2.0}

    def test_numeric_range_both_bounds(self):
        r = NumericRange(min=1, max=10)
        assert r.model_dump(exclude_none=True) == {"min": 1.0, "max": 10.0}

    def test_date_range_aliases_from(self):
        r = DateRange.model_validate({"from": "2025-01-01", "to": "2025-12-31"})
        dumped = r.model_dump(exclude_none=True, by_alias=True)
        assert dumped == {"from": "2025-01-01", "to": "2025-12-31"}

    def test_numeric_range_rejects_extra_fields(self):
        with pytest.raises(ValidationError):
            NumericRange.model_validate({"min": 1, "extra": "no"})


# ---------------------------------------------------------------------------
# Chain wiring (LLM mocked)
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestGenerateBaseSchemaFilter:
    @pytest.mark.asyncio
    async def test_returns_parsed_filter(self):
        expected = BaseSchemaFilter(
            co_def_acc_num=NumericRange(min=2),
            did_offender_confess=True,
        )
        mock_chain = MagicMock()
        mock_chain.ainvoke = AsyncMock(return_value=expected)

        with patch(
            "app.extraction_domain.nl_filter_generator.create_nl_filter_chain",
            return_value=mock_chain,
        ):
            result = await generate_base_schema_filter(
                "list cases with at least 2 co-defendants where the offender confessed"
            )

        assert result == expected
        assert result.to_rpc_payload() == {
            "filters": {
                "co_def_acc_num": {"min": 2.0},
                "did_offender_confess": True,
            },
            "text_query": None,
        }

    @pytest.mark.asyncio
    async def test_passes_query_to_chain(self):
        mock_chain = MagicMock()
        mock_chain.ainvoke = AsyncMock(return_value=BaseSchemaFilter())

        with patch(
            "app.extraction_domain.nl_filter_generator.create_nl_filter_chain",
            return_value=mock_chain,
        ):
            await generate_base_schema_filter("anything")

        mock_chain.ainvoke.assert_awaited_once_with({"query": "anything"})

    def test_create_chain_uses_default_llm(self):
        with patch(
            "app.extraction_domain.nl_filter_generator.get_default_llm"
        ) as mock_factory:
            mock_llm = MagicMock()
            mock_llm.with_structured_output = MagicMock(return_value=MagicMock())
            mock_factory.return_value = mock_llm

            create_nl_filter_chain()

        mock_factory.assert_called_once_with(use_mini_model=True)
        mock_llm.with_structured_output.assert_called_once_with(BaseSchemaFilter)
