"""
Unit tests for app.timeline_extraction module.

Tests cover:
- Pydantic model validation (request/response models)
- field_validator behavior
- _format_document_for_timeline helper
- TimelineExtractionRequest validation
"""

from unittest.mock import patch

import pytest
from pydantic import ValidationError

from app.timeline_extraction import (
    TimelineDateRange,
    TimelineEvent,
    TimelineExtractionRequest,
    TimelineExtractionResponse,
    _format_document_for_timeline,
)

# ===== Model Validation Tests =====


@pytest.mark.unit
class TestTimelineEventModel:
    """Test TimelineEvent Pydantic model."""

    def test_valid_event(self):
        event = TimelineEvent(
            date="2024-01-15",
            date_precision="day",
            title="Filing submitted",
            description="The plaintiff filed the initial complaint.",
            category="filing",
        )
        assert event.date == "2024-01-15"
        assert event.importance == "medium"
        assert event.parties == []
        assert event.legal_references == []

    def test_all_categories_valid(self):
        categories = [
            "filing",
            "decision",
            "deadline",
            "hearing",
            "appeal",
            "enforcement",
            "procedural",
            "legislative",
            "other",
        ]
        for cat in categories:
            event = TimelineEvent(
                date="2024-01",
                date_precision="month",
                title="T",
                description="D",
                category=cat,
            )
            assert event.category == cat

    def test_invalid_category(self):
        with pytest.raises((ValueError, ValidationError)):
            TimelineEvent(
                date="2024",
                date_precision="year",
                title="T",
                description="D",
                category="invalid",
            )

    def test_all_date_precisions_valid(self):
        for precision in ["day", "month", "year"]:
            event = TimelineEvent(
                date="2024",
                date_precision=precision,
                title="T",
                description="D",
                category="other",
            )
            assert event.date_precision == precision

    def test_invalid_date_precision(self):
        with pytest.raises((ValueError, ValidationError)):
            TimelineEvent(
                date="2024",
                date_precision="hour",
                title="T",
                description="D",
                category="other",
            )

    def test_all_importance_levels(self):
        for level in ["high", "medium", "low"]:
            event = TimelineEvent(
                date="2024",
                date_precision="year",
                title="T",
                description="D",
                category="other",
                importance=level,
            )
            assert event.importance == level

    def test_with_parties_and_references(self):
        event = TimelineEvent(
            date="2024-01-15",
            date_precision="day",
            title="Hearing",
            description="Court hearing",
            category="hearing",
            parties=["Plaintiff A", "Defendant B"],
            legal_references=["Art. 123 KC", "Art. 456 KPC"],
        )
        assert len(event.parties) == 2
        assert len(event.legal_references) == 2


@pytest.mark.unit
class TestTimelineDateRangeModel:
    """Test TimelineDateRange model."""

    def test_defaults_to_none(self):
        dr = TimelineDateRange()
        assert dr.earliest is None
        assert dr.latest is None

    def test_with_values(self):
        dr = TimelineDateRange(earliest="2020-01-01", latest="2024-12-31")
        assert dr.earliest == "2020-01-01"


@pytest.mark.unit
class TestTimelineExtractionResponseModel:
    """Test TimelineExtractionResponse model."""

    def test_valid_response(self):
        resp = TimelineExtractionResponse(
            events=[],
            timeline_summary="No events found.",
            date_range=TimelineDateRange(),
            document_ids=["doc-1"],
            total_events=0,
            extraction_depth="basic",
        )
        assert resp.total_events == 0
        assert resp.extraction_depth == "basic"


# ===== TimelineExtractionRequest Validation Tests =====


@pytest.mark.unit
class TestTimelineExtractionRequest:
    """Test TimelineExtractionRequest validation."""

    @patch("app.timeline_extraction.validate_id_format", side_effect=lambda v, n: v)
    def test_valid_request(self, mock_validate):
        req = TimelineExtractionRequest(
            document_ids=["doc-1"],
            extraction_depth="detailed",
        )
        assert req.extraction_depth == "detailed"
        assert req.focus_areas is None

    @patch("app.timeline_extraction.validate_id_format", side_effect=lambda v, n: v)
    def test_all_extraction_depths(self, mock_validate):
        for depth in ["basic", "detailed", "comprehensive"]:
            req = TimelineExtractionRequest(
                document_ids=["doc-1"],
                extraction_depth=depth,
            )
            assert req.extraction_depth == depth

    def test_empty_document_ids_invalid(self):
        with pytest.raises((ValueError, ValidationError)):
            TimelineExtractionRequest(document_ids=[])

    @patch("app.timeline_extraction.validate_id_format", side_effect=lambda v, n: v)
    def test_focus_areas_stripped(self, mock_validate):
        req = TimelineExtractionRequest(
            document_ids=["doc-1"],
            focus_areas=["  hearings  ", "filings", ""],
        )
        # Empty strings should be filtered, others stripped
        assert "hearings" in req.focus_areas
        assert "" not in req.focus_areas

    @patch("app.timeline_extraction.validate_id_format", side_effect=lambda v, n: v)
    def test_focus_areas_none_allowed(self, mock_validate):
        req = TimelineExtractionRequest(
            document_ids=["doc-1"],
            focus_areas=None,
        )
        assert req.focus_areas is None


# ===== _format_document_for_timeline Tests =====


@pytest.mark.unit
class TestFormatDocumentForTimeline:
    """Test _format_document_for_timeline helper function."""

    def test_minimal_document(self):
        doc = {"document_id": "doc-1"}
        result = _format_document_for_timeline(doc)
        assert "--- Document ID: doc-1 ---" in result

    def test_missing_document_id(self):
        doc = {}
        result = _format_document_for_timeline(doc)
        assert "unknown" in result

    def test_with_title(self):
        doc = {"document_id": "doc-1", "title": "Case XYZ"}
        result = _format_document_for_timeline(doc)
        assert "Title: Case XYZ" in result

    def test_with_all_metadata(self):
        doc = {
            "document_id": "doc-1",
            "title": "Case XYZ",
            "document_type": "judgment",
            "date_issued": "2024-01-15",
            "court_name": "Supreme Court",
        }
        result = _format_document_for_timeline(doc)
        assert "Type: judgment" in result
        assert "Date Issued: 2024-01-15" in result
        assert "Court: Supreme Court" in result

    def test_with_issuing_body_dict(self):
        doc = {
            "document_id": "doc-1",
            "issuing_body": {"name": "Ministry of Finance", "type": "ministry"},
        }
        result = _format_document_for_timeline(doc)
        assert "Issuing Body: Ministry of Finance" in result

    def test_with_issuing_body_string(self):
        doc = {
            "document_id": "doc-1",
            "issuing_body": "Ministry of Finance",
        }
        result = _format_document_for_timeline(doc)
        assert "Issuing Body: Ministry of Finance" in result

    def test_with_full_text(self):
        doc = {
            "document_id": "doc-1",
            "full_text": "This is the full text of the document.",
        }
        result = _format_document_for_timeline(doc)
        assert "Content:" in result
        assert "This is the full text" in result

    def test_full_text_truncated_at_15000(self):
        long_text = "x" * 20000
        doc = {"document_id": "doc-1", "full_text": long_text}
        result = _format_document_for_timeline(doc)
        assert "[... document truncated for length ...]" in result

    def test_summary_used_when_no_full_text(self):
        doc = {
            "document_id": "doc-1",
            "full_text": "",
            "summary": "A brief summary.",
        }
        result = _format_document_for_timeline(doc)
        assert "Summary:" in result
        assert "A brief summary." in result

    def test_thesis_used_when_no_full_text(self):
        doc = {
            "document_id": "doc-1",
            "full_text": "",
            "thesis": "The thesis of the case.",
        }
        result = _format_document_for_timeline(doc)
        assert "Thesis:" in result

    def test_with_legal_bases_list(self):
        doc = {
            "document_id": "doc-1",
            "full_text": "content",
            "legal_bases": ["Art. 123 KC", "Art. 456 KPC"],
        }
        result = _format_document_for_timeline(doc)
        assert "Legal Bases:" in result
        assert "Art. 123 KC" in result

    def test_legal_bases_non_list_ignored(self):
        doc = {
            "document_id": "doc-1",
            "full_text": "content",
            "legal_bases": "not a list",
        }
        result = _format_document_for_timeline(doc)
        assert "Legal Bases:" not in result

    def test_no_content_fields(self):
        doc = {"document_id": "doc-1", "title": "No content"}
        result = _format_document_for_timeline(doc)
        assert "Content:" not in result
        assert "Summary:" not in result
