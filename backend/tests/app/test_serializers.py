"""Unit tests for app.utils.serializers module."""

from datetime import datetime
from enum import Enum

import pytest
from juddges_search.models import LegalDocument

from app.utils.serializers import serialize_document_for_similarity


class MockDocType(str, Enum):
    JUDGMENT = "judgment"
    RULING = "ruling"


def _make_doc(**overrides) -> LegalDocument:
    """Helper to create a LegalDocument for testing."""
    defaults = {
        "document_id": "doc-1",
        "document_type": "judgment",
        "title": "Test Title",
        "country": "PL",
        "full_text": "Full text",
        "language": "pl",
        "date_issued": None,
        "publication_date": None,
        "document_number": "II FSK 123/24",
    }
    defaults.update(overrides)
    return LegalDocument(**defaults)


@pytest.mark.unit
class TestSerializeDocumentForSimilarity:
    """Tests for serialize_document_for_similarity."""

    def test_basic_fields(self):
        doc = _make_doc()
        result = serialize_document_for_similarity(doc)
        assert result["document_id"] == "doc-1"
        assert result["title"] == "Test Title"
        assert result["country"] == "PL"
        assert result["language"] == "pl"
        assert result["document_number"] == "II FSK 123/24"

    def test_date_serialization(self):
        dt = datetime(2025, 3, 15, 12, 0, 0)
        doc = _make_doc(date_issued=dt, publication_date=dt)
        result = serialize_document_for_similarity(doc)
        assert "2025-03-15" in result["date_issued"]
        assert "2025-03-15" in result["publication_date"]

    def test_none_dates(self):
        doc = _make_doc(date_issued=None, publication_date=None)
        result = serialize_document_for_similarity(doc)
        assert result["date_issued"] is None
        assert result["publication_date"] is None

    def test_document_type_string(self):
        doc = _make_doc(document_type="judgment")
        result = serialize_document_for_similarity(doc)
        assert result["document_type"] is not None

    def test_document_type_enum_value(self):
        doc = _make_doc(document_type="tax_interpretation")
        result = serialize_document_for_similarity(doc)
        # Enum .value should be extracted
        assert result["document_type"] == "tax_interpretation"

    def test_returns_expected_keys(self):
        doc = _make_doc()
        result = serialize_document_for_similarity(doc)
        expected_keys = {
            "document_id",
            "title",
            "document_type",
            "date_issued",
            "publication_date",
            "document_number",
            "country",
            "language",
        }
        assert set(result.keys()) == expected_keys
