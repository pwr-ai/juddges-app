"""Unit tests for search analytics recording and the autocomplete analytics endpoints."""

from unittest.mock import MagicMock, patch

import pytest

from app.services.search_analytics import record_search_query


class TestRecordSearchQuery:
    """Test the fire-and-forget analytics recorder."""

    @patch("app.services.search_analytics.supabase_client")
    def test_inserts_row(self, mock_client):
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{"id": 1}])

        record_search_query("contract law", hit_count=5, processing_ms=12)

        mock_client.table.assert_called_once_with("search_analytics")
        insert_arg = mock_table.insert.call_args[0][0]
        assert insert_arg["query"] == "contract law"
        assert insert_arg["hit_count"] == 5
        assert insert_arg["processing_ms"] == 12

    @patch("app.services.search_analytics.supabase_client")
    def test_truncates_long_query(self, mock_client):
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[])

        long_query = "x" * 1000
        record_search_query(long_query, hit_count=0)

        insert_arg = mock_table.insert.call_args[0][0]
        assert len(insert_arg["query"]) == 500

    @patch("app.services.search_analytics.supabase_client", None)
    def test_noop_without_supabase(self):
        # Should not raise
        record_search_query("test", hit_count=0)

    @patch("app.services.search_analytics.supabase_client")
    def test_swallows_exceptions(self, mock_client):
        mock_client.table.side_effect = RuntimeError("db down")
        # Should not raise
        record_search_query("test", hit_count=0)


class TestSyncStatus:
    """Test the sync status tracker."""

    def test_record_and_get(self):
        from app.services.sync_status import (
            get_sync_status,
            record_sync_completed,
        )

        record_sync_completed(total_synced=42)
        status = get_sync_status()

        assert status["status"] == "ok"
        assert status["total_synced"] == 42
        assert status["lag_seconds"] is not None
        assert status["lag_seconds"] < 5  # just recorded

    def test_record_failure(self):
        from app.services.sync_status import (
            get_sync_status,
            record_sync_completed,
            record_sync_failed,
        )

        record_sync_completed(total_synced=10)
        record_sync_failed("connection timeout")
        status = get_sync_status()

        assert status["last_error"] == "connection timeout"
        assert status["last_error_at"] is not None

    def test_unknown_when_never_synced(self):
        import app.services.sync_status as mod

        # Reset module state
        original = mod._last_sync
        mod._last_sync = None
        try:
            # With no Redis either, should return unknown
            with patch.object(mod, "_get_redis", return_value=None):
                status = mod.get_sync_status()
                assert status["status"] == "unknown"
        finally:
            mod._last_sync = original
