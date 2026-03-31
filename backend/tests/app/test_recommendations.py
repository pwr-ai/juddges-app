"""
Unit tests for app.recommendations module.

Tests cover:
- Pydantic model validation
- _truncate helper
- _content_reason helper
- _resolve_effective_strategy helper
- _merge_unique_recommendations helper
- _embedding_source_text helper
- _build_recommendation_item helper
- _weighted_documents_from_interactions helper
- INTERACTION_WEIGHTS constants
"""

import pytest
from pydantic import ValidationError

from app.recommendations import (
    INTERACTION_WEIGHTS,
    RecommendationItem,
    RecommendationsResponse,
    TrackInteractionRequest,
    _build_recommendation_item,
    _content_reason,
    _embedding_source_text,
    _merge_unique_recommendations,
    _resolve_effective_strategy,
    _truncate,
    _weighted_documents_from_interactions,
)

# ===== Model Validation Tests =====


@pytest.mark.unit
class TestRecommendationItemModel:
    """Test RecommendationItem Pydantic model."""

    def test_valid_item(self):
        item = RecommendationItem(
            document_id="doc-1",
            score=0.9,
            reason="Similar content",
        )
        assert item.document_id == "doc-1"
        assert item.title is None
        assert item.score == 0.9

    def test_all_optional_fields(self):
        item = RecommendationItem(
            document_id="doc-1",
            title="Test Title",
            document_type="judgment",
            date_issued="2024-01-01",
            document_number="I CSK 123",
            court_name="Supreme Court",
            language="pl",
            summary="A legal case.",
            score=0.75,
            reason="Matching content",
        )
        assert item.court_name == "Supreme Court"
        assert item.language == "pl"


@pytest.mark.unit
class TestRecommendationsResponseModel:
    """Test RecommendationsResponse model."""

    def test_valid_response(self):
        resp = RecommendationsResponse(
            recommendations=[],
            strategy="content_based",
            total_found=0,
        )
        assert resp.strategy == "content_based"
        assert resp.total_found == 0


@pytest.mark.unit
class TestTrackInteractionRequestModel:
    """Test TrackInteractionRequest model."""

    def test_valid_interaction_types(self):
        valid_types = [
            "view",
            "search_click",
            "bookmark",
            "chat_reference",
            "feedback_positive",
            "feedback_negative",
        ]
        for itype in valid_types:
            req = TrackInteractionRequest(
                document_id="doc-1",
                interaction_type=itype,
            )
            assert req.interaction_type == itype

    def test_invalid_interaction_type(self):
        with pytest.raises((ValueError, ValidationError)):
            TrackInteractionRequest(
                document_id="doc-1",
                interaction_type="invalid",
            )

    def test_optional_context(self):
        req = TrackInteractionRequest(
            document_id="doc-1",
            interaction_type="view",
            context={"search_query": "tax law"},
        )
        assert req.context == {"search_query": "tax law"}


# ===== _truncate Tests =====


@pytest.mark.unit
class TestTruncate:
    """Test _truncate helper function."""

    def test_none_returns_none(self):
        assert _truncate(None, 100) is None

    def test_empty_string_returns_none(self):
        assert _truncate("", 100) is None

    def test_short_string_unchanged(self):
        assert _truncate("hello", 10) == "hello"

    def test_exact_length_unchanged(self):
        assert _truncate("hello", 5) == "hello"

    def test_long_string_truncated_with_ellipsis(self):
        result = _truncate("hello world", 8)
        assert result == "hello..."
        assert len(result) == 8

    def test_truncation_at_boundary(self):
        result = _truncate("abcdefgh", 6)
        assert result == "abc..."
        assert len(result) == 6


# ===== _content_reason Tests =====


@pytest.mark.unit
class TestContentReason:
    """Test _content_reason helper function."""

    def test_high_similarity_with_document(self):
        result = _content_reason(0.85, "doc-1", None)
        assert "Highly similar" in result

    def test_medium_similarity_with_document(self):
        result = _content_reason(0.65, "doc-1", None)
        assert "Similar content" in result

    def test_low_similarity_with_document(self):
        result = _content_reason(0.4, "doc-1", None)
        assert "Related to the document" in result

    def test_high_similarity_with_query(self):
        result = _content_reason(0.85, None, "tax law")
        assert "Closely matches" in result

    def test_medium_similarity_with_query(self):
        result = _content_reason(0.65, None, "tax law")
        assert "Related to your search" in result

    def test_low_similarity_with_query(self):
        result = _content_reason(0.4, None, "tax law")
        assert "May be relevant" in result

    def test_no_document_no_query(self):
        result = _content_reason(0.5, None, None)
        assert result == "Recommended for you"

    def test_document_takes_precedence_over_query(self):
        # When both document_id and query are provided, document_id logic runs
        result = _content_reason(0.85, "doc-1", "some query")
        assert "document" in result.lower()


# ===== _resolve_effective_strategy Tests =====


@pytest.mark.unit
class TestResolveEffectiveStrategy:
    """Test _resolve_effective_strategy helper."""

    def test_non_auto_passthrough(self):
        assert (
            _resolve_effective_strategy("content_based", None, None, None)
            == "content_based"
        )
        assert (
            _resolve_effective_strategy("history_based", None, None, None)
            == "history_based"
        )
        assert _resolve_effective_strategy("hybrid", None, None, None) == "hybrid"

    def test_auto_with_document_id(self):
        result = _resolve_effective_strategy("auto", None, None, "doc-1")
        assert result == "content_based"

    def test_auto_with_query(self):
        result = _resolve_effective_strategy("auto", None, "tax law", None)
        assert result == "content_based"

    def test_auto_with_user_id_only(self):
        result = _resolve_effective_strategy("auto", "user-1", None, None)
        assert result == "hybrid"

    def test_auto_no_context(self):
        result = _resolve_effective_strategy("auto", None, None, None)
        assert result == "content_based"

    def test_auto_user_and_query_prefers_content(self):
        # document_id or query takes precedence over user_id
        result = _resolve_effective_strategy("auto", "user-1", "query", None)
        assert result == "content_based"


# ===== _merge_unique_recommendations Tests =====


@pytest.mark.unit
class TestMergeUniqueRecommendations:
    """Test _merge_unique_recommendations helper."""

    def test_empty_lists(self):
        result = _merge_unique_recommendations([], [])
        assert result == []

    def test_no_duplicates(self):
        base = [
            RecommendationItem(document_id="doc-1", score=0.9, reason="r"),
        ]
        extra = [
            RecommendationItem(document_id="doc-2", score=0.8, reason="r"),
        ]
        result = _merge_unique_recommendations(base, extra)
        assert len(result) == 2

    def test_duplicates_removed(self):
        base = [
            RecommendationItem(document_id="doc-1", score=0.9, reason="r"),
        ]
        extra = [
            RecommendationItem(document_id="doc-1", score=0.7, reason="different"),
            RecommendationItem(document_id="doc-2", score=0.8, reason="r"),
        ]
        result = _merge_unique_recommendations(base, extra)
        assert len(result) == 2
        # First occurrence (base) preserved
        assert result[0].score == 0.9

    def test_preserves_order(self):
        base = [
            RecommendationItem(document_id="a", score=0.5, reason="r"),
            RecommendationItem(document_id="b", score=0.5, reason="r"),
        ]
        extra = [
            RecommendationItem(document_id="c", score=0.5, reason="r"),
        ]
        result = _merge_unique_recommendations(base, extra)
        ids = [r.document_id for r in result]
        assert ids == ["a", "b", "c"]


# ===== _embedding_source_text Tests =====


@pytest.mark.unit
class TestEmbeddingSourceText:
    """Test _embedding_source_text helper."""

    def test_none_input(self):
        assert _embedding_source_text(None) is None

    def test_empty_dict(self):
        assert _embedding_source_text({}) is None

    def test_prefers_summary(self):
        doc = {"summary": "A summary", "title": "A title", "full_text": "Full text"}
        assert _embedding_source_text(doc) == "A summary"

    def test_falls_back_to_title(self):
        doc = {"title": "A title", "full_text": "Full text"}
        assert _embedding_source_text(doc) == "A title"

    def test_falls_back_to_full_text_truncated(self):
        long_text = "x" * 3000
        doc = {"full_text": long_text}
        result = _embedding_source_text(doc)
        assert len(result) == 2000

    def test_empty_summary_falls_to_title(self):
        doc = {"summary": "", "title": "Title"}
        assert _embedding_source_text(doc) == "Title"

    def test_all_empty_returns_empty_string(self):
        # full_text[:2000] of "" is ""
        doc = {"summary": "", "title": "", "full_text": ""}
        result = _embedding_source_text(doc)
        # "" is falsy so "or" chain continues, full_text[:2000] is ""
        assert result == ""


# ===== _build_recommendation_item Tests =====


@pytest.mark.unit
class TestBuildRecommendationItem:
    """Test _build_recommendation_item helper."""

    def test_basic_conversion(self):
        result_dict = {
            "document_id": "doc-1",
            "title": "Test",
            "document_type": "judgment",
            "date_issued": "2024-01-01",
            "document_number": "I CSK 123",
            "court_name": "Supreme Court",
            "language": "pl",
            "summary": "A summary",
        }
        item = _build_recommendation_item(result_dict, 0.856, "Good match")
        assert item.document_id == "doc-1"
        assert item.score == 0.856
        assert item.reason == "Good match"
        assert item.court_name == "Supreme Court"

    def test_missing_fields_default_to_none(self):
        item = _build_recommendation_item({}, 0.5, "test")
        assert item.document_id == ""
        assert item.title is None

    def test_score_rounded(self):
        item = _build_recommendation_item({"document_id": "x"}, 0.12345, "r")
        assert item.score == 0.123

    def test_summary_truncated(self):
        long_summary = "x" * 300
        item = _build_recommendation_item(
            {"document_id": "x", "summary": long_summary}, 0.5, "r"
        )
        assert len(item.summary) == 200


# ===== _weighted_documents_from_interactions Tests =====


@pytest.mark.unit
class TestWeightedDocumentsFromInteractions:
    """Test _weighted_documents_from_interactions helper."""

    def test_empty_interactions(self):
        result = _weighted_documents_from_interactions([])
        assert result == []

    def test_single_interaction(self):
        interactions = [{"document_id": "doc-1", "interaction_type": "view"}]
        result = _weighted_documents_from_interactions(interactions)
        assert len(result) == 1
        assert result[0] == ("doc-1", INTERACTION_WEIGHTS["view"])

    def test_multiple_interactions_same_doc(self):
        interactions = [
            {"document_id": "doc-1", "interaction_type": "view"},
            {"document_id": "doc-1", "interaction_type": "bookmark"},
        ]
        result = _weighted_documents_from_interactions(interactions)
        assert len(result) == 1
        expected_weight = INTERACTION_WEIGHTS["view"] + INTERACTION_WEIGHTS["bookmark"]
        assert result[0] == ("doc-1", expected_weight)

    def test_sorted_by_weight_descending(self):
        interactions = [
            {"document_id": "doc-1", "interaction_type": "view"},  # 1.0
            {"document_id": "doc-2", "interaction_type": "feedback_positive"},  # 4.0
        ]
        result = _weighted_documents_from_interactions(interactions)
        assert result[0][0] == "doc-2"
        assert result[1][0] == "doc-1"

    def test_negative_feedback_reduces_weight(self):
        interactions = [
            {"document_id": "doc-1", "interaction_type": "feedback_positive"},  # 4.0
            {"document_id": "doc-1", "interaction_type": "feedback_negative"},  # -2.0
        ]
        result = _weighted_documents_from_interactions(interactions)
        assert result[0][1] == 2.0

    def test_skips_entries_without_document_id(self):
        interactions = [
            {"interaction_type": "view"},
            {"document_id": None, "interaction_type": "view"},
            {"document_id": "doc-1", "interaction_type": "view"},
        ]
        result = _weighted_documents_from_interactions(interactions)
        assert len(result) == 1

    def test_unknown_interaction_type_defaults_to_1(self):
        interactions = [
            {"document_id": "doc-1", "interaction_type": "unknown_type"},
        ]
        result = _weighted_documents_from_interactions(interactions)
        assert result[0][1] == 1.0


# ===== INTERACTION_WEIGHTS Constants Tests =====


@pytest.mark.unit
class TestInteractionWeights:
    """Verify INTERACTION_WEIGHTS constant values."""

    def test_all_expected_types_present(self):
        expected_types = [
            "view",
            "search_click",
            "bookmark",
            "chat_reference",
            "feedback_positive",
            "feedback_negative",
        ]
        for itype in expected_types:
            assert itype in INTERACTION_WEIGHTS

    def test_negative_feedback_is_negative(self):
        assert INTERACTION_WEIGHTS["feedback_negative"] < 0

    def test_positive_feedback_is_highest(self):
        positive_types = [k for k in INTERACTION_WEIGHTS if k != "feedback_negative"]
        for t in positive_types:
            assert INTERACTION_WEIGHTS["feedback_positive"] >= INTERACTION_WEIGHTS[t]
