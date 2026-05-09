"""Unit tests for app.utils.document_fetcher module."""

from unittest.mock import MagicMock, patch

import pytest

from app.utils.document_fetcher import get_document_by_id, get_documents_by_id


def _row(**overrides):
    """Build a minimal `judgments`-shaped mock row."""
    base = {
        "id": "9b958bff-1234-4abc-9876-1234567890ab",
        "source_id": "doc-1",
        "title": "Test Doc",
        "summary": "A summary",
        "full_text": "Full text here",
        "case_type": "Criminal",
        "jurisdiction": "PL",
        "court_name": "Sąd Rejonowy",
        "decision_date": None,
        "publication_date": None,
        "metadata": {},
        "source_dataset": "test",
        "source_url": "http://example.com",
        "judges": None,
        "outcome": None,
        "keywords": [],
    }
    base.update(overrides)
    return base


def _supabase_mock(rows):
    """Build a Supabase client mock returning the given rows from .in_().execute()."""
    mock_response = MagicMock()
    mock_response.data = rows

    mock_query = MagicMock()
    mock_query.select.return_value = mock_query
    mock_query.in_.return_value = mock_query
    mock_query.execute.return_value = mock_response

    mock_client = MagicMock()
    mock_client.table.return_value = mock_query
    return mock_client


# ---------------------------------------------------------------------------
# get_documents_by_id
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestGetDocumentsById:
    """Tests for get_documents_by_id with mocked Supabase."""

    @pytest.mark.asyncio
    async def test_empty_list_returns_empty(self):
        result = await get_documents_by_id([])
        assert result == []

    @pytest.mark.asyncio
    async def test_successful_fetch_by_source_id(self):
        mock_client = _supabase_mock([_row(source_id="doc-1")])

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_documents_by_id(["doc-1"])

        assert len(result) == 1
        assert result[0].document_id == "doc-1"
        # jurisdiction "PL" → language "pl" derived
        assert result[0].country == "PL"
        assert result[0].language == "pl"

    @pytest.mark.asyncio
    async def test_successful_fetch_by_uuid(self):
        uuid = "9b958bff-1234-4abc-9876-1234567890ab"
        mock_client = _supabase_mock([_row(id=uuid, source_id=None)])

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_documents_by_id([uuid])

        assert len(result) == 1
        # Falls back to UUID when source_id is missing.
        assert result[0].document_id == uuid

    @pytest.mark.asyncio
    async def test_uk_jurisdiction_maps_to_en_language(self):
        mock_client = _supabase_mock([_row(jurisdiction="UK")])

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_documents_by_id(["doc-1"])

        assert result[0].country == "UK"
        assert result[0].language == "en"

    @pytest.mark.asyncio
    async def test_no_documents_found(self):
        mock_client = _supabase_mock([])

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_documents_by_id(["nonexistent"])

        assert result == []

    @pytest.mark.asyncio
    async def test_database_error_raises_runtime(self):
        with (
            patch(
                "app.utils.document_fetcher.get_supabase_client",
                side_effect=Exception("db connection failed"),
            ),
            pytest.raises(RuntimeError, match="Database query failed"),
        ):
            await get_documents_by_id(["doc-1"])

    @pytest.mark.asyncio
    async def test_partial_results_logged(self):
        """When fewer rows returned than IDs requested, function still succeeds."""
        mock_client = _supabase_mock([_row(source_id="doc-1")])

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_documents_by_id(["doc-1", "doc-2"])

        assert len(result) == 1
        assert result[0].document_id == "doc-1"

    @pytest.mark.asyncio
    async def test_malformed_row_skipped(self):
        """Rows that fail LegalDocument construction are skipped."""
        mock_client = _supabase_mock(
            [
                _row(id="aaaaaaaa-1111-4111-8111-111111111111", source_id="doc-1"),
                # `metadata` must be a dict; passing a non-dict triggers Pydantic
                # validation and the row should be skipped, not crash the batch.
                _row(
                    id="bbbbbbbb-2222-4222-8222-222222222222",
                    source_id="doc-bad",
                    metadata="not-a-dict",
                ),
            ]
        )

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_documents_by_id(["doc-1", "doc-bad"])

        # At least the good doc should come through.
        assert any(d.document_id == "doc-1" for d in result)


# ---------------------------------------------------------------------------
# get_document_by_id
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestGetDocumentById:
    """Tests for get_document_by_id."""

    @pytest.mark.asyncio
    async def test_found(self):
        mock_client = _supabase_mock([_row(source_id="doc-1")])

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_document_by_id("doc-1")

        assert result is not None
        assert result.document_id == "doc-1"

    @pytest.mark.asyncio
    async def test_not_found(self):
        mock_client = _supabase_mock([])

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_document_by_id("nonexistent")

        assert result is None
