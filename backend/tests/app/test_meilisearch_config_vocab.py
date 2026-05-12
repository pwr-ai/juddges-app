"""Vocabulary constants exposed by meilisearch_config."""

import pytest

from app.services.meilisearch_config import (
    MEILISEARCH_FACET_VOCABULARY,
    MEILISEARCH_INDEX_SETTINGS,
    MEILISEARCH_NUMERIC_FACETS,
    MEILISEARCH_OPEN_ARRAY_FACETS,
)


@pytest.mark.unit
def test_facet_vocab_covers_all_filterable_categoricals():
    expected = {
        "jurisdiction",
        "court_level",
        "case_type",
        "decision_type",
        "outcome",
    }
    assert set(MEILISEARCH_FACET_VOCABULARY.keys()) == expected
    filterable = set(MEILISEARCH_INDEX_SETTINGS["filterableAttributes"])
    for field, values in MEILISEARCH_FACET_VOCABULARY.items():
        assert field in filterable, f"{field} missing from filterableAttributes"
        assert isinstance(values, tuple)
        assert all(isinstance(v, str) and v for v in values)
        assert len(values) == len(set(values)), f"duplicates in {field}"


@pytest.mark.unit
def test_numeric_facets_list_matches_base_columns():
    assert MEILISEARCH_NUMERIC_FACETS == (
        "base_num_victims",
        "base_victim_age_offence",
        "base_case_number",
        "base_co_def_acc_num",
        "base_date_of_appeal_court_judgment_ts",
    )
    filterable = set(MEILISEARCH_INDEX_SETTINGS["filterableAttributes"])
    for field in MEILISEARCH_NUMERIC_FACETS:
        assert field in filterable, f"{field} missing from filterableAttributes"


@pytest.mark.unit
def test_open_array_facets_match_filterable_attributes():
    assert set(MEILISEARCH_OPEN_ARRAY_FACETS) == {
        "keywords",
        "legal_topics",
        "cited_legislation",
    }
    filterable = set(MEILISEARCH_INDEX_SETTINGS["filterableAttributes"])
    for field in MEILISEARCH_OPEN_ARRAY_FACETS:
        assert field in filterable, f"{field} missing from filterableAttributes"
