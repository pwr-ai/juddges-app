"""Unit tests for ``promote_to_typed_columns`` and its coercion helpers."""

from __future__ import annotations

import pytest

from app.extraction_domain.base_schema_promote import (
    ALL_TYPED_COLUMNS,
    promote_to_typed_columns,
)


@pytest.mark.unit
class TestStringCoercion:
    def test_real_string_passes_through(self):
        out = promote_to_typed_columns({"case_name": "R v Smith"})
        assert out["base_case_name"] == "R v Smith"

    def test_string_null_sentinel_becomes_none(self):
        out = promote_to_typed_columns({"case_name": "null"})
        assert out["base_case_name"] is None

    def test_empty_string_becomes_none(self):
        out = promote_to_typed_columns({"case_name": ""})
        assert out["base_case_name"] is None

    def test_whitespace_is_trimmed(self):
        out = promote_to_typed_columns({"case_name": "  R v Smith  "})
        assert out["base_case_name"] == "R v Smith"

    def test_missing_key_becomes_none(self):
        out = promote_to_typed_columns({})
        assert out["base_case_name"] is None


@pytest.mark.unit
class TestIntegerCoercion:
    def test_real_integer(self):
        out = promote_to_typed_columns({"num_victims": 3})
        assert out["base_num_victims"] == 3

    def test_zero_is_preserved(self):
        out = promote_to_typed_columns({"co_def_acc_num": 0})
        assert out["base_co_def_acc_num"] == 0

    def test_string_digit_is_coerced(self):
        out = promote_to_typed_columns({"num_victims": "5"})
        assert out["base_num_victims"] == 5

    def test_float_with_integer_value_is_coerced(self):
        out = promote_to_typed_columns({"num_victims": 4.0})
        assert out["base_num_victims"] == 4

    def test_float_with_fractional_part_is_rejected(self):
        out = promote_to_typed_columns({"num_victims": 3.5})
        assert out["base_num_victims"] is None

    def test_null_sentinel_becomes_none(self):
        out = promote_to_typed_columns({"num_victims": "null"})
        assert out["base_num_victims"] is None

    def test_boolean_input_is_rejected(self):
        # `True` is not a valid number even though `int(True) == 1`.
        out = promote_to_typed_columns({"num_victims": True})
        assert out["base_num_victims"] is None


@pytest.mark.unit
class TestNumericCoercion:
    def test_large_integer_case_number(self):
        out = promote_to_typed_columns({"case_number": 200700446})
        assert out["base_case_number"] == 200700446

    def test_float_passes_through(self):
        out = promote_to_typed_columns({"victim_age_offence": 17.5})
        assert out["base_victim_age_offence"] == 17.5

    def test_string_numeric_is_coerced(self):
        out = promote_to_typed_columns({"victim_age_offence": "17"})
        assert out["base_victim_age_offence"] == 17

    def test_null_sentinel_becomes_none(self):
        out = promote_to_typed_columns({"case_number": "null"})
        assert out["base_case_number"] is None

    def test_garbage_becomes_none(self):
        out = promote_to_typed_columns({"case_number": "n/a"})
        assert out["base_case_number"] is None


@pytest.mark.unit
class TestBooleanCoercion:
    def test_true(self):
        out = promote_to_typed_columns({"did_offender_confess": True})
        assert out["base_did_offender_confess"] is True

    def test_false(self):
        out = promote_to_typed_columns({"did_offender_confess": False})
        assert out["base_did_offender_confess"] is False

    def test_string_true(self):
        out = promote_to_typed_columns({"vic_impact_statement": "true"})
        assert out["base_vic_impact_statement"] is True

    def test_null_sentinel(self):
        out = promote_to_typed_columns({"did_offender_confess": "null"})
        assert out["base_did_offender_confess"] is None


@pytest.mark.unit
class TestArrayCoercion:
    def test_string_array_passes_through(self):
        out = promote_to_typed_columns({"keywords": ["a", "b"]})
        assert out["base_keywords"] == ["a", "b"]

    def test_null_inside_array_is_filtered(self):
        out = promote_to_typed_columns({"keywords": ["a", "null", "b"]})
        assert out["base_keywords"] == ["a", "b"]

    def test_whitespace_only_entries_dropped(self):
        out = promote_to_typed_columns({"keywords": ["a", "  ", "b"]})
        assert out["base_keywords"] == ["a", "b"]

    def test_all_null_becomes_none(self):
        out = promote_to_typed_columns({"keywords": ["null", None, ""]})
        assert out["base_keywords"] is None

    def test_string_null_becomes_none(self):
        out = promote_to_typed_columns({"appeal_outcome": "null"})
        assert out["base_appeal_outcome"] is None

    def test_missing_key_becomes_none(self):
        out = promote_to_typed_columns({})
        assert out["base_keywords"] is None


@pytest.mark.unit
class TestDateCoercion:
    def test_iso_date_passes_through(self):
        out = promote_to_typed_columns({"date_of_appeal_court_judgment": "2007-04-27"})
        assert out["base_date_of_appeal_court_judgment"] == "2007-04-27"

    def test_invalid_date_becomes_none(self):
        out = promote_to_typed_columns({"date_of_appeal_court_judgment": "April 2007"})
        assert out["base_date_of_appeal_court_judgment"] is None

    def test_null_sentinel(self):
        out = promote_to_typed_columns({"date_of_appeal_court_judgment": "null"})
        assert out["base_date_of_appeal_court_judgment"] is None


@pytest.mark.unit
class TestEnumValidation:
    def test_double_quoted_enum_is_unwrapped(self):
        out = promote_to_typed_columns({"appellant": '"offender"'})
        assert out["base_appellant"] == "offender"

    def test_apostrophe_dont_know_is_normalized(self):
        out = promote_to_typed_columns({"plea_point": "don't_know"})
        assert out["base_plea_point"] == "dont_know"

    def test_invalid_scalar_enum_becomes_none(self):
        # victim_type allows only 'individual_person' / 'organisation'.
        out = promote_to_typed_columns({"victim_type": "dont_know"})
        assert out["base_victim_type"] is None

    def test_valid_scalar_enum_passes(self):
        out = promote_to_typed_columns({"victim_type": "organisation"})
        assert out["base_victim_type"] == "organisation"

    def test_invalid_array_enum_values_are_filtered(self):
        # offender_gender allows only gender_{male,female,unknown}.
        out = promote_to_typed_columns(
            {"offender_gender": ["gender_male", "alien", "gender_female"]}
        )
        assert out["base_offender_gender"] == ["gender_male", "gender_female"]

    def test_all_array_values_invalid_becomes_none(self):
        out = promote_to_typed_columns({"appeal_outcome": ["totally_made_up"]})
        assert out["base_appeal_outcome"] is None

    def test_unconstrained_string_field_is_left_alone(self):
        # case_name has no enum constraint.
        out = promote_to_typed_columns({"case_name": "Anything goes"})
        assert out["base_case_name"] == "Anything goes"


@pytest.mark.unit
class TestCompleteness:
    def test_every_base_column_is_present_in_output(self):
        out = promote_to_typed_columns({})
        assert set(out.keys()) == set(ALL_TYPED_COLUMNS)

    def test_typed_columns_count_matches_schema(self):
        # 21 strings + 1 date + 2 ints + 2 numerics + 2 booleans + 23 arrays
        assert len(ALL_TYPED_COLUMNS) == 51

    def test_none_input_yields_all_none(self):
        out = promote_to_typed_columns(None)
        assert all(v is None for v in out.values())

    def test_realistic_uk_payload(self):
        # Modeled on the actual production sample.
        out = promote_to_typed_columns(
            {
                "num_victims": "null",
                "victim_age_offence": "null",
                "case_number": 200700446,
                "case_name": "R v M, Z, I, R and B",
                "keywords": ["terrorism", "section 57 Terrorism Act 2000"],
                "appeal_outcome": ["outcome_dismissed_or_refused"],
                "date_of_appeal_court_judgment": "2007-04-27",
                "co_def_acc_num": 5,
                "appellant": "offender",
                "did_offender_confess": False,
            }
        )
        assert out["base_num_victims"] is None
        assert out["base_victim_age_offence"] is None
        assert out["base_case_number"] == 200700446
        assert out["base_case_name"] == "R v M, Z, I, R and B"
        assert out["base_keywords"] == ["terrorism", "section 57 Terrorism Act 2000"]
        assert out["base_appeal_outcome"] == ["outcome_dismissed_or_refused"]
        assert out["base_date_of_appeal_court_judgment"] == "2007-04-27"
        assert out["base_co_def_acc_num"] == 5
        assert out["base_appellant"] == "offender"
        assert out["base_did_offender_confess"] is False
