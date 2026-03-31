"""
Unit tests for app.versioning module.

Tests cover:
- Pydantic model validation
- _compute_content_hash helper (including None input)
- _escape_html helper
- _generate_diff_html helper
- Revert rollback behavior on document update failure
"""

import hashlib
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from app.versioning import (
    CreateVersionRequest,
    DocumentVersion,
    RevertVersionRequest,
    VersionHistoryResponse,
    _compute_content_hash,
    _escape_html,
    _generate_diff_html,
    revert_to_version,
)

# ===== Model Validation Tests =====


@pytest.mark.unit
class TestDocumentVersionModel:
    """Test DocumentVersion Pydantic model."""

    def test_valid_version(self):
        v = DocumentVersion(
            id="v-1",
            document_id="doc-1",
            version_number=1,
            content_hash="abc123",
            change_type="initial",
            created_at="2024-01-01T00:00:00Z",
        )
        assert v.version_number == 1
        assert v.created_by == "system"
        assert v.has_extracted_data is False
        assert v.title is None

    def test_with_optional_fields(self):
        v = DocumentVersion(
            id="v-1",
            document_id="doc-1",
            version_number=2,
            title="Updated Title",
            content_hash="def456",
            change_description="Fixed typo",
            change_type="correction",
            created_by="user",
            created_at="2024-01-02T00:00:00Z",
            has_extracted_data=True,
        )
        assert v.title == "Updated Title"
        assert v.has_extracted_data is True


@pytest.mark.unit
class TestVersionHistoryResponseModel:
    """Test VersionHistoryResponse model."""

    def test_valid_response(self):
        resp = VersionHistoryResponse(
            document_id="doc-1",
            current_version=3,
            versions=[],
            total_versions=0,
        )
        assert resp.current_version == 3
        assert resp.versions == []


@pytest.mark.unit
class TestCreateVersionRequestModel:
    """Test CreateVersionRequest model."""

    def test_defaults(self):
        req = CreateVersionRequest()
        assert req.change_description is None
        assert req.change_type == "amendment"

    def test_max_length_description(self):
        req = CreateVersionRequest(change_description="x" * 500)
        assert len(req.change_description) == 500

    def test_description_too_long(self):
        with pytest.raises((ValueError, ValidationError)):
            CreateVersionRequest(change_description="x" * 501)


@pytest.mark.unit
class TestRevertVersionRequestModel:
    """Test RevertVersionRequest model."""

    def test_valid_version(self):
        req = RevertVersionRequest(version_number=5)
        assert req.version_number == 5

    def test_version_zero_invalid(self):
        with pytest.raises((ValueError, ValidationError)):
            RevertVersionRequest(version_number=0)

    def test_negative_version_invalid(self):
        with pytest.raises((ValueError, ValidationError)):
            RevertVersionRequest(version_number=-1)

    def test_optional_description(self):
        req = RevertVersionRequest(version_number=1, change_description="rollback")
        assert req.change_description == "rollback"


# ===== _compute_content_hash Tests =====


@pytest.mark.unit
class TestComputeContentHash:
    """Test _compute_content_hash helper."""

    def test_deterministic(self):
        h1 = _compute_content_hash("hello world")
        h2 = _compute_content_hash("hello world")
        assert h1 == h2

    def test_different_input_different_hash(self):
        h1 = _compute_content_hash("hello")
        h2 = _compute_content_hash("world")
        assert h1 != h2

    def test_correct_sha256(self):
        text = "test content"
        expected = hashlib.sha256(text.encode("utf-8")).hexdigest()
        assert _compute_content_hash(text) == expected

    def test_empty_string(self):
        result = _compute_content_hash("")
        expected = hashlib.sha256(b"").hexdigest()
        assert result == expected

    def test_unicode_content(self):
        # Polish characters
        text = "Sąd Najwyższy orzekł że..."
        result = _compute_content_hash(text)
        expected = hashlib.sha256(text.encode("utf-8")).hexdigest()
        assert result == expected

    def test_returns_hex_string(self):
        result = _compute_content_hash("test")
        # SHA-256 hex digest is 64 characters
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)


# ===== _escape_html Tests =====


@pytest.mark.unit
class TestEscapeHtml:
    """Test _escape_html helper."""

    def test_no_special_chars(self):
        assert _escape_html("hello world") == "hello world"

    def test_ampersand(self):
        assert _escape_html("A & B") == "A &amp; B"

    def test_less_than(self):
        assert _escape_html("a < b") == "a &lt; b"

    def test_greater_than(self):
        assert _escape_html("a > b") == "a &gt; b"

    def test_double_quote(self):
        assert _escape_html('say "hello"') == "say &quot;hello&quot;"

    def test_all_special_chars(self):
        result = _escape_html('&<>"')
        assert result == "&amp;&lt;&gt;&quot;"

    def test_empty_string(self):
        assert _escape_html("") == ""

    def test_already_escaped_double_escapes(self):
        result = _escape_html("&amp;")
        assert result == "&amp;amp;"

    def test_single_quote_not_escaped(self):
        # Single quotes are NOT escaped by this implementation
        assert _escape_html("it's") == "it's"


# ===== _generate_diff_html Tests =====


@pytest.mark.unit
class TestGenerateDiffHtml:
    """Test _generate_diff_html helper."""

    def test_identical_texts(self):
        diff_html, stats = _generate_diff_html("hello", "hello")
        assert stats["additions"] == 0
        assert stats["deletions"] == 0
        assert stats["total_changes"] == 0

    def test_single_addition(self):
        old_text = "line1\nline2"
        new_text = "line1\nline2\nline3"
        diff_html, stats = _generate_diff_html(old_text, new_text)
        assert stats["additions"] >= 1
        assert "diff-add" in diff_html

    def test_single_deletion(self):
        old_text = "line1\nline2\nline3"
        new_text = "line1\nline2"
        diff_html, stats = _generate_diff_html(old_text, new_text)
        assert stats["deletions"] >= 1
        assert "diff-del" in diff_html

    def test_modification(self):
        old_text = "line1\nold line\nline3"
        new_text = "line1\nnew line\nline3"
        diff_html, stats = _generate_diff_html(old_text, new_text)
        assert stats["total_changes"] >= 2  # at least 1 add + 1 delete

    def test_empty_to_content(self):
        diff_html, stats = _generate_diff_html("", "new content")
        assert stats["additions"] >= 1

    def test_content_to_empty(self):
        diff_html, stats = _generate_diff_html("old content", "")
        assert stats["deletions"] >= 1

    def test_both_empty(self):
        diff_html, stats = _generate_diff_html("", "")
        assert stats["total_changes"] == 0

    def test_html_special_chars_escaped_in_diff(self):
        old_text = "<script>alert(1)</script>"
        new_text = "<div>safe</div>"
        diff_html, stats = _generate_diff_html(old_text, new_text)
        # HTML entities should be escaped
        assert "<script>" not in diff_html
        assert "&lt;script&gt;" in diff_html or "&lt;div&gt;" in diff_html

    def test_hunk_headers_marked(self):
        old_text = "a\nb\nc\nd\ne"
        new_text = "a\nb\nX\nd\ne"
        diff_html, stats = _generate_diff_html(old_text, new_text)
        assert "diff-hunk" in diff_html

    def test_context_lines_marked(self):
        old_text = "a\nb\nc"
        new_text = "a\nX\nc"
        diff_html, stats = _generate_diff_html(old_text, new_text)
        assert "diff-ctx" in diff_html

    def test_stats_total_is_sum(self):
        old_text = "line1\nline2\nline3"
        new_text = "line1\nmodified\nline3\nnew_line"
        diff_html, stats = _generate_diff_html(old_text, new_text)
        assert stats["total_changes"] == stats["additions"] + stats["deletions"]

    def test_multiline_diff(self):
        old_text = "\n".join([f"line {i}" for i in range(10)])
        new_text = "\n".join([f"line {i}" if i != 5 else "CHANGED" for i in range(10)])
        diff_html, stats = _generate_diff_html(old_text, new_text)
        assert stats["additions"] >= 1
        assert stats["deletions"] >= 1


# ===== Regression: _compute_content_hash with None/empty =====


@pytest.mark.unit
class TestComputeContentHashNoneHandling:
    """Regression tests for BUG 9: _compute_content_hash must handle None input."""

    def test_none_input_returns_none(self):
        """_compute_content_hash(None) should return None, not crash."""
        result = _compute_content_hash(None)
        assert result is None

    def test_empty_string_returns_valid_hash(self):
        """Empty string is valid input and should produce a deterministic hash."""
        result = _compute_content_hash("")
        expected = hashlib.sha256(b"").hexdigest()
        assert result == expected
        assert len(result) == 64


# ===== Regression: Revert rollback on update failure =====


def _make_chainable_mock(data=None, count=None):
    """Create a mock that supports Supabase's fluent query builder pattern."""
    mock = MagicMock()
    response = MagicMock()
    response.data = data if data is not None else []
    response.count = count

    # Every chained method returns the same mock so .select().eq().limit().execute() works
    mock.select.return_value = mock
    mock.eq.return_value = mock
    mock.limit.return_value = mock
    mock.order.return_value = mock
    mock.range.return_value = mock
    mock.insert.return_value = mock
    mock.update.return_value = mock
    mock.delete.return_value = mock
    mock.execute.return_value = response
    return mock


@pytest.mark.unit
class TestRevertRollbackOnFailure:
    """Regression tests for BUG 10: revert must roll back snapshot if document update fails."""

    @pytest.mark.asyncio
    async def test_revert_rolls_back_snapshot_on_update_failure(self):
        """If the document update step fails, the pre-revert snapshot version
        should be deleted (compensating transaction) and an HTTPException raised."""
        from fastapi import HTTPException as FastAPIHTTPException

        snapshot_id = "snapshot-abc-123"
        document_id = "doc-42"
        target_version_number = 2

        # -- Build per-table mocks --

        # document_versions table mock: handles multiple chained calls
        versions_mock = MagicMock()

        # Track calls to know which operation is being performed
        call_count = {"select": 0, "insert": 0, "update": 0, "delete": 0}

        def versions_select(*args, **kwargs):
            call_count["select"] += 1
            chain = MagicMock()
            chain.eq.return_value = chain
            chain.limit.return_value = chain
            chain.order.return_value = chain

            if call_count["select"] == 1:
                # First select on document_versions: get target version
                resp = MagicMock()
                resp.data = [
                    {
                        "id": "target-v-id",
                        "document_id": document_id,
                        "version_number": target_version_number,
                        "title": "Old Title",
                        "full_text": "old content for revert",
                        "summary": "old summary",
                        "content_hash": "oldhash",
                        "change_type": "initial",
                        "created_by": "system",
                        "created_at": "2024-01-01T00:00:00Z",
                        "extracted_data": {},
                    }
                ]
                chain.execute.return_value = resp
            elif call_count["select"] == 2:
                # Second select on document_versions: get max version number
                # (the current doc select goes to legal_documents / docs_mock)
                resp = MagicMock()
                resp.data = [{"version_number": 3}]
                chain.execute.return_value = resp
            return chain

        versions_mock.select.side_effect = versions_select

        # Insert (snapshot creation) succeeds
        insert_chain = MagicMock()
        insert_chain.execute.return_value = MagicMock(
            data=[{"id": snapshot_id, "version_number": 4}]
        )
        versions_mock.insert.return_value = insert_chain

        # Delete (rollback) should be called
        delete_chain = MagicMock()
        delete_chain.eq.return_value = delete_chain
        delete_chain.execute.return_value = MagicMock(data=[])
        versions_mock.delete.return_value = delete_chain

        # legal_documents table mock
        docs_mock = MagicMock()

        def docs_select(*args, **kwargs):
            chain = MagicMock()
            chain.eq.return_value = chain
            chain.limit.return_value = chain
            resp = MagicMock()
            resp.data = [
                {
                    "document_id": document_id,
                    "title": "Current Title",
                    "full_text": "current content",
                    "summary": "current summary",
                    "content_hash": "currenthash",
                    "extracted_data": {},
                    "current_version": 3,
                }
            ]
            chain.execute.return_value = resp
            return chain

        docs_mock.select.side_effect = docs_select

        # Update on legal_documents raises an error
        update_chain = MagicMock()
        update_chain.eq.return_value = update_chain
        update_chain.execute.side_effect = RuntimeError("DB connection lost")
        docs_mock.update.return_value = update_chain

        # Wire up db.client.table routing
        def table_router(name):
            if name == "document_versions":
                return versions_mock
            if name == "legal_documents":
                return docs_mock
            raise ValueError(f"Unexpected table: {name}")

        mock_db = MagicMock()
        mock_db.client.table.side_effect = table_router

        request = RevertVersionRequest(
            version_number=target_version_number,
            change_description="Testing rollback",
        )

        with patch("app.versioning.get_vector_db", return_value=mock_db):
            with pytest.raises(FastAPIHTTPException) as exc_info:
                await revert_to_version(request=request, document_id=document_id)

            # The outer except converts arbitrary exceptions to HTTP 500
            assert exc_info.value.status_code == 500

        # Verify the compensating delete was attempted
        versions_mock.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_revert_succeeds_without_rollback(self):
        """When the document update succeeds, no rollback delete should occur."""
        document_id = "doc-99"
        target_version_number = 1

        versions_mock = MagicMock()
        call_count = {"select": 0}

        def versions_select(*args, **kwargs):
            call_count["select"] += 1
            chain = MagicMock()
            chain.eq.return_value = chain
            chain.limit.return_value = chain
            chain.order.return_value = chain

            if call_count["select"] == 1:
                resp = MagicMock()
                resp.data = [
                    {
                        "id": "v1",
                        "document_id": document_id,
                        "version_number": 1,
                        "title": "V1 Title",
                        "full_text": "v1 content",
                        "summary": None,
                        "content_hash": "v1hash",
                        "change_type": "initial",
                        "created_by": "system",
                        "created_at": "2024-01-01T00:00:00Z",
                        "extracted_data": {},
                    }
                ]
                chain.execute.return_value = resp
            elif call_count["select"] == 2:
                resp = MagicMock()
                resp.data = [{"version_number": 2}]
                chain.execute.return_value = resp
            return chain

        versions_mock.select.side_effect = versions_select

        insert_chain = MagicMock()
        insert_chain.execute.return_value = MagicMock(
            data=[{"id": "snap-1", "version_number": 3}]
        )
        versions_mock.insert.return_value = insert_chain

        docs_mock = MagicMock()

        def docs_select(*args, **kwargs):
            chain = MagicMock()
            chain.eq.return_value = chain
            chain.limit.return_value = chain
            resp = MagicMock()
            resp.data = [
                {
                    "document_id": document_id,
                    "title": "Current",
                    "full_text": "current text",
                    "summary": None,
                    "content_hash": "curhash",
                    "extracted_data": {},
                    "current_version": 2,
                }
            ]
            chain.execute.return_value = resp
            return chain

        docs_mock.select.side_effect = docs_select

        update_chain = MagicMock()
        update_chain.eq.return_value = update_chain
        update_chain.execute.return_value = MagicMock(
            data=[{"document_id": document_id}]
        )
        docs_mock.update.return_value = update_chain

        def table_router(name):
            if name == "document_versions":
                return versions_mock
            if name == "legal_documents":
                return docs_mock
            raise ValueError(f"Unexpected table: {name}")

        mock_db = MagicMock()
        mock_db.client.table.side_effect = table_router

        request = RevertVersionRequest(version_number=target_version_number)

        with patch("app.versioning.get_vector_db", return_value=mock_db):
            result = await revert_to_version(request=request, document_id=document_id)

        assert result["reverted_to_version"] == target_version_number
        # No rollback delete should have been called
        versions_mock.delete.assert_not_called()
