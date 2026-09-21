"""Contract tests for the NL → filter system prompt.

The prompt is data, not code, so we pin the parts the spec depends on:
- jurisdiction + decision_date rules exist, with Polish and English phrasings;
- default date field is decision_date (both jurisdictions have it);
- case_type / court_level never appear (data defect, APP_STATUS §4).
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


def test_prompt_makes_decision_date_the_default_date_field():
    idx_default = SYSTEM_PROMPT.index("default to `decision_date`")
    idx_appeal = SYSTEM_PROMPT.index("`date_of_appeal_court_judgment` only when")
    assert idx_default < idx_appeal


def test_prompt_has_a_polish_example_with_both_jurisdictions_and_a_year_range():
    assert 'user: "kobiety skazane za oszustwo' in SYSTEM_PROMPT
    assert 'jurisdiction: ["PL", "UK"]' in SYSTEM_PROMPT
    assert 'decision_date: {"from": "2015-01-01", "to": "2024-12-31"}' in SYSTEM_PROMPT


def test_excluded_core_fields_never_reach_the_llm():
    for field in NL_EXCLUDED_CORE_FIELDS:
        assert field not in SYSTEM_PROMPT, f"{field} leaked into the prompt"
        assert field not in BaseSchemaFilter.model_json_schema()["properties"]
