"""
Unit tests for app.precedents module.

Tests cover:
- Pydantic model validation
- _format_candidate_for_analysis helper
- _apply_filters helper
- _empty_precedents_response helper
- _build_precedent_match helper
- _rank_precedents helper
- _build_search_text helper
"""

from unittest.mock import patch

import pytest
from pydantic import ValidationError

from app.precedents import (
    FindPrecedentsRequest,
    PrecedentFilters,
    PrecedentMatch,
    _apply_filters,
    _build_precedent_match,
    _build_search_text,
    _empty_precedents_response,
    _format_candidate_for_analysis,
    _rank_precedents,
)

# ===== Model Validation Tests =====


@pytest.mark.unit
class TestFindPrecedentsRequestModel:
    """Test FindPrecedentsRequest model."""

    @patch("app.precedents.validate_id_format", side_effect=lambda v, n: v)
    def test_valid_request(self, mock_validate):
        req = FindPrecedentsRequest(query="tax deduction rules for VAT")
        assert req.limit == 10
        assert req.include_analysis is True
        assert req.document_id is None
        assert req.filters is None

    def test_query_too_short(self):
        with pytest.raises((ValueError, ValidationError)):
            FindPrecedentsRequest(query="short")

    def test_query_max_length(self):
        req = FindPrecedentsRequest(query="x" * 5000)
        assert len(req.query) == 5000

    def test_query_too_long(self):
        with pytest.raises((ValueError, ValidationError)):
            FindPrecedentsRequest(query="x" * 5001)

    def test_limit_bounds(self):
        with pytest.raises((ValueError, ValidationError)):
            FindPrecedentsRequest(query="x" * 20, limit=0)
        with pytest.raises((ValueError, ValidationError)):
            FindPrecedentsRequest(query="x" * 20, limit=51)


@pytest.mark.unit
class TestPrecedentFiltersModel:
    """Test PrecedentFilters model."""

    def test_all_none_defaults(self):
        f = PrecedentFilters()
        assert f.document_types is None
        assert f.court_names is None
        assert f.date_from is None
        assert f.date_to is None
        assert f.legal_bases is None
        assert f.outcome is None
        assert f.language is None

    def test_with_filters(self):
        f = PrecedentFilters(
            document_types=["judgment"],
            court_names=["Supreme Court"],
            language="pl",
        )
        assert f.document_types == ["judgment"]


@pytest.mark.unit
class TestPrecedentMatchModel:
    """Test PrecedentMatch model."""

    def test_minimal_match(self):
        m = PrecedentMatch(
            document_id="doc-1",
            similarity_score=0.85,
        )
        assert m.relevance_score is None
        assert m.matching_factors == []
        assert m.relevance_explanation is None

    def test_full_match(self):
        m = PrecedentMatch(
            document_id="doc-1",
            title="Case ABC",
            document_type="judgment",
            date_issued="2024-01-01",
            court_name="Supreme Court",
            outcome="upheld",
            legal_bases=["Art. 123 KC"],
            summary="A case about tax law.",
            similarity_score=0.9,
            relevance_score=0.85,
            matching_factors=["same legal issue"],
            relevance_explanation="Both cases discuss VAT deductions.",
        )
        assert m.similarity_score == 0.9


# ===== _format_candidate_for_analysis Tests =====


@pytest.mark.unit
class TestFormatCandidateForAnalysis:
    """Test _format_candidate_for_analysis helper."""

    def test_minimal_document(self):
        doc = {"document_id": "doc-1"}
        result = _format_candidate_for_analysis(doc)
        assert "--- Document ID: doc-1 ---" in result

    def test_missing_document_id(self):
        result = _format_candidate_for_analysis({})
        assert "unknown" in result

    def test_with_metadata(self):
        doc = {
            "document_id": "doc-1",
            "title": "Tax Case",
            "document_type": "judgment",
            "date_issued": "2024-01-15",
            "court_name": "Supreme Court",
            "outcome": "upheld",
        }
        result = _format_candidate_for_analysis(doc)
        assert "Title: Tax Case" in result
        assert "Type: judgment" in result
        assert "Date: 2024-01-15" in result
        assert "Court: Supreme Court" in result
        assert "Outcome: upheld" in result

    def test_with_legal_bases_list(self):
        doc = {
            "document_id": "doc-1",
            "legal_bases": ["Art. 123", "Art. 456"],
        }
        result = _format_candidate_for_analysis(doc)
        assert "Legal Bases:" in result
        assert "Art. 123" in result

    def test_legal_bases_non_list_ignored(self):
        doc = {
            "document_id": "doc-1",
            "legal_bases": "not a list",
        }
        result = _format_candidate_for_analysis(doc)
        assert "Legal Bases:" not in result

    def test_uses_summary_first(self):
        doc = {
            "document_id": "doc-1",
            "summary": "A short summary",
            "full_text": "Full text here",
        }
        result = _format_candidate_for_analysis(doc)
        assert "A short summary" in result

    def test_uses_thesis_when_no_summary(self):
        doc = {
            "document_id": "doc-1",
            "thesis": "The thesis statement",
        }
        result = _format_candidate_for_analysis(doc)
        assert "The thesis statement" in result

    def test_full_text_truncated_at_3000(self):
        doc = {
            "document_id": "doc-1",
            "full_text": "x" * 5000,
        }
        result = _format_candidate_for_analysis(doc)
        assert "..." in result

    def test_short_full_text_not_truncated(self):
        doc = {
            "document_id": "doc-1",
            "full_text": "Short text",
        }
        result = _format_candidate_for_analysis(doc)
        assert "Short text" in result
        assert "..." not in result


# ===== _apply_filters Tests =====


@pytest.mark.unit
class TestApplyFilters:
    """Test _apply_filters helper."""

    def _make_results(self):
        return [
            {
                "document_id": "doc-1",
                "document_type": "judgment",
                "court_name": "Supreme Court",
                "language": "pl",
                "date_issued": "2024-01-15",
                "legal_bases": ["Art. 123 KC"],
            },
            {
                "document_id": "doc-2",
                "document_type": "judgment",
                "court_name": "Administrative Court",
                "language": "en",
                "date_issued": "2023-06-01",
                "legal_bases": ["Art. 456 KPC"],
            },
            {
                "document_id": "doc-3",
                "document_type": "judgment",
                "court_name": "District Court",
                "language": "pl",
                "date_issued": "2022-03-10",
            },
        ]

    def test_no_filters(self):
        results = self._make_results()
        filters = PrecedentFilters()
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 3

    def test_filter_by_document_type(self):
        results = self._make_results()
        filters = PrecedentFilters(document_types=["judgment"])
        filtered = _apply_filters(results, filters)
        # All fixture rows are judgments now (TI removed); the in-memory
        # document_types filter still exercises the in-list code path.
        assert len(filtered) == 3
        assert all(r["document_type"] == "judgment" for r in filtered)

    def test_filter_by_court_name_case_insensitive(self):
        results = self._make_results()
        filters = PrecedentFilters(court_names=["supreme court"])
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 1
        assert filtered[0]["document_id"] == "doc-1"

    def test_filter_by_language(self):
        results = self._make_results()
        filters = PrecedentFilters(language="en")
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 1
        assert filtered[0]["document_id"] == "doc-2"

    def test_filter_by_date_from(self):
        results = self._make_results()
        filters = PrecedentFilters(date_from="2023-01-01")
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 2

    def test_filter_by_date_to(self):
        results = self._make_results()
        filters = PrecedentFilters(date_to="2023-12-31")
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 2

    def test_filter_by_date_range(self):
        results = self._make_results()
        filters = PrecedentFilters(date_from="2023-01-01", date_to="2023-12-31")
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 1
        assert filtered[0]["document_id"] == "doc-2"

    def test_filter_by_legal_bases(self):
        results = self._make_results()
        filters = PrecedentFilters(legal_bases=["Art. 123 KC"])
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 1
        assert filtered[0]["document_id"] == "doc-1"

    def test_filter_legal_bases_case_insensitive(self):
        results = self._make_results()
        filters = PrecedentFilters(legal_bases=["art. 123 kc"])
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 1

    def test_combined_filters(self):
        results = self._make_results()
        filters = PrecedentFilters(
            document_types=["judgment"],
            language="pl",
        )
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 2

    def test_no_matching_results(self):
        results = self._make_results()
        filters = PrecedentFilters(language="de")
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 0

    def test_missing_court_name_excluded(self):
        results = [{"document_id": "doc-1", "court_name": None}]
        filters = PrecedentFilters(court_names=["Supreme Court"])
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 0

    def test_missing_date_excluded_from_date_filter(self):
        results = [{"document_id": "doc-1"}]
        filters = PrecedentFilters(date_from="2020-01-01")
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 0

    def test_non_list_legal_bases_excluded(self):
        results = [{"document_id": "doc-1", "legal_bases": "not a list"}]
        filters = PrecedentFilters(legal_bases=["Art. 123"])
        filtered = _apply_filters(results, filters)
        assert len(filtered) == 0


# ===== _empty_precedents_response Tests =====


@pytest.mark.unit
class TestEmptyPrecedentsResponse:
    """Test _empty_precedents_response helper."""

    def test_basic_empty_response(self):
        resp = _empty_precedents_response("test query", None)
        assert resp.query == "test query"
        assert resp.precedents == []
        assert resp.total_found == 0
        assert resp.search_strategy == "semantic_similarity"
        assert resp.enhanced_query is None

    def test_with_enhanced_query(self):
        resp = _empty_precedents_response("q", "enhanced q")
        assert resp.enhanced_query == "enhanced q"


# ===== _build_precedent_match Tests =====


@pytest.mark.unit
class TestBuildPrecedentMatch:
    """Test _build_precedent_match helper."""

    def test_without_analysis(self):
        doc = {
            "document_id": "doc-1",
            "title": "Case A",
            "_similarity_score": 0.8765,
        }
        match = _build_precedent_match(doc)
        assert match.document_id == "doc-1"
        assert match.similarity_score == 0.8765
        assert match.relevance_score is None
        assert match.matching_factors == []

    def test_with_analysis(self):
        doc = {
            "document_id": "doc-1",
            "_similarity_score": 0.75,
        }
        analysis = {
            "relevance_score": 0.9,
            "matching_factors": ["same issue", "same statute"],
            "relevance_explanation": "Very relevant.",
        }
        match = _build_precedent_match(doc, analysis)
        assert match.relevance_score == 0.9
        assert len(match.matching_factors) == 2
        assert match.relevance_explanation == "Very relevant."

    def test_date_issued_conversion(self):
        # Non-string date_issued should be converted to string
        from datetime import date

        doc = {
            "document_id": "doc-1",
            "_similarity_score": 0.5,
            "date_issued": date(2024, 1, 15),
        }
        match = _build_precedent_match(doc)
        assert match.date_issued == "2024-01-15"

    def test_string_date_unchanged(self):
        doc = {
            "document_id": "doc-1",
            "_similarity_score": 0.5,
            "date_issued": "2024-01-15",
        }
        match = _build_precedent_match(doc)
        assert match.date_issued == "2024-01-15"

    def test_none_date_stays_none(self):
        doc = {"document_id": "doc-1", "_similarity_score": 0.5}
        match = _build_precedent_match(doc)
        assert match.date_issued is None

    def test_legal_bases_list_preserved(self):
        doc = {
            "document_id": "doc-1",
            "_similarity_score": 0.5,
            "legal_bases": ["Art. 123"],
        }
        match = _build_precedent_match(doc)
        assert match.legal_bases == ["Art. 123"]

    def test_legal_bases_non_list_becomes_none(self):
        doc = {
            "document_id": "doc-1",
            "_similarity_score": 0.5,
            "legal_bases": "not a list",
        }
        match = _build_precedent_match(doc)
        assert match.legal_bases is None

    def test_similarity_score_rounded(self):
        doc = {"document_id": "doc-1", "_similarity_score": 0.123456789}
        match = _build_precedent_match(doc)
        assert match.similarity_score == 0.1235

    def test_relevance_score_rounded(self):
        doc = {"document_id": "doc-1", "_similarity_score": 0.5}
        analysis = {"relevance_score": 0.876543}
        match = _build_precedent_match(doc, analysis)
        assert match.relevance_score == 0.8765


# ===== _rank_precedents Tests =====


@pytest.mark.unit
class TestRankPrecedents:
    """Test _rank_precedents helper."""

    def test_empty_list(self):
        assert _rank_precedents([]) == []

    def test_sorts_by_weighted_score(self):
        p1 = PrecedentMatch(
            document_id="doc-1",
            similarity_score=0.5,
            relevance_score=0.9,
        )
        p2 = PrecedentMatch(
            document_id="doc-2",
            similarity_score=0.9,
            relevance_score=0.5,
        )
        # p1: 0.4*0.5 + 0.6*0.9 = 0.2 + 0.54 = 0.74
        # p2: 0.4*0.9 + 0.6*0.5 = 0.36 + 0.30 = 0.66
        ranked = _rank_precedents([p2, p1])
        assert ranked[0].document_id == "doc-1"

    def test_no_relevance_score_uses_similarity(self):
        p1 = PrecedentMatch(
            document_id="doc-1",
            similarity_score=0.8,
            relevance_score=None,
        )
        # Score: 0.4*0.8 + 0.6*0.8 = 0.32 + 0.48 = 0.80
        ranked = _rank_precedents([p1])
        assert ranked[0].document_id == "doc-1"

    def test_descending_order(self):
        precedents = [
            PrecedentMatch(document_id=f"doc-{i}", similarity_score=i * 0.1)
            for i in range(1, 4)
        ]
        ranked = _rank_precedents(precedents)
        scores = [
            0.4 * p.similarity_score + 0.6 * (p.relevance_score or p.similarity_score)
            for p in ranked
        ]
        assert scores == sorted(scores, reverse=True)


# ===== _build_search_text Tests =====


@pytest.mark.unit
class TestBuildSearchText:
    """Test _build_search_text helper."""

    @pytest.mark.asyncio
    async def test_query_only(self):
        req = FindPrecedentsRequest(query="tax deduction rules for VAT")
        result = await _build_search_text(req)
        assert result == "tax deduction rules for VAT"

    @pytest.mark.asyncio
    @patch("app.precedents.validate_id_format", side_effect=lambda v, n: v)
    @patch("app.precedents._fetch_document_context")
    async def test_with_document_not_found(self, mock_fetch, mock_validate):
        mock_fetch.return_value = None
        req = FindPrecedentsRequest(
            query="tax deduction rules for VAT",
            document_id="doc-1",
        )
        result = await _build_search_text(req)
        assert result == "tax deduction rules for VAT"

    @pytest.mark.asyncio
    @patch("app.precedents.validate_id_format", side_effect=lambda v, n: v)
    @patch("app.precedents._fetch_document_context")
    async def test_with_document_context(self, mock_fetch, mock_validate):
        mock_fetch.return_value = {
            "summary": "A case about VAT deductions in Poland.",
        }
        req = FindPrecedentsRequest(
            query="tax deduction rules for VAT",
            document_id="doc-1",
        )
        result = await _build_search_text(req)
        assert "tax deduction rules for VAT" in result
        assert "Context from document:" in result
        assert "VAT deductions" in result

    @pytest.mark.asyncio
    @patch("app.precedents.validate_id_format", side_effect=lambda v, n: v)
    @patch("app.precedents._fetch_document_context")
    async def test_with_document_no_summary(self, mock_fetch, mock_validate):
        mock_fetch.return_value = {"title": "Case A"}
        req = FindPrecedentsRequest(
            query="tax deduction rules for VAT",
            document_id="doc-1",
        )
        result = await _build_search_text(req)
        # No summary/thesis, so just the query
        assert result == "tax deduction rules for VAT"
