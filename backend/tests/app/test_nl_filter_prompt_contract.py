"""Contract tests for the NL → filter system prompt.

The prompt is data, not code, so we pin the parts the spec depends on:
- jurisdiction + decision_date rules exist, with Polish and English phrasings;
- default date field is decision_date (both jurisdictions have it);
- case_type is documented with its real values (Criminal | Civil | Administrative);
- court_level never appears (data still unnormalised).
"""

from __future__ import annotations

import pytest

from app.extraction_domain.nl_filter_generator import (
    NL_EXCLUDED_CORE_FIELDS,
    SYSTEM_PROMPT,
    BaseSchemaFilter,
)

pytestmark = pytest.mark.unit


def test_prompt_documents_jurisdiction_values():
    assert "jurisdiction: PL | UK" in SYSTEM_PROMPT


@pytest.mark.parametrize(
    "phrase",
    [
        # English
        "United Kingdom",
        "England",
        "Poland",
        "Polish",
        # Polish
        "polskie",
        "brytyjskie",
        "w Polsce",
        "w Anglii",
    ],
)
def test_prompt_lists_jurisdiction_phrasings(phrase: str):
    assert phrase in SYSTEM_PROMPT


@pytest.mark.parametrize(
    "phrase",
    ["2015–2024", "w latach", "od 2020", "po 2020", "przed 2010", "since", "between"],
)
def test_prompt_lists_date_phrasings(phrase: str):
    assert phrase in SYSTEM_PROMPT


def test_prompt_maps_po_to_the_following_year_not_the_named_year():
    # "po 2020 r." ("after 2020") is strictly after 2020 → from 2021-01-01,
    # unlike "od"/"since 2020" which is inclusive → from 2020-01-01.
    assert '"po 2020" → from 2021-01-01' in SYSTEM_PROMPT
    assert '"od 2020" → from 2020-01-01' in SYSTEM_PROMPT


def test_prompt_makes_decision_date_the_default_date_field():
    idx_default = SYSTEM_PROMPT.index("default to `decision_date`")
    idx_appeal = SYSTEM_PROMPT.index("`date_of_appeal_court_judgment` only when")
    assert idx_default < idx_appeal


def test_prompt_has_a_polish_example_with_both_jurisdictions_and_a_year_range():
    assert 'user: "kobiety skazane za oszustwo' in SYSTEM_PROMPT
    assert 'jurisdiction: ["PL", "UK"]' in SYSTEM_PROMPT
    assert 'decision_date: {"from": "2015-01-01", "to": "2024-12-31"}' in SYSTEM_PROMPT


def test_excluded_core_fields_never_reach_the_llm():
    assert frozenset({"court_level"}) == NL_EXCLUDED_CORE_FIELDS
    for field in NL_EXCLUDED_CORE_FIELDS:
        assert field not in SYSTEM_PROMPT, f"{field} leaked into the prompt"
        assert field not in BaseSchemaFilter.model_json_schema()["properties"]


def test_prompt_documents_case_type_values():
    assert "case_type: Criminal | Civil | Administrative" in SYSTEM_PROMPT


@pytest.mark.parametrize("phrase", ["karne", "cywilne", "administracyjne", "civil"])
def test_prompt_lists_case_type_phrasings(phrase: str):
    assert phrase in SYSTEM_PROMPT


def test_case_type_is_in_the_model_schema_but_court_level_is_not():
    props = BaseSchemaFilter.model_json_schema()["properties"]
    assert "case_type" in props
    assert "court_level" not in props
    assert "case_type" not in NL_EXCLUDED_CORE_FIELDS
