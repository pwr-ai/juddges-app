"""Unit tests for search language detection and expanded query analysis heuristics."""

from app.documents import _detect_search_language
from app.query_analysis import _heuristic_query_analysis

# ============================================================================
# _detect_search_language tests
# ============================================================================


class TestDetectSearchLanguage:
    """Tests for the Polish/English language auto-detection."""

    def test_english_query_defaults_to_english(self):
        assert (
            _detect_search_language("murder conviction appeal", None, None) == "english"
        )

    def test_polish_diacritics_detected(self):
        assert _detect_search_language("wyrok sąd apelacyjny", None, None) == "simple"

    def test_polish_diacritics_odpowiedzialnosc(self):
        assert _detect_search_language("odpowiedzialność karna", None, None) == "simple"

    def test_polish_stopwords_detected(self):
        assert _detect_search_language("wyrok karny sąd", None, None) == "simple"

    def test_explicit_en_language_filter(self):
        assert _detect_search_language("wyrok sąd", ["en"], None) == "english"

    def test_explicit_uk_language_filter(self):
        assert _detect_search_language("coś po polsku", ["uk"], None) == "english"

    def test_explicit_pl_language_filter(self):
        assert _detect_search_language("murder appeal", ["pl"], None) == "simple"

    def test_uk_jurisdiction_filter(self):
        assert _detect_search_language("generic query", None, ["UK"]) == "english"

    def test_pl_jurisdiction_filter(self):
        assert _detect_search_language("generic query", None, ["PL"]) == "simple"

    def test_mixed_jurisdictions_defaults_to_english(self):
        assert _detect_search_language("generic query", None, ["PL", "UK"]) == "english"

    def test_language_filter_takes_priority_over_content(self):
        # Polish text but English language filter should return English
        assert _detect_search_language("odpowiedzialność", ["en"], None) == "english"

    def test_jurisdiction_takes_priority_over_content(self):
        # Polish text but UK jurisdiction should return English
        assert _detect_search_language("odpowiedzialność", None, ["UK"]) == "english"

    def test_single_polish_stopword_not_enough(self):
        # Need at least 2 Polish stopwords to trigger detection
        assert _detect_search_language("jest important", None, None) == "english"

    def test_two_polish_stopwords_trigger_detection(self):
        assert _detect_search_language("nie jest dobrze", None, None) == "simple"

    def test_empty_query_defaults_to_english(self):
        assert _detect_search_language("", None, None) == "english"

    def test_numeric_query_defaults_to_english(self):
        assert _detect_search_language("12345", None, None) == "english"


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
