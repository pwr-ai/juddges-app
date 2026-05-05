"""Unit tests for search language detection, query classification, and expanded heuristics."""

from app.documents_pkg import _detect_search_language
from app.query_analysis import _heuristic_query_analysis, classify_and_route_query

# ============================================================================
# _detect_search_language tests
# ============================================================================


class TestDetectSearchLanguage:
    """Tests for the Polish/English language auto-detection."""

    def test_english_query_defaults_to_auto(self):
        # Plain English without explicit filters → auto (per-document detection)
        assert _detect_search_language("murder conviction appeal", None, None) == "auto"

    def test_polish_diacritics_detected(self):
        assert _detect_search_language("wyrok sąd apelacyjny", None, None) == "polish"

    def test_polish_diacritics_odpowiedzialnosc(self):
        assert _detect_search_language("odpowiedzialność karna", None, None) == "polish"

    def test_polish_stopwords_detected(self):
        assert _detect_search_language("wyrok karny sąd", None, None) == "polish"

    def test_explicit_en_language_filter(self):
        assert _detect_search_language("wyrok sąd", ["en"], None) == "english"

    def test_explicit_uk_language_filter(self):
        assert _detect_search_language("coś po polsku", ["uk"], None) == "english"

    def test_explicit_pl_language_filter(self):
        assert _detect_search_language("murder appeal", ["pl"], None) == "polish"

    def test_uk_jurisdiction_filter(self):
        assert _detect_search_language("generic query", None, ["UK"]) == "english"

    def test_pl_jurisdiction_filter(self):
        assert _detect_search_language("generic query", None, ["PL"]) == "polish"

    def test_mixed_jurisdictions_defaults_to_auto(self):
        # Mixed jurisdictions → auto (per-document detection in SQL)
        assert _detect_search_language("generic query", None, ["PL", "UK"]) == "auto"

    def test_language_filter_takes_priority_over_content(self):
        # Polish text but English language filter should return English
        assert _detect_search_language("odpowiedzialność", ["en"], None) == "english"

    def test_jurisdiction_takes_priority_over_content(self):
        # Polish text but UK jurisdiction should return English
        assert _detect_search_language("odpowiedzialność", None, ["UK"]) == "english"

    def test_single_polish_stopword_not_enough(self):
        # Need at least 2 Polish stopwords to trigger detection
        # Single stopword without diacritics → auto
        assert _detect_search_language("jest important", None, None) == "auto"

    def test_two_polish_stopwords_trigger_detection(self):
        assert _detect_search_language("nie jest dobrze", None, None) == "polish"

    def test_empty_query_defaults_to_auto(self):
        assert _detect_search_language("", None, None) == "auto"

    def test_numeric_query_defaults_to_auto(self):
        assert _detect_search_language("12345", None, None) == "auto"


# ============================================================================
# Expanded heuristic query analysis tests
# ============================================================================


class TestHeuristicQueryAnalysisExpanded:
    """Tests for newly added synonym expansion and Polish detection."""

    def test_polish_diacritics_infer_pl_jurisdiction(self):
        result = _heuristic_query_analysis("odpowiedzialność karna za morderstwo")
        assert result.jurisdictions == ["PL"]

    def test_english_query_no_jurisdiction(self):
        result = _heuristic_query_analysis("contract breach damages")
        assert result.jurisdictions is None

    def test_murder_synonym_expansion(self):
        result = _heuristic_query_analysis("murder case")
        assert (
            "homicide" in result.semantic_query
            or "manslaughter" in result.semantic_query
        )

    def test_conviction_synonym_expansion(self):
        result = _heuristic_query_analysis("conviction appeal")
        assert "guilty" in result.semantic_query or "convicted" in result.semantic_query

    def test_damages_synonym_expansion(self):
        result = _heuristic_query_analysis("damages claim")
        assert (
            "compensation" in result.semantic_query or "remedy" in result.semantic_query
        )

    def test_sentencing_synonym_expansion(self):
        result = _heuristic_query_analysis("sentencing guidelines")
        assert (
            "sentence" in result.semantic_query or "punishment" in result.semantic_query
        )

    def test_property_synonym_expansion(self):
        result = _heuristic_query_analysis("property dispute")
        assert "estate" in result.semantic_query or "ownership" in result.semantic_query

    def test_keyword_query_is_normalized(self):
        result = _heuristic_query_analysis("Murder Conviction APPEAL!")
        assert result.keyword_query == "murder conviction appeal"

    def test_criminal_explicit_case_type(self):
        result = _heuristic_query_analysis("criminal sentencing")
        assert result.case_types == ["Criminal"]

    def test_supreme_court_level_detection(self):
        result = _heuristic_query_analysis("supreme court ruling")
        assert result.court_levels == ["Supreme Court"]

    def test_year_extraction_single(self):
        result = _heuristic_query_analysis("murder case 2015")
        assert result.date_from == "2015-01-01"
        assert result.date_to == "2015-12-31"

    def test_year_extraction_range(self):
        result = _heuristic_query_analysis("cases between 2010 and 2020")
        assert result.date_from == "2010-01-01"
        assert result.date_to == "2020-12-31"

    def test_query_type_included_in_result(self):
        result = _heuristic_query_analysis("III KK 123/20")
        assert result.query_type == "case_number"


# ============================================================================
# classify_and_route_query tests
# ============================================================================


class TestClassifyAndRouteQuery:
    """Tests for query type classification and alpha routing."""

    # -- Case numbers --

    def test_polish_case_number(self):
        qtype, alpha = classify_and_route_query("III KK 123/20")
        assert qtype == "case_number"
        assert alpha == 0.1

    def test_polish_case_number_with_context(self):
        qtype, _ = classify_and_route_query("wyrok w sprawie II K 45/21")
        assert qtype == "case_number"

    def test_uk_neutral_citation(self):
        qtype, alpha = classify_and_route_query("[2020] UKSC 1")
        assert qtype == "case_number"
        assert alpha == 0.1

    def test_uk_ewca_citation(self):
        qtype, _ = classify_and_route_query("[2019] EWCA Civ 123")
        assert qtype == "case_number"

    # -- Statute references --

    def test_polish_article_reference(self):
        qtype, alpha = classify_and_route_query("art. 148 kk")
        assert qtype == "statute_reference"
        assert alpha == 0.2

    def test_paragraph_symbol(self):
        qtype, _ = classify_and_route_query("§ 5 ust. 1")
        assert qtype == "statute_reference"

    def test_uk_section_reference(self):
        qtype, _ = classify_and_route_query("Section 2 Criminal Justice Act")
        assert qtype == "statute_reference"

    # -- Exact phrase --

    def test_quoted_phrase(self):
        qtype, alpha = classify_and_route_query('"strict liability"')
        assert qtype == "exact_phrase"
        assert alpha == 0.15

    # -- Conceptual --

    def test_conceptual_long_query(self):
        qtype, alpha = classify_and_route_query("duty of care in medical negligence")
        assert qtype == "conceptual"
        assert alpha == 0.8

    # -- Mixed / default --

    def test_short_generic_query(self):
        qtype, alpha = classify_and_route_query("murder")
        assert qtype == "mixed"
        assert alpha == 0.5

    def test_two_word_query(self):
        qtype, _ = classify_and_route_query("contract breach")
        assert qtype == "mixed"
