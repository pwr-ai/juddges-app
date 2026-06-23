"""Unit tests for the query-time attribute parser (issue #192).

The parser turns a free-text ``/search`` query into structured attributes
(court, date/year, case number, judge, jurisdiction) plus the unparsed
remainder which downstream becomes the full-text query.

Strategy under test is regex/heuristics only — deterministic, fast, no LLM.
"""

from __future__ import annotations

import pytest

from app.judgments_pkg.query_attribute_parser import (
    ParsedQuery,
    build_meili_filter,
    parse_query_attributes,
)

pytestmark = pytest.mark.unit


# ── court extraction ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("query", "expected_court", "expected_jurisdiction"),
    [
        ("wyrok SN 2023", "SN", "pl"),
        ("orzeczenie NSA w sprawie", "NSA", "pl"),
        ("TK wyrok", "TK", "pl"),
        ("UKSC appeal 2022", "UKSC", "uk"),
        ("EWCA Civ ruling", "EWCA", "uk"),
        ("EWHC decision", "EWHC", "uk"),
    ],
)
def test_extracts_court_and_infers_jurisdiction(
    query: str, expected_court: str, expected_jurisdiction: str
) -> None:
    parsed = parse_query_attributes(query)
    assert parsed.court == expected_court
    assert parsed.jurisdiction == expected_jurisdiction


def test_court_match_is_word_boundary_not_substring() -> None:
    # "snow" must not match the "SN" court token.
    parsed = parse_query_attributes("snow damage claim")
    assert parsed.court is None


def test_court_token_is_case_insensitive() -> None:
    parsed = parse_query_attributes("wyrok sn 2023")
    assert parsed.court == "SN"


# ── year / date range extraction ──────────────────────────────────────────


def test_extracts_single_year() -> None:
    parsed = parse_query_attributes("wyrok 2023")
    assert parsed.year == 2023
    assert parsed.date_from is None
    assert parsed.date_to is None


def test_extracts_year_range_dash() -> None:
    parsed = parse_query_attributes("orzeczenia 2020-2023")
    assert parsed.date_from == "2020-01-01"
    assert parsed.date_to == "2023-12-31"
    assert parsed.year is None


def test_extracts_year_range_polish_od_do() -> None:
    parsed = parse_query_attributes("wyroki od 2021 do 2023")
    assert parsed.date_from == "2021-01-01"
    assert parsed.date_to == "2023-12-31"


def test_ignores_implausible_years() -> None:
    # A bare case-number-ish number or page number should not become a year.
    parsed = parse_query_attributes("paragraf 1234")
    assert parsed.year is None
    assert parsed.date_from is None


# ── case number extraction ────────────────────────────────────────────────


def test_extracts_polish_case_number() -> None:
    parsed = parse_query_attributes("wyrok SN III CSK 245/22")
    assert parsed.case_number == "III CSK 245/22"


def test_extracts_polish_case_number_prefix_only() -> None:
    parsed = parse_query_attributes("wyrok SN 2023 III CSK")
    assert parsed.case_number_prefix == "III CSK"
    assert parsed.case_number is None


def test_extracts_uk_neutral_citation() -> None:
    parsed = parse_query_attributes("appeal [2023] EWCA Civ 1234")
    assert parsed.case_number == "[2023] EWCA Civ 1234"


# ── judge extraction ──────────────────────────────────────────────────────


def test_extracts_judge_after_sedzia_keyword() -> None:
    parsed = parse_query_attributes("sędzia Jan Kowalski rozwód")
    assert parsed.judge == "Jan Kowalski"


def test_extracts_judge_after_uk_keyword() -> None:
    parsed = parse_query_attributes("before Lord Reed contract dispute")
    assert parsed.judge == "Lord Reed"


def test_no_judge_when_ambiguous() -> None:
    # No judge keyword present → don't guess a name out of free text.
    parsed = parse_query_attributes("rozwód alimenty")
    assert parsed.judge is None


# ── jurisdiction extraction ───────────────────────────────────────────────


def test_explicit_jurisdiction_token_pl() -> None:
    parsed = parse_query_attributes("jurisdiction:pl rozwód")
    assert parsed.jurisdiction == "pl"


def test_explicit_jurisdiction_token_uk() -> None:
    parsed = parse_query_attributes("contract uk")
    assert parsed.jurisdiction == "uk"


# ── remainder / FTS text ──────────────────────────────────────────────────


def test_remainder_strips_parsed_tokens() -> None:
    parsed = parse_query_attributes("wyrok SN 2023 III CSK rozwód alimenty")
    # parsed structural tokens removed; meaningful FTS terms preserved.
    assert "rozwód" in parsed.remainder
    assert "alimenty" in parsed.remainder
    assert "SN" not in parsed.remainder
    assert "2023" not in parsed.remainder
    assert "III CSK" not in parsed.remainder


def test_remainder_collapses_whitespace() -> None:
    parsed = parse_query_attributes("wyrok SN   2023    rozwód")
    assert "  " not in parsed.remainder


# ── full acceptance-criteria scenario ─────────────────────────────────────


def test_acceptance_criteria_scenario() -> None:
    """`?q=wyrok SN 2023 III CSK` → court=SN, year=2023, case_number_prefix=III CSK."""
    parsed = parse_query_attributes("wyrok SN 2023 III CSK")
    assert parsed.court == "SN"
    assert parsed.year == 2023
    assert parsed.case_number_prefix == "III CSK"
    assert parsed.jurisdiction == "pl"
    # remainder is whatever is left for FTS (e.g. "wyrok")
    assert "SN" not in parsed.remainder
    assert "2023" not in parsed.remainder


# ── base-search invariance (no recognized tokens) ─────────────────────────


def test_plain_query_has_no_attributes_and_unchanged_remainder() -> None:
    """A plain query with no recognized tokens must parse to nothing — so the
    router can fall through to byte-identical base-search behaviour."""
    query = "umowa najmu lokalu mieszkalnego"
    parsed = parse_query_attributes(query)
    assert not parsed.has_attributes()
    assert parsed.remainder == query


def test_empty_query() -> None:
    parsed = parse_query_attributes("")
    assert not parsed.has_attributes()
    assert parsed.remainder == ""


def test_whitespace_only_query() -> None:
    parsed = parse_query_attributes("   ")
    assert not parsed.has_attributes()
    assert parsed.remainder == ""


# ── Meili filter construction ─────────────────────────────────────────────


def test_build_meili_filter_jurisdiction_only() -> None:
    parsed = ParsedQuery(jurisdiction="pl", remainder="rozwód")
    flt = build_meili_filter(parsed)
    assert flt == 'jurisdiction = "pl"'


def test_build_meili_filter_year_to_date_range() -> None:
    parsed = ParsedQuery(year=2023, remainder="wyrok")
    flt = build_meili_filter(parsed)
    # decision_date is filterable; a single year becomes a bounded range.
    assert flt == 'decision_date >= "2023-01-01" AND decision_date <= "2023-12-31"'


def test_build_meili_filter_explicit_date_range() -> None:
    parsed = ParsedQuery(date_from="2020-01-01", date_to="2023-12-31", remainder="x")
    flt = build_meili_filter(parsed)
    assert flt == 'decision_date >= "2020-01-01" AND decision_date <= "2023-12-31"'


def test_build_meili_filter_combines_jurisdiction_and_date() -> None:
    parsed = ParsedQuery(jurisdiction="pl", year=2023, remainder="x")
    flt = build_meili_filter(parsed)
    assert flt is not None
    assert 'jurisdiction = "pl"' in flt
    assert 'decision_date >= "2023-01-01"' in flt
    assert " AND " in flt


def test_build_meili_filter_returns_none_for_non_filterable_only() -> None:
    # court_name / case_number / judges are searchable but NOT filterable in the
    # Meili index, so they don't produce a filter clause — they stay in FTS.
    parsed = ParsedQuery(court="SN", case_number_prefix="III CSK", remainder="x")
    # No jurisdiction/date → nothing filterable.
    assert build_meili_filter(parsed) is None


def test_build_meili_filter_none_when_no_attributes() -> None:
    parsed = ParsedQuery(remainder="plain query")
    assert build_meili_filter(parsed) is None


# ── filter terms merged back into FTS for non-filterable attrs ─────────────


def test_court_and_case_number_remain_searchable_via_fts_terms() -> None:
    """Non-filterable parsed attributes are exposed as ``fts_terms`` so the
    router can append them to the FTS query (keeping recall on court_name /
    case_number / judges_flat which are searchable, not filterable)."""
    parsed = parse_query_attributes("wyrok SN III CSK 245/22 rozwód")
    terms = parsed.fts_terms()
    assert "SN" in terms
    assert "III CSK 245/22" in terms
