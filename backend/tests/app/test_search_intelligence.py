"""Unit tests for app.search_intelligence — ranking, scoring, and keyword extraction."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.search_intelligence import (
    AuthoritySignals,
    DocumentPreview,
    IntelligentRanker,
    RelevanceReason,
    SearchResultEnhanced,
    extract_keywords_from_query,
    highlight_text_excerpt,
)

# ============================================================================
# Pydantic Models
# ============================================================================


@pytest.mark.unit
class TestAuthoritySignals:
    def test_defaults(self):
        sig = AuthoritySignals()
        assert sig.court_level is None
        assert sig.court_level_score == 0.5
        assert sig.citation_count is None
        assert sig.citation_score == 0.0
        assert sig.recency_score == 0.5

    def test_custom_values(self):
        sig = AuthoritySignals(
            court_level="Supreme Court",
            court_level_score=1.0,
            citation_count=23,
            citation_score=0.8,
            recency_score=0.9,
            document_year=2024,
            precedent_strength="Binding",
        )
        assert sig.court_level == "Supreme Court"
        assert sig.document_year == 2024

    def test_score_bounds(self):
        with pytest.raises(ValidationError):
            AuthoritySignals(court_level_score=1.5)
        with pytest.raises(ValidationError):
            AuthoritySignals(court_level_score=-0.1)


@pytest.mark.unit
class TestRelevanceReason:
    def test_valid_creation(self):
        reason = RelevanceReason(
            factor="semantic_match",
            weight=0.4,
            score=0.85,
            explanation="Strong match",
        )
        assert reason.factor == "semantic_match"
        assert reason.matched_content is None

    def test_with_matched_content(self):
        reason = RelevanceReason(
            factor="keyword_match",
            weight=0.2,
            score=0.6,
            explanation="Keywords found",
            matched_content=["VAT", "podatek"],
        )
        assert reason.matched_content == ["VAT", "podatek"]


@pytest.mark.unit
class TestDocumentPreview:
    def test_minimal(self):
        preview = DocumentPreview(summary="Short summary of the case.")
        assert preview.key_facts is None
        assert preview.holding is None

    def test_full(self):
        preview = DocumentPreview(
            summary="Case about contract breach.",
            key_facts=["Breach occurred", "Damages awarded"],
            holding="Defendant liable",
        )
        assert len(preview.key_facts) == 2


@pytest.mark.unit
class TestSearchResultEnhanced:
    def test_valid_creation(self):
        result = SearchResultEnhanced(
            document_id="doc-123",
            relevance_score=85.0,
            confidence="high",
            rank_position=1,
            explanations=[
                RelevanceReason(
                    factor="semantic_match",
                    weight=0.4,
                    score=0.9,
                    explanation="Very strong match",
                )
            ],
            authority_signals=AuthoritySignals(),
        )
        assert result.document_id == "doc-123"
        assert result.confidence == "high"

    def test_invalid_confidence_value(self):
        with pytest.raises(ValidationError):
            SearchResultEnhanced(
                document_id="doc-1",
                relevance_score=50.0,
                confidence="very_high",  # not a valid literal
                rank_position=1,
                explanations=[],
                authority_signals=AuthoritySignals(),
            )


# ============================================================================
# Court Level Score
# ============================================================================


@pytest.mark.unit
class TestCalculateCourtLevelScore:
    @pytest.mark.parametrize(
        "court, expected",
        [
            ("Supreme Court", 1.0),
            ("Constitutional Tribunal", 1.0),
            ("Appellate Court", 0.8),
            ("Regional Court in Warsaw", 0.6),
            ("District Court", 0.4),
            ("Local Court", 0.3),
            ("Administrative Court", 0.7),
        ],
    )
    def test_known_court_levels(self, court, expected):
        assert IntelligentRanker.calculate_court_level_score(court) == expected

    def test_unknown_court_returns_default(self):
        assert IntelligentRanker.calculate_court_level_score("Special Tribunal") == 0.5

    def test_none_court_returns_default(self):
        assert IntelligentRanker.calculate_court_level_score(None) == 0.5

    def test_case_insensitive(self):
        assert IntelligentRanker.calculate_court_level_score("SUPREME COURT") == 1.0
        assert IntelligentRanker.calculate_court_level_score("supreme court") == 1.0


# ============================================================================
# Recency Score
# ============================================================================


@pytest.mark.unit
class TestCalculateRecencyScore:
    def test_none_year_returns_low_score(self):
        assert IntelligentRanker.calculate_recency_score(None) == 0.3

    def test_current_year_returns_1(self):
        assert IntelligentRanker.calculate_recency_score(2026, current_year=2026) == 1.0

    def test_future_year_returns_1(self):
        assert IntelligentRanker.calculate_recency_score(2028, current_year=2026) == 1.0

    def test_one_year_old_returns_0_9(self):
        assert IntelligentRanker.calculate_recency_score(2025, current_year=2026) == 0.9

    def test_two_years_old_returns_0_9(self):
        assert IntelligentRanker.calculate_recency_score(2024, current_year=2026) == 0.9

    def test_four_years_old_returns_0_7(self):
        assert IntelligentRanker.calculate_recency_score(2022, current_year=2026) == 0.7

    def test_eight_years_old_returns_0_4(self):
        assert IntelligentRanker.calculate_recency_score(2018, current_year=2026) == 0.4

    def test_very_old_document_approaches_zero(self):
        score = IntelligentRanker.calculate_recency_score(1950, current_year=2026)
        assert score >= 0.1  # minimum floor
        assert score < 0.3

    def test_monotonically_decreasing(self):
        """More recent documents should have higher scores."""
        scores = [
            IntelligentRanker.calculate_recency_score(y, current_year=2026)
            for y in [2026, 2024, 2021, 2016, 2000]
        ]
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1]


# ============================================================================
# Citation Score
# ============================================================================


@pytest.mark.unit
class TestCalculateCitationScore:
    def test_none_returns_zero(self):
        assert IntelligentRanker.calculate_citation_score(None) == 0.0

    def test_zero_returns_zero(self):
        assert IntelligentRanker.calculate_citation_score(0) == 0.0

    def test_negative_returns_zero(self):
        assert IntelligentRanker.calculate_citation_score(-5) == 0.0

    def test_one_citation(self):
        score = IntelligentRanker.calculate_citation_score(1)
        assert 0 < score < 0.5

    def test_many_citations(self):
        score = IntelligentRanker.calculate_citation_score(100)
        assert score == pytest.approx(1.0, abs=0.01)

    def test_score_capped_at_1(self):
        score = IntelligentRanker.calculate_citation_score(500, max_citations=100)
        assert score <= 1.0

    def test_logarithmic_scale(self):
        """Citation score should grow sub-linearly."""
        s10 = IntelligentRanker.calculate_citation_score(10)
        s50 = IntelligentRanker.calculate_citation_score(50)
        # 5x more citations should give less than 5x more score
        ratio = s50 / s10 if s10 > 0 else float("inf")
        assert ratio < 5.0


# ============================================================================
# Combined Score
# ============================================================================


@pytest.mark.unit
class TestCalculateCombinedScore:
    def test_returns_tuple_of_score_and_reasons(self):
        score, reasons = IntelligentRanker.calculate_combined_score(
            semantic_similarity=0.8,
            keyword_match=0.6,
            court="Supreme Court",
            year=2024,
            citation_count=10,
            document_type="judgment",
        )
        assert isinstance(score, float)
        assert 0 <= score <= 100
        assert len(reasons) == 5  # 5 factor types

    def test_all_perfect_scores_near_100(self):
        score, _ = IntelligentRanker.calculate_combined_score(
            semantic_similarity=1.0,
            keyword_match=1.0,
            court="Supreme Court",
            year=2026,
            citation_count=100,
            document_type="judgment",
        )
        assert score > 80

    def test_all_zero_scores_near_zero(self):
        score, _ = IntelligentRanker.calculate_combined_score(
            semantic_similarity=0.0,
            keyword_match=0.0,
            court=None,
            year=None,
            citation_count=None,
            document_type=None,
        )
        assert score < 30

    def test_reasons_have_correct_factors(self):
        _, reasons = IntelligentRanker.calculate_combined_score(
            semantic_similarity=0.5,
            keyword_match=0.5,
            court="Regional Court",
            year=2020,
            citation_count=5,
            document_type="judgment",
        )
        factors = {r.factor for r in reasons}
        assert factors == {
            "semantic_match",
            "keyword_match",
            "authority",
            "recency",
            "document_type",
        }

    def test_weights_sum_to_one(self):
        total = (
            IntelligentRanker.WEIGHT_SEMANTIC
            + IntelligentRanker.WEIGHT_KEYWORD
            + IntelligentRanker.WEIGHT_AUTHORITY
            + IntelligentRanker.WEIGHT_RECENCY
            + IntelligentRanker.WEIGHT_TYPE
        )
        assert total == pytest.approx(1.0)

    def test_semantic_weight_has_most_influence(self):
        """Semantic similarity should have the highest weight."""
        assert IntelligentRanker.WEIGHT_SEMANTIC > IntelligentRanker.WEIGHT_KEYWORD
        assert IntelligentRanker.WEIGHT_SEMANTIC > IntelligentRanker.WEIGHT_AUTHORITY


# ============================================================================
# Explanation Methods
# ============================================================================


@pytest.mark.unit
class TestExplanationMethods:
    @pytest.mark.parametrize(
        "score, expected_substring",
        [
            (0.9, "Very strong"),
            (0.7, "Good semantic"),
            (0.5, "Moderate"),
            (0.2, "Weak"),
        ],
    )
    def test_explain_semantic(self, score, expected_substring):
        result = IntelligentRanker._explain_semantic(score)
        assert expected_substring in result

    @pytest.mark.parametrize(
        "score, expected_substring",
        [
            (0.9, "many exact keyword"),
            (0.7, "Good keyword"),
            (0.5, "Some keyword"),
            (0.2, "Few direct"),
        ],
    )
    def test_explain_keywords(self, score, expected_substring):
        result = IntelligentRanker._explain_keywords(score)
        assert expected_substring in result

    def test_explain_authority_supreme_court(self):
        result = IntelligentRanker._explain_authority("Supreme Court", 25)
        assert "Binding" in result
        assert "25" in result

    def test_explain_authority_no_court_no_citations(self):
        result = IntelligentRanker._explain_authority(None, None)
        assert result == "Standard authority level"

    def test_explain_authority_low_citations(self):
        result = IntelligentRanker._explain_authority(None, 3)
        assert "3 time(s)" in result

    def test_explain_recency_no_year(self):
        result = IntelligentRanker._explain_recency(None)
        assert result == "Date unknown"

    def test_explain_recency_recent(self):
        result = IntelligentRanker._explain_recency(2026)
        assert "2026" in result

    def test_explain_type_known(self):
        result = IntelligentRanker._explain_type("judgment")
        assert "Court judgment" in result

    def test_explain_type_unknown(self):
        result = IntelligentRanker._explain_type("alien_document")
        assert "alien_document" in result

    def test_explain_type_none(self):
        result = IntelligentRanker._explain_type(None)
        assert "unknown" in result


# ============================================================================
# Confidence Level
# ============================================================================


@pytest.mark.unit
class TestDetermineConfidence:
    def test_high_confidence(self):
        assert IntelligentRanker.determine_confidence(80) == "high"
        assert IntelligentRanker.determine_confidence(70) == "high"

    def test_medium_confidence(self):
        assert IntelligentRanker.determine_confidence(50) == "medium"
        assert IntelligentRanker.determine_confidence(40) == "medium"

    def test_low_confidence(self):
        assert IntelligentRanker.determine_confidence(30) == "low"
        assert IntelligentRanker.determine_confidence(0) == "low"

    def test_boundary_values(self):
        assert IntelligentRanker.determine_confidence(70) == "high"
        assert IntelligentRanker.determine_confidence(69.9) == "medium"
        assert IntelligentRanker.determine_confidence(40) == "medium"
        assert IntelligentRanker.determine_confidence(39.9) == "low"


# ============================================================================
# Keyword Extraction
# ============================================================================


@pytest.mark.unit
class TestExtractKeywordsFromQuery:
    def test_basic_extraction(self):
        keywords = extract_keywords_from_query("contract law precedents in court")
        assert "contract" in keywords
        assert "precedents" in keywords
        assert "court" in keywords

    def test_filters_short_words(self):
        keywords = extract_keywords_from_query("is a to the")
        assert keywords == []  # all 3 chars or less

    def test_filters_polish_stop_words(self):
        keywords = extract_keywords_from_query("jest oraz może będzie")
        assert keywords == []

    def test_removes_punctuation(self):
        keywords = extract_keywords_from_query("contract, law; precedents! court?")
        assert "contract" in keywords

    def test_limits_to_10_keywords(self):
        long_query = " ".join([f"keyword{i}word" for i in range(20)])
        keywords = extract_keywords_from_query(long_query)
        assert len(keywords) <= 10

    def test_lowercases_keywords(self):
        keywords = extract_keywords_from_query("CONTRACT LAW PRECEDENT")
        for kw in keywords:
            assert kw == kw.lower()

    def test_empty_query(self):
        assert extract_keywords_from_query("") == []


# ============================================================================
# Highlight Text Excerpt
# ============================================================================


@pytest.mark.unit
class TestHighlightTextExcerpt:
    def test_finds_keyword_in_text(self):
        text = "The supreme court decided that the contract was valid."
        excerpt = highlight_text_excerpt(text, ["contract"])
        assert "contract" in excerpt.lower()

    def test_returns_beginning_when_no_keywords_match(self):
        text = "A long legal document about various topics."
        excerpt = highlight_text_excerpt(text, ["nonexistent"])
        assert text[:20] in excerpt

    def test_adds_ellipsis_when_truncated(self):
        text = "x" * 500
        excerpt = highlight_text_excerpt(text, ["nonexistent"], max_length=100)
        assert excerpt.endswith("...")

    def test_no_ellipsis_for_short_text(self):
        text = "Short text"
        excerpt = highlight_text_excerpt(text, ["nonexistent"], max_length=200)
        assert not excerpt.endswith("...")

    def test_case_insensitive_keyword_search(self):
        text = "The SUPREME COURT issued a ruling."
        excerpt = highlight_text_excerpt(text, ["supreme"])
        assert "SUPREME" in excerpt

    def test_context_window_around_keyword(self):
        prefix = "A" * 200
        text = prefix + " contract " + "B" * 200
        excerpt = highlight_text_excerpt(text, ["contract"], max_length=200)
        assert "contract" in excerpt.lower()
        # Should start with ellipsis since keyword is not at the start
        assert excerpt.startswith("...")

    def test_empty_keywords_list(self):
        text = "Some legal text."
        excerpt = highlight_text_excerpt(text, [])
        assert excerpt.startswith("Some legal text")
