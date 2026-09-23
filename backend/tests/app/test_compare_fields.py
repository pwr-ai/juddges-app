"""Comparable field registry: base schema + any JSON Schema (Spec C).

No DB, no HTTP.
"""

from __future__ import annotations

import pytest
from juddges_search.info_extraction import BaseSchemaExtractor

from app.compare.fields import (
    DEFAULT_FIRST,
    base_compare_fields,
    comparable_fields_from_schema,
    select_base_fields,
)

pytestmark = pytest.mark.unit


def test_comparable_fields_are_enum_array_enum_or_boolean_only():
    schema = {
        "properties": {
            "outcome": {
                "type": "string",
                "enum": ["a", "b"],
                "x-ui-label": "Outcome",
                "x-ui-order": 2,
            },
            "flags": {"type": "array", "items": {"enum": ["x", "y"]}, "x-ui-order": 1},
            "confessed": {"type": "boolean", "x-ui-order": 3},
            "summary": {"type": "string"},
            "tags": {"type": "array", "items": {"type": "string"}},
            "age": {"type": "number"},
        }
    }
    specs = comparable_fields_from_schema(schema, source="schema:abc")
    assert [(s.field, s.kind) for s in specs] == [
        ("flags", "enum_array"),
        ("outcome", "enum"),
        ("confessed", "boolean"),
    ]
    assert specs[1].label == "Outcome"
    assert specs[2].label == "confessed"  # falls back to the property name
    assert all(s.source == "schema:abc" for s in specs)


def test_base_field_count_is_derived_from_the_schema():
    """The registry must not hardcode a magic count; derive it from the
    shipped base schema via the same classification the production code
    uses (enum / array-of-enum / boolean). Preflight counted 17."""
    schema = BaseSchemaExtractor().schema
    derived = comparable_fields_from_schema(schema, source="base")
    assert len(base_compare_fields()) == len(derived) == 17
    assert {s.field for s in derived} == {s.field for s in base_compare_fields()}


def test_base_fields_come_from_the_shipped_base_schema():
    names = [s.field for s in base_compare_fields()]
    assert names[:4] == list(DEFAULT_FIRST)
    assert set(names) == {
        "appeal_outcome",
        "offender_gender",
        "sentence_serve",
        "plea_point",
        "did_offender_confess",
        "remand_decision",
        "offender_job_offence",
        "offender_home_offence",
        "offender_intox_offence",
        "offender_victim_relationship",
        "victim_type",
        "victim_gender",
        "victim_intox_offence",
        "pre_sent_report",
        "vic_impact_statement",
        "appellant",
        "appeal_against",
    }
    assert "keywords" not in names and "convict_offences" not in names


def test_select_base_fields_defaults_to_all_and_validates_names():
    assert select_base_fields(None) == base_compare_fields()
    assert [s.field for s in select_base_fields(["plea_point", "appellant"])] == [
        "plea_point",
        "appellant",
    ]
    with pytest.raises(ValueError, match="keywords"):
        select_base_fields(["keywords"])


def test_select_base_fields_dedupes_preserving_first_occurrence_order():
    """Repeated names collapse to one spec each -- the router pays one RPC per spec."""
    specs = select_base_fields(["appellant", "plea_point", "appellant", "plea_point"])
    assert [s.field for s in specs] == ["appellant", "plea_point"]
