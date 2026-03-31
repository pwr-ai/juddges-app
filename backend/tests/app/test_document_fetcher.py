"""Unit tests for app.utils.document_fetcher module."""

from unittest.mock import MagicMock, patch

import pytest

from app.utils.document_fetcher import get_document_by_id, get_documents_by_id

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
    async def test_successful_fetch(self):
        mock_response = MagicMock()
        mock_response.data = [
            {
                "document_id": "doc-1",
                "title": "Test Doc",
                "summary": "A summary",
                "full_text": "Full text here",
                "document_type": "judgment",
                "language": "pl",
                "country": "PL",
                "metadata": {},
                "publication_date": None,
                "source": "test",
                "url": "http://example.com",
                "embedding": None,
            }
        ]

        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.execute.return_value = mock_response

        mock_client = MagicMock()
        mock_client.table.return_value = mock_query

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_documents_by_id(["doc-1"])
        assert len(result) == 1
        assert result[0].document_id == "doc-1"

    @pytest.mark.asyncio
    async def test_no_documents_found(self):
        mock_response = MagicMock()
        mock_response.data = []

        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.execute.return_value = mock_response

        mock_client = MagicMock()
        mock_client.table.return_value = mock_query

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
        """When fewer docs returned than requested, function still succeeds."""
        mock_response = MagicMock()
        mock_response.data = [
            {
                "document_id": "doc-1",
                "title": "Found",
                "summary": "",
                "full_text": "text",
                "document_type": "judgment",
                "language": "pl",
                "country": "PL",
                "metadata": {},
                "publication_date": None,
                "source": "",
                "url": "",
                "embedding": None,
            }
        ]

        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.execute.return_value = mock_response

        mock_client = MagicMock()
        mock_client.table.return_value = mock_query

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_documents_by_id(["doc-1", "doc-2"])
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_malformed_row_skipped(self):
        """Rows that fail LegalDocument construction are skipped."""
        mock_response = MagicMock()
        mock_response.data = [
            {
                "document_id": "doc-1",
                "title": "Good",
                "summary": "",
                "full_text": "text",
                "document_type": "judgment",
                "language": "pl",
                "country": "PL",
                "metadata": {},
            },
            {
                # Missing required 'country' field -- will fail model validation
                "document_id": "doc-bad",
            },
        ]

        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.execute.return_value = mock_response

        mock_client = MagicMock()
        mock_client.table.return_value = mock_query

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_documents_by_id(["doc-1", "doc-bad"])
        # At least the good doc should come through
        assert any(d.document_id == "doc-1" for d in result)


# ---------------------------------------------------------------------------
# get_document_by_id
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestGetDocumentById:
    """Tests for get_document_by_id."""

    @pytest.mark.asyncio
    async def test_found(self):
        mock_response = MagicMock()
        mock_response.data = [
            {
                "document_id": "doc-1",
                "title": "Test",
                "summary": "",
                "full_text": "text",
                "document_type": "judgment",
                "language": "pl",
                "country": "PL",
                "metadata": {},
                "publication_date": None,
                "source": "",
                "url": "",
                "embedding": None,
            }
        ]

        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.execute.return_value = mock_response

        mock_client = MagicMock()
        mock_client.table.return_value = mock_query

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_document_by_id("doc-1")
        assert result is not None
        assert result.document_id == "doc-1"

    @pytest.mark.asyncio
    async def test_not_found(self):
        mock_response = MagicMock()
        mock_response.data = []

        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.execute.return_value = mock_response

        mock_client = MagicMock()
        mock_client.table.return_value = mock_query

        with patch(
            "app.utils.document_fetcher.get_supabase_client",
            return_value=mock_client,
        ):
            result = await get_document_by_id("nonexistent")
        assert result is None
