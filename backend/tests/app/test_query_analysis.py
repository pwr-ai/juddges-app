"""Unit tests for query_analysis module.

Tests cover:
- QueryAnalysisResult schema construction
- classify_and_route_query (query type detection and alpha routing)
- _normalize_query_for_keywords (text normalisation)
- _expand_semantic_query (synonym expansion)
- _extract_year_bounds (date range extraction)
- _contains_any_terms (whole-word matching helper)
- _heuristic_query_analysis / analyze_query_heuristic (deterministic fallback)
- analyze_query (LLM-based, mocked)
- analyze_query_with_fallback (LLM with heuristic fallback)
- Edge cases: empty, unicode, very long, special characters
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.query_analysis import (
    QueryAnalysisResult,
    _contains_any_terms,
    _expand_semantic_query,
    _extract_year_bounds,
    _heuristic_query_analysis,
    _normalize_query_for_keywords,
    analyze_query,
    analyze_query_heuristic,
    analyze_query_with_fallback,
    classify_and_route_query,
    create_query_analysis_chain,
)

# ---------------------------------------------------------------------------
# QueryAnalysisResult schema tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestQueryAnalysisResult:
    """Validate Pydantic schema defaults and construction."""

    def test_minimal_construction(self):
        result = QueryAnalysisResult(
            semantic_query="test query",
            keyword_query="test query",
        )
        assert result.semantic_query == "test query"
        assert result.jurisdictions is None
        assert result.court_names is None
        assert result.date_from is None
        assert result.query_type is None

    def test_full_construction(self):
        result = QueryAnalysisResult(
            semantic_query="contract breach damages",
            keyword_query="contract breach",
            jurisdictions=["PL"],
            court_names=["Supreme Court"],
            court_levels=["Supreme Court"],
            case_types=["Civil"],
            decision_types=["Judgment"],
            outcomes=["Dismissed"],
            keywords=["contract"],
            legal_topics=["Civil law"],
            cited_legislation=["Art. 471 kc"],
            date_from="2020-01-01",
            date_to="2023-12-31",
            query_type="conceptual",
        )
        assert result.jurisdictions == ["PL"]
        assert result.date_from == "2020-01-01"
        assert result.query_type == "conceptual"


# ---------------------------------------------------------------------------
# classify_and_route_query tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestClassifyAndRouteQuery:
    """Test query classification into type + recommended alpha."""

    # -- Case numbers --

    def test_polish_case_number(self):
        qtype, alpha = classify_and_route_query("III KK 45/21")
        assert qtype == "case_number"
        assert alpha == pytest.approx(0.1)

    def test_polish_case_number_with_context(self):
        qtype, _ = classify_and_route_query("wyrok III KK 45/21 sąd")
        assert qtype == "case_number"

    def test_polish_case_number_aca(self):
        qtype, _ = classify_and_route_query("I ACa 789/19")
        assert qtype == "case_number"

    def test_uk_neutral_citation(self):
        qtype, alpha = classify_and_route_query("[2020] UKSC 1")
        assert qtype == "case_number"
        assert alpha == pytest.approx(0.1)

    def test_uk_citation_ewca_civ(self):
        qtype, _ = classify_and_route_query("[2019] EWCA Civ 123")
        assert qtype == "case_number"

    # -- Statute references --

    def test_polish_statute_art_kk(self):
        qtype, alpha = classify_and_route_query("art. 148 kk")
        assert qtype == "statute_reference"
        assert alpha == pytest.approx(0.2)

    def test_polish_statute_artykul(self):
        qtype, _ = classify_and_route_query("Artykuł 2 kpc")
        assert qtype == "statute_reference"

    def test_polish_statute_paragraph_symbol(self):
        qtype, _ = classify_and_route_query("§ 5 ust. 1")
        assert qtype == "statute_reference"

    def test_uk_statute_section(self):
        qtype, _ = classify_and_route_query("Section 2 Criminal Justice Act")
        assert qtype == "statute_reference"

    def test_uk_statute_short_section(self):
        qtype, _ = classify_and_route_query("s. 47 PACE")
        assert qtype == "statute_reference"

    # -- Exact phrase --

    def test_exact_phrase_double_quotes(self):
        qtype, alpha = classify_and_route_query('"strict liability"')
        assert qtype == "exact_phrase"
        assert alpha == pytest.approx(0.15)

    def test_exact_phrase_with_spaces(self):
        qtype, _ = classify_and_route_query('"duty of care"')
        assert qtype == "exact_phrase"

    # -- Conceptual (4+ words, no identifiers) --

    def test_conceptual_long_query(self):
        qtype, alpha = classify_and_route_query("duty of care in medical negligence")
        assert qtype == "conceptual"
        assert alpha == pytest.approx(0.8)

    def test_conceptual_four_words(self):
        qtype, _ = classify_and_route_query("breach of contract damages")
        assert qtype == "conceptual"

    # -- Mixed / fallback --

    def test_mixed_short_query(self):
        qtype, alpha = classify_and_route_query("murder")
        assert qtype == "mixed"
        assert alpha == pytest.approx(0.5)

    def test_mixed_two_words(self):
        qtype, _ = classify_and_route_query("tax fraud")
        assert qtype == "mixed"

    def test_mixed_three_words(self):
        qtype, _ = classify_and_route_query("tax fraud Poland")
        assert qtype == "mixed"

    # -- Edge cases --

    def test_empty_query(self):
        qtype, alpha = classify_and_route_query("")
        assert qtype == "mixed"

    def test_whitespace_only(self):
        qtype, _ = classify_and_route_query("   ")
        assert qtype == "mixed"

    def test_special_characters_only(self):
        qtype, _ = classify_and_route_query("!@#$%^&*()")
        assert qtype == "mixed"

    # -- Case-number dominance (bug fix: long paragraph citing a sygnatura
    #    used to be misrouted as case_number → alpha=0.1 → 0 results) --

    def test_long_paragraph_citing_signature_is_not_case_number(self):
        # Real-world query that exposed the bug: ~1100-char paragraph that
        # mentions "II CSK 604/17" inside a legal argument. Should classify
        # as conceptual, not case_number.
        query = (
            "W sprawie niniejszej kluczowe znaczenie ma ocena przesłanek "
            "odpowiedzialności deliktowej pozwanego na gruncie art. 415 k.c. "
            "Zgodnie z wyrokiem z dnia 12 lipca 2018 r., sygn. akt II CSK "
            "604/17, ciężar wykazania bezprawności spoczywa na poszkodowanym, "
            "co w realiach sprawy wymaga dogłębnej analizy materiału dowodowego."
        )
        qtype, _ = classify_and_route_query(query)
        assert qtype != "case_number", (
            f"{len(query)}-char paragraph with a cited sygnatura must not "
            f"be routed as case_number (got {qtype})"
        )

    def test_skarga_kasacyjna_excerpt_is_not_case_number(self):
        # Excerpt with multiple sygnatury: should classify as conceptual.
        query = (
            "Skarżący zaskarża wyrok Sądu Apelacyjnego w Warszawie z dnia "
            "14 lutego 2025 r., sygn. akt I ACa 872/24, zarzucając naruszenie "
            "art. 415 k.c. Podobne stanowisko zajął Sąd Najwyższy w wyroku "
            "II CSK 123/18, gdzie wskazano na konieczność adekwatnego "
            "związku przyczynowego."
        )
        qtype, _ = classify_and_route_query(query)
        assert qtype != "case_number"


# ---------------------------------------------------------------------------
# _normalize_query_for_keywords tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestNormalizeQueryForKeywords:
    """Test lexical normalisation for full-text retrieval."""

    def test_lowercases(self):
        assert _normalize_query_for_keywords("MURDER Appeal") == "murder appeal"

    def test_strips_punctuation(self):
        result = _normalize_query_for_keywords("contract; breach, damages!")
        assert result == "contract breach damages"

    def test_collapses_whitespace(self):
        result = _normalize_query_for_keywords("tax   fraud    case")
        assert result == "tax fraud case"

    def test_empty_input_returns_original(self):
        # After stripping all chars the function returns the original query
        result = _normalize_query_for_keywords("")
        assert result == ""

    def test_all_punctuation_returns_original(self):
        result = _normalize_query_for_keywords("!@#$")
        assert result == "!@#$"

    def test_unicode_polish(self):
        result = _normalize_query_for_keywords("Odpowiedzialność KARNA")
        assert result == "odpowiedzialność karna"

    def test_preserves_digits(self):
        result = _normalize_query_for_keywords("art. 148 kk")
        assert "148" in result
        assert "art" in result
        assert "kk" in result


# ---------------------------------------------------------------------------
# _expand_semantic_query tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestExpandSemanticQuery:
    """Test lightweight synonym expansion."""

    def test_contract_expansion(self):
        result = _expand_semantic_query("contract")
        assert "contract" in result
        assert "agreement" in result

    def test_murder_expansion(self):
        result = _expand_semantic_query("murder case")
        assert "murder" in result
        assert "homicide" in result

    def test_no_expansion_for_unknown_term(self):
        result = _expand_semantic_query("something")
        # Original token should be present; no extra synonyms added
        assert "something" in result

    def test_empty_query(self):
        result = _expand_semantic_query("")
        assert isinstance(result, str)

    def test_max_tokens_capped(self):
        """Output should not exceed 24 tokens."""
        # Use a term with many synonyms
        long_query = "contract breach negligence appeal tax criminal fraud lease"
        result = _expand_semantic_query(long_query)
        assert len(result.split()) <= 24

    def test_unicode_polish_passthrough(self):
        result = _expand_semantic_query("odpowiedzialność")
        assert "odpowiedzialność" in result


# ---------------------------------------------------------------------------
# _extract_year_bounds tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestExtractYearBounds:
    """Test ISO date range extraction from year mentions."""

    def test_single_year(self):
        date_from, date_to = _extract_year_bounds("cases from 2020")
        assert date_from == "2020-01-01"
        assert date_to == "2020-12-31"

    def test_two_years_range(self):
        date_from, date_to = _extract_year_bounds("cases between 2018 and 2022")
        assert date_from == "2018-01-01"
        assert date_to == "2022-12-31"

    def test_multiple_years_uses_min_max(self):
        date_from, date_to = _extract_year_bounds("2015 2019 2021")
        assert date_from == "2015-01-01"
        assert date_to == "2021-12-31"

    def test_no_year(self):
        date_from, date_to = _extract_year_bounds("contract breach damages")
        assert date_from is None
        assert date_to is None

    def test_empty_query(self):
        date_from, date_to = _extract_year_bounds("")
        assert date_from is None
        assert date_to is None

    def test_invalid_year_outside_range(self):
        # Years outside 1900-2199 should be excluded
        date_from, date_to = _extract_year_bounds("year 1800 nonsense")
        assert date_from is None
        assert date_to is None

    def test_year_at_boundary(self):
        date_from, date_to = _extract_year_bounds("1900")
        assert date_from == "1900-01-01"

    def test_year_2199(self):
        date_from, date_to = _extract_year_bounds("2199")
        assert date_from == "2199-01-01"
        assert date_to == "2199-12-31"


# ---------------------------------------------------------------------------
# _contains_any_terms tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestContainsAnyTerms:
    """Test whole-word matching helper."""

    def test_match_found(self):
        assert (
            _contains_any_terms("criminal sentencing guidelines", ("criminal",)) is True
        )

    def test_no_match(self):
        assert _contains_any_terms("contract breach", ("criminal",)) is False

    def test_partial_word_no_match(self):
        # "civil" should not match "civilization"
        assert _contains_any_terms("civilization advances", ("civil",)) is False

    def test_multiple_terms_any_matches(self):
        assert _contains_any_terms("civil law", ("criminal", "civil")) is True

    def test_empty_text(self):
        assert _contains_any_terms("", ("criminal",)) is False

    def test_empty_terms(self):
        assert _contains_any_terms("some text", ()) is False


# ---------------------------------------------------------------------------
# _heuristic_query_analysis / analyze_query_heuristic tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestHeuristicQueryAnalysis:
    """Test deterministic (no-LLM) query analysis."""

    def test_basic_english_query(self):
        result = _heuristic_query_analysis("murder conviction appeal UK court")
        assert result.semantic_query
        assert result.keyword_query
        # "UK" keyword should trigger UK jurisdiction
        assert result.jurisdictions == ["UK"]

    def test_polish_diacritics_detect_pl(self):
        result = _heuristic_query_analysis("odpowiedzialność karna")
        assert result.jurisdictions == ["PL"]

    def test_polish_keyword_detect_pl(self):
        result = _heuristic_query_analysis("polish supreme court decisions")
        assert result.jurisdictions == ["PL"]

    def test_uk_keyword_detect_uk(self):
        result = _heuristic_query_analysis("united kingdom contract law")
        assert result.jurisdictions == ["UK"]

    def test_no_jurisdiction_when_ambiguous(self):
        result = _heuristic_query_analysis("contract breach damages")
        assert result.jurisdictions is None

    def test_criminal_case_type(self):
        result = _heuristic_query_analysis("criminal sentencing guidelines")
        assert result.case_types == ["Criminal"]

    def test_civil_case_type(self):
        result = _heuristic_query_analysis("civil liability for damages")
        assert result.case_types == ["Civil"]

    def test_administrative_case_type(self):
        result = _heuristic_query_analysis("administrative decision review")
        assert result.case_types == ["Administrative"]

    def test_no_case_type_for_generic(self):
        result = _heuristic_query_analysis("contract breach")
        assert result.case_types is None

    def test_supreme_court_level(self):
        result = _heuristic_query_analysis("supreme court ruling")
        assert result.court_levels == ["Supreme Court"]

    def test_appeal_court_level(self):
        result = _heuristic_query_analysis("appeal court judgment")
        assert result.court_levels == ["Appeal Court"]

    def test_high_court_level(self):
        result = _heuristic_query_analysis("high court decision")
        assert result.court_levels == ["High Court"]

    def test_year_extraction(self):
        result = _heuristic_query_analysis("tax fraud cases from 2020")
        assert result.date_from == "2020-01-01"
        assert result.date_to == "2020-12-31"

    def test_year_range_extraction(self):
        result = _heuristic_query_analysis("cases between 2018 and 2022")
        assert result.date_from == "2018-01-01"
        assert result.date_to == "2022-12-31"

    def test_query_type_set(self):
        result = _heuristic_query_analysis("III KK 45/21")
        assert result.query_type == "case_number"

    def test_empty_query(self):
        result = _heuristic_query_analysis("")
        assert result.semantic_query is not None
        assert result.keyword_query is not None

    def test_unicode_special_chars(self):
        result = _heuristic_query_analysis("§ 148 kk odpowiedzialność")
        assert result.jurisdictions == ["PL"]  # Polish diacritics
        assert result.query_type == "statute_reference"

    def test_very_long_query(self):
        long_query = "contract " * 200
        result = _heuristic_query_analysis(long_query)
        assert result.semantic_query is not None
        # Semantic expansion should cap at 24 tokens
        assert len(result.semantic_query.split()) <= 24

    def test_public_helper_matches(self):
        """analyze_query_heuristic should produce the same result as _heuristic_query_analysis."""
        q = "criminal sentencing UK 2020"
        internal = _heuristic_query_analysis(q)
        public = analyze_query_heuristic(q)
        assert internal == public


# ---------------------------------------------------------------------------
# analyze_query (LLM-based, mocked) tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestAnalyzeQuery:
    """Test LLM-based query analysis with mocked chain invocation."""

    async def test_analyze_query_returns_result(self):
        fake_result = QueryAnalysisResult(
            semantic_query="expanded contract breach",
            keyword_query="contract breach",
            jurisdictions=["UK"],
        )
        mock_chain = AsyncMock()
        mock_chain.ainvoke = AsyncMock(return_value=fake_result)

        with patch(
            "app.query_analysis.create_query_analysis_chain", return_value=mock_chain
        ):
            result = await analyze_query("contract breach")
            assert result.semantic_query == "expanded contract breach"
            assert result.jurisdictions == ["UK"]
            mock_chain.ainvoke.assert_awaited_once_with({"query": "contract breach"})

    async def test_analyze_query_fallback_on_empty_semantic(self):
        """If LLM returns empty semantic_query, it should fall back to original query."""
        fake_result = QueryAnalysisResult(
            semantic_query="",
            keyword_query="test",
        )
        mock_chain = AsyncMock()
        mock_chain.ainvoke = AsyncMock(return_value=fake_result)

        with patch(
            "app.query_analysis.create_query_analysis_chain", return_value=mock_chain
        ):
            result = await analyze_query("original query")
            assert result.semantic_query == "original query"

    async def test_analyze_query_fallback_on_empty_keyword(self):
        """If LLM returns empty keyword_query, it should fall back to original query."""
        fake_result = QueryAnalysisResult(
            semantic_query="expanded",
            keyword_query="",
        )
        mock_chain = AsyncMock()
        mock_chain.ainvoke = AsyncMock(return_value=fake_result)

        with patch(
            "app.query_analysis.create_query_analysis_chain", return_value=mock_chain
        ):
            result = await analyze_query("original query")
            assert result.keyword_query == "original query"

    async def test_analyze_query_uses_provided_llm(self):
        """When llm argument is provided it should be passed to the chain factory."""
        fake_llm = MagicMock()
        fake_result = QueryAnalysisResult(semantic_query="test", keyword_query="test")
        mock_chain = AsyncMock()
        mock_chain.ainvoke = AsyncMock(return_value=fake_result)

        with patch(
            "app.query_analysis.create_query_analysis_chain", return_value=mock_chain
        ) as mock_create:
            await analyze_query("test", llm=fake_llm)
            mock_create.assert_called_once_with(fake_llm)


# ---------------------------------------------------------------------------
# analyze_query_with_fallback tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestAnalyzeQueryWithFallback:
    """Test combined LLM + heuristic fallback path."""

    async def test_llm_success(self):
        fake_result = QueryAnalysisResult(
            semantic_query="expanded", keyword_query="original"
        )
        with patch(
            "app.query_analysis.analyze_query",
            new_callable=AsyncMock,
            return_value=fake_result,
        ):
            result, source, error = await analyze_query_with_fallback("test query")
            assert source == "llm"
            assert error is None
            assert result.semantic_query == "expanded"

    async def test_llm_failure_falls_back_to_heuristic(self):
        with patch(
            "app.query_analysis.analyze_query",
            new_callable=AsyncMock,
            side_effect=Exception("OpenAI rate limit"),
        ):
            result, source, error = await analyze_query_with_fallback(
                "criminal sentencing UK"
            )
            assert source == "heuristic"
            assert error is not None
            assert "rate limit" in error.lower()
            # Heuristic should still produce reasonable output
            assert result.semantic_query
            assert result.jurisdictions == ["UK"]

    async def test_fallback_preserves_heuristic_fields(self):
        with patch(
            "app.query_analysis.analyze_query",
            new_callable=AsyncMock,
            side_effect=RuntimeError("timeout"),
        ):
            result, source, _ = await analyze_query_with_fallback(
                "supreme court 2022 criminal"
            )
            assert source == "heuristic"
            assert result.court_levels == ["Supreme Court"]
            assert result.case_types == ["Criminal"]
            assert result.date_from == "2022-01-01"


# ---------------------------------------------------------------------------
# create_query_analysis_chain tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCreateQueryAnalysisChain:
    """Test chain factory construction."""

    def test_creates_chain_with_default_llm(self):
        with patch("app.query_analysis.ChatOpenAI") as mock_cls:
            mock_instance = MagicMock()
            mock_instance.with_structured_output = MagicMock(return_value=MagicMock())
            mock_cls.return_value = mock_instance

            chain = create_query_analysis_chain()
            assert chain is not None
            mock_cls.assert_called_once_with(
                model="gpt-5-mini", temperature=0.1, max_tokens=500
            )

    def test_creates_chain_with_provided_llm(self):
        fake_llm = MagicMock()
        fake_llm.with_structured_output = MagicMock(return_value=MagicMock())

        chain = create_query_analysis_chain(llm=fake_llm)
        assert chain is not None
        fake_llm.with_structured_output.assert_called_once_with(QueryAnalysisResult)
