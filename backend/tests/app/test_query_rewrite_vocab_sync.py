"""Cross-package check: Literal types in juddges_search.chains.query_rewrite_models
must stay in lockstep with MEILISEARCH_FACET_VOCABULARY in app.services.meilisearch_config.

These constants live in two packages on purpose (juddges_search is standalone and
cannot import from backend.app), so we assert equality here.
"""

from typing import get_args

import pytest
from juddges_search.chains.query_rewrite_models import (
    CaseType,
    CourtLevel,
    DecisionType,
    Jurisdiction,
    Outcome,
)

from app.services.meilisearch_config import MEILISEARCH_FACET_VOCABULARY


@pytest.mark.unit
def test_query_rewrite_literals_match_facet_vocabulary():
    """Each Literal type must contain exactly the same values as its
    counterpart in MEILISEARCH_FACET_VOCABULARY."""
    assert set(get_args(Jurisdiction)) == set(
        MEILISEARCH_FACET_VOCABULARY["jurisdiction"]
    )
    assert set(get_args(CourtLevel)) == set(MEILISEARCH_FACET_VOCABULARY["court_level"])
    assert set(get_args(CaseType)) == set(MEILISEARCH_FACET_VOCABULARY["case_type"])
    assert set(get_args(DecisionType)) == set(
        MEILISEARCH_FACET_VOCABULARY["decision_type"]
    )
    assert set(get_args(Outcome)) == set(MEILISEARCH_FACET_VOCABULARY["outcome"])
