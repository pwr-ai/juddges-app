"""Unit tests for app.utils.uk_classification (issue #799)."""

import pytest

from app.utils.uk_classification import (
    classify_uk_citation,
    classify_uk_judgment,
)

CRIM = ("Criminal", "Court of Appeal")
CIV = ("Civil", "Court of Appeal")


@pytest.mark.unit
@pytest.mark.parametrize(
    "citation, expected",
    [
        ("[2013] EWCA Crim 2410", CRIM),
        ("[2017] EWCA 967 (Crim)", CRIM),
        ("Neutral Citation Number:: [2018] EWCA Crim 2155", CRIM),
        ("[2020]  ewca  crim 12", CRIM),
        ("[2020] EWCA (Crim) 596", CRIM),
        ("[2015] EWCA Civ 100", CIV),
        ("[2015] EWCA (Civ) 100", CIV),
        ("[2015] EWCA 100 (Civ)", CIV),
        ("[2019] EWHC 1234 (QB)", ("Civil", "High Court")),
        ("[2019] EWHC 1234 (KB)", ("Civil", "High Court")),
        ("[2019] EWHC 1234 (Ch)", ("Civil", "High Court")),
        ("[2019] EWHC 1234 (Fam)", ("Civil", "High Court")),
        ("[2019] EWHC 1234 (Admin)", ("Administrative", "High Court")),
        ("[2019] EWHC 1234", ("Civil", "High Court")),
    ],
)
def test_classify_uk_citation(citation, expected):
    assert classify_uk_citation(citation) == expected


@pytest.mark.unit
@pytest.mark.parametrize(
    "citation", [None, "", "UK-12345", "[2020] UKSC 5", "I 1 Ca 1/20"]
)
def test_classify_uk_citation_no_match(citation):
    assert classify_uk_citation(citation) is None


@pytest.mark.unit
def test_citation_wins_over_court_type():
    assert classify_uk_judgment("[2013] EWCA Crim 2410", "high_court") == CRIM


@pytest.mark.unit
@pytest.mark.parametrize(
    "court_type, expected",
    [
        ("crown_court_crim", ("Criminal", "Crown Court")),
        ("high_court", ("Civil", "High Court")),
        ("unknown", ("Civil", "Court")),
        (None, ("Civil", "Court")),
    ],
)
def test_fallback_to_court_type_heuristic(court_type, expected):
    assert classify_uk_judgment("UK-abc", court_type) == expected
