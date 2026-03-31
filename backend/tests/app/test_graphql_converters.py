"""
Unit tests for app.graphql_api.converters module.

Tests cover:
- convert_legal_document
- convert_legal_document_metadata
- convert_document_chunk
- convert_extraction_job
- convert_search_documents_response
- convert_similar_documents_response
"""

from enum import Enum
from types import SimpleNamespace

import pytest

from app.graphql_api.converters import (
    convert_document_chunk,
    convert_extraction_job,
    convert_legal_document,
    convert_legal_document_metadata,
    convert_search_documents_response,
    convert_similar_documents_response,
)


class MockDocType(Enum):
    JUDGMENT = "judgment"
    TAX_INTERPRETATION = "tax_interpretation"


class MockSegmentType(Enum):
    HEADER = "header"
    BODY = "body"


def _make_doc(**overrides):
    """Create a mock document with default values."""
    defaults = {
        "document_id": "doc-1",
        "document_type": MockDocType.JUDGMENT,
        "title": "Test Case",
        "date_issued": "2024-01-01",
        "issuing_body": None,
        "language": "pl",
        "victims_count": 1,
        "offenders_count": 2,
        "case_type": "criminal",
        "document_number": "I CSK 123/2024",
        "country": "PL",
        "summary": "A summary",
        "keywords": ["law", "test"],
        "thesis": "The thesis",
        "court_name": "Supreme Court",
        "department_name": "Civil Dept",
        "presiding_judge": "Judge A",
        "judges": ["Judge A", "Judge B"],
        "legal_bases": ["Art. 123 KC"],
        "parties": ["Plaintiff", "Defendant"],
        "outcome": "upheld",
        "source_url": "https://example.com",
        "publication_date": "2024-02-01",
        "ingestion_date": "2024-03-01",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_metadata(**overrides):
    """Create a mock document metadata object."""
    defaults = {
        "uuid": "uuid-1",
        "document_id": "doc-1",
        "document_type": MockDocType.JUDGMENT,
        "language": "pl",
        "victims_count": 0,
        "offenders_count": 1,
        "case_type": "criminal",
        "keywords": ["test"],
        "date_issued": "2024-01-01",
        "score": 0.95,
        "title": "Test Title",
        "summary": "A summary",
        "court_name": "District Court",
        "document_number": "II K 456/2024",
        "thesis": "Some thesis",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ===== convert_legal_document Tests =====


@pytest.mark.unit
class TestConvertLegalDocument:
    """Test convert_legal_document converter."""

    def test_basic_conversion(self):
        doc = _make_doc()
        result = convert_legal_document(doc)
        assert result.document_id == "doc-1"
        assert result.document_type == "judgment"
        assert result.title == "Test Case"
        assert result.language == "pl"
        assert result.court_name == "Supreme Court"

    def test_document_type_enum_value(self):
        doc = _make_doc(document_type=MockDocType.TAX_INTERPRETATION)
        result = convert_legal_document(doc)
        assert result.document_type == "tax_interpretation"

    def test_document_type_string(self):
        doc = _make_doc(document_type="custom_type")
        result = convert_legal_document(doc)
        assert result.document_type == "custom_type"

    def test_with_issuing_body(self):
        ib = SimpleNamespace(
            name="Ministry of Justice",
            jurisdiction="PL",
            type="ministry",
        )
        doc = _make_doc(issuing_body=ib)
        result = convert_legal_document(doc)
        assert result.issuing_body is not None
        assert result.issuing_body.name == "Ministry of Justice"
        assert result.issuing_body.jurisdiction == "PL"
        assert result.issuing_body.type == "ministry"

    def test_without_issuing_body(self):
        doc = _make_doc(issuing_body=None)
        result = convert_legal_document(doc)
        assert result.issuing_body is None

    def test_missing_optional_attributes(self):
        """Document with only required attributes should work."""
        doc = SimpleNamespace(
            document_id="doc-min",
            document_type=MockDocType.JUDGMENT,
        )
        result = convert_legal_document(doc)
        assert result.document_id == "doc-min"
        assert result.title is None
        assert result.summary is None


# ===== convert_legal_document_metadata Tests =====


@pytest.mark.unit
class TestConvertLegalDocumentMetadata:
    """Test convert_legal_document_metadata converter."""

    def test_basic_conversion(self):
        meta = _make_metadata()
        result = convert_legal_document_metadata(meta)
        assert result.uuid == "uuid-1"
        assert result.document_id == "doc-1"
        assert result.document_type == "judgment"
        assert result.score == 0.95

    def test_enum_document_type(self):
        meta = _make_metadata(document_type=MockDocType.TAX_INTERPRETATION)
        result = convert_legal_document_metadata(meta)
        assert result.document_type == "tax_interpretation"

    def test_string_document_type(self):
        meta = _make_metadata(document_type="custom")
        result = convert_legal_document_metadata(meta)
        assert result.document_type == "custom"


# ===== convert_document_chunk Tests =====


@pytest.mark.unit
class TestConvertDocumentChunk:
    """Test convert_document_chunk converter."""

    def test_basic_conversion(self):
        chunk = SimpleNamespace(
            document_id="doc-1",
            document_type="judgment",
            language="pl",
            chunk_id="chunk-1",
            chunk_text="This is a chunk of text.",
            segment_type=MockSegmentType.BODY,
            position=3,
            confidence_score=0.95,
            cited_references=["ref-1"],
            tags=["important"],
        )
        result = convert_document_chunk(chunk)
        assert result.document_id == "doc-1"
        assert result.chunk_id == "chunk-1"
        assert result.segment_type == "body"
        assert result.position == 3

    def test_segment_type_none(self):
        chunk = SimpleNamespace(
            document_id="doc-1",
            chunk_id="c1",
            chunk_text="text",
            segment_type=None,
        )
        result = convert_document_chunk(chunk)
        assert result.segment_type is None

    def test_segment_type_string(self):
        chunk = SimpleNamespace(
            document_id="doc-1",
            chunk_id="c1",
            chunk_text="text",
            segment_type="custom_segment",
        )
        result = convert_document_chunk(chunk)
        assert result.segment_type == "custom_segment"


# ===== convert_extraction_job Tests =====


@pytest.mark.unit
class TestConvertExtractionJob:
    """Test convert_extraction_job converter."""

    def test_with_job_id(self):
        job = SimpleNamespace(
            job_id="job-1",
            collection_id="col-1",
            status="completed",
            created_at="2024-01-01T00:00:00Z",
            updated_at="2024-01-02T00:00:00Z",
            started_at="2024-01-01T00:01:00Z",
            completed_at="2024-01-01T01:00:00Z",
            total_documents=100,
            completed_documents=95,
            elapsed_time_seconds=3600,
            estimated_time_remaining_seconds=0,
        )
        result = convert_extraction_job(job)
        assert result.job_id == "job-1"
        assert result.status == "completed"
        assert result.total_documents == 100

    def test_with_task_id_fallback(self):
        job = SimpleNamespace(
            task_id="task-1",
            status="processing",
            created_at="2024-01-01T00:00:00Z",
        )
        result = convert_extraction_job(job)
        assert result.job_id == "task-1"

    def test_missing_optional_fields(self):
        job = SimpleNamespace(
            status="pending",
            created_at="2024-01-01T00:00:00Z",
        )
        result = convert_extraction_job(job)
        assert result.job_id == ""
        assert result.collection_id is None
        assert result.total_documents is None


# ===== convert_search_documents_response Tests =====


@pytest.mark.unit
class TestConvertSearchDocumentsResponse:
    """Test convert_search_documents_response converter."""

    def test_basic_conversion(self):
        meta = _make_metadata()
        response = SimpleNamespace(
            documents=[meta],
            total_count=1,
            is_capped=False,
            query_time_ms=42.5,
        )
        result = convert_search_documents_response(response)
        assert len(result.documents) == 1
        assert result.total_count == 1
        assert result.is_capped is False
        assert result.query_time_ms == 42.5

    def test_empty_results(self):
        response = SimpleNamespace(
            documents=[],
            total_count=0,
            is_capped=False,
        )
        result = convert_search_documents_response(response)
        assert result.documents == []

    def test_missing_query_time(self):
        response = SimpleNamespace(
            documents=[],
            total_count=0,
            is_capped=False,
        )
        result = convert_search_documents_response(response)
        assert result.query_time_ms is None


# ===== convert_similar_documents_response Tests =====


@pytest.mark.unit
class TestConvertSimilarDocumentsResponse:
    """Test convert_similar_documents_response converter."""

    def test_basic_conversion(self):
        sim_doc = SimpleNamespace(
            document_id="doc-2",
            db_id="db-2",
            similarity_score=0.92,
            title="Similar Case",
            document_type="judgment",
            date_issued="2024-01-01",
            document_number="III K 789",
            country="PL",
            language="pl",
        )
        response = SimpleNamespace(
            query_document_id="doc-1",
            similar_documents=[sim_doc],
            total_found=1,
        )
        result = convert_similar_documents_response(response)
        assert result.query_document_id == "doc-1"
        assert len(result.similar_documents) == 1
        assert result.similar_documents[0].similarity_score == 0.92
        assert result.total_found == 1

    def test_empty_similar_documents(self):
        response = SimpleNamespace(
            query_document_id="doc-1",
            similar_documents=[],
            total_found=0,
        )
        result = convert_similar_documents_response(response)
        assert result.similar_documents == []
        assert result.total_found == 0
