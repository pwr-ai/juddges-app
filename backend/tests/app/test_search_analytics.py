"""Unit tests for search analytics recording, autocomplete analytics, and eval export."""

from unittest.mock import MagicMock, patch

import pytest

from app.services.search_analytics import export_eval_queries, record_search_query


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
    def test_inserts_topic_hits_count(self, mock_client):
        """topic_hits_count is stored alongside document hit_count."""
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{"id": 2}])

        record_search_query(
            "narkomania", hit_count=8, processing_ms=15, topic_hits_count=3
        )

        insert_arg = mock_table.insert.call_args[0][0]
        assert insert_arg["topic_hits_count"] == 3

    @patch("app.services.search_analytics.supabase_client")
    def test_topic_hits_count_defaults_to_none(self, mock_client):
        """Omitting topic_hits_count stores NULL (backward-compatible)."""
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{"id": 3}])

        record_search_query("tort", hit_count=4)

        insert_arg = mock_table.insert.call_args[0][0]
        assert insert_arg["topic_hits_count"] is None

    @patch("app.services.search_analytics.supabase_client")
    def test_zero_topic_hits_count_stored(self, mock_client):
        """A count of zero (topics index returned nothing) is stored explicitly."""
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{"id": 4}])

        record_search_query("gibberish", hit_count=0, topic_hits_count=0)

        insert_arg = mock_table.insert.call_args[0][0]
        assert insert_arg["topic_hits_count"] == 0

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


class TestExportEvalQueries:
    """Test the eval query export function."""

    @pytest.mark.anyio
    @patch("app.services.search_analytics.supabase_client", None)
    async def test_returns_empty_without_supabase(self):
        result = await export_eval_queries()
        assert result["queries"] == []
        assert "error" in result["metadata"]

    @pytest.mark.anyio
    @patch("app.services.search_analytics.supabase_client")
    async def test_exports_from_rpc(self, mock_client):
        """Test that export_eval_queries uses the RPC and returns deduped queries."""
        mock_rpc = MagicMock()
        mock_client.rpc.return_value = mock_rpc
        mock_rpc.execute.return_value = MagicMock(
            data=[
                {
                    "query": "contract law",
                    "search_count": 10,
                    "avg_hits": 5.2,
                    "avg_processing_ms": 120.0,
                },
                {
                    "query": "tort liability",
                    "search_count": 3,
                    "avg_hits": 8.0,
                    "avg_processing_ms": 95.0,
                },
            ]
        )

        # Mock feedback table returning empty
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_select = MagicMock()
        mock_table.select.return_value = mock_select
        mock_gte = MagicMock()
        mock_select.gte.return_value = mock_gte
        mock_order = MagicMock()
        mock_gte.order.return_value = mock_order
        mock_order.limit.return_value = mock_order
        mock_order.execute.return_value = MagicMock(data=[])

        result = await export_eval_queries(days=7, min_frequency=1)

        assert len(result["queries"]) == 2
        assert result["queries"][0]["query"] == "contract law"
        assert result["queries"][0]["query_source"] == "user_logs"
        assert result["queries"][0]["frequency"] == 10
        assert result["queries"][0]["has_ground_truth"] is False
        assert result["metadata"]["total_queries"] == 2
        assert result["metadata"]["unlabeled_queries"] == 2

    @pytest.mark.anyio
    @patch("app.services.search_analytics.supabase_client")
    async def test_merges_feedback_labels(self, mock_client):
        """Test that feedback labels are attached to matching queries."""
        mock_rpc = MagicMock()
        mock_client.rpc.return_value = mock_rpc
        mock_rpc.execute.return_value = MagicMock(
            data=[
                {
                    "query": "contract law",
                    "search_count": 5,
                    "avg_hits": 3.0,
                    "avg_processing_ms": 100.0,
                },
            ]
        )

        # Mock feedback table
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_select = MagicMock()
        mock_table.select.return_value = mock_select
        mock_gte = MagicMock()
        mock_select.gte.return_value = mock_gte
        mock_order = MagicMock()
        mock_gte.order.return_value = mock_order
        mock_order.limit.return_value = mock_order
        mock_order.execute.return_value = MagicMock(
            data=[
                {
                    "search_query": "contract law",
                    "document_id": "doc-123",
                    "rating": "relevant",
                    "result_position": 1,
                    "reason": "exact match",
                },
                {
                    "search_query": "employment dispute",
                    "document_id": "doc-456",
                    "rating": "not_relevant",
                    "result_position": 3,
                    "reason": None,
                },
            ]
        )

        result = await export_eval_queries(days=30)

        # "contract law" from logs + has feedback
        contract = next(q for q in result["queries"] if q["query"] == "contract law")
        assert contract["has_ground_truth"] is True
        assert len(contract["relevance_labels"]) == 1
        assert contract["relevance_labels"][0]["rating"] == "relevant"

        # "employment dispute" from feedback only
        employment = next(
            q for q in result["queries"] if "employment" in q["query"].lower()
        )
        assert employment["query_source"] == "feedback_rated"
        assert employment["has_ground_truth"] is True
        assert employment["frequency"] == 0

        assert result["metadata"]["labeled_queries"] == 2
        assert result["metadata"]["source_breakdown"]["feedback_rated"] == 1

    @pytest.mark.anyio
    @patch("app.services.search_analytics.supabase_client")
    async def test_deduplicates_case_insensitive(self, mock_client):
        """Test that queries are deduped case-insensitively."""
        mock_rpc = MagicMock()
        mock_client.rpc.return_value = mock_rpc
        mock_rpc.execute.return_value = MagicMock(
            data=[
                {
                    "query": "Contract Law",
                    "search_count": 3,
                    "avg_hits": 2.0,
                    "avg_processing_ms": 50.0,
                },
                {
                    "query": "contract law",
                    "search_count": 5,
                    "avg_hits": 3.0,
                    "avg_processing_ms": 60.0,
                },
            ]
        )

        # No feedback
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_select = MagicMock()
        mock_table.select.return_value = mock_select
        mock_gte = MagicMock()
        mock_select.gte.return_value = mock_gte
        mock_order = MagicMock()
        mock_gte.order.return_value = mock_order
        mock_order.limit.return_value = mock_order
        mock_order.execute.return_value = MagicMock(data=[])

        result = await export_eval_queries()

        # Only one query after dedup (first one wins)
        assert len(result["queries"]) == 1
        assert result["queries"][0]["query"] == "Contract Law"

    @pytest.mark.anyio
    @patch("app.services.search_analytics.supabase_client")
    async def test_skip_feedback_when_disabled(self, mock_client):
        """Test include_feedback=False skips the feedback fetch."""
        mock_rpc = MagicMock()
        mock_client.rpc.return_value = mock_rpc
        mock_rpc.execute.return_value = MagicMock(
            data=[
                {
                    "query": "test",
                    "search_count": 1,
                    "avg_hits": 1.0,
                    "avg_processing_ms": 10.0,
                },
            ]
        )

        result = await export_eval_queries(include_feedback=False)

        # Should NOT call .table("search_feedback")
        mock_client.table.assert_not_called()
        assert len(result["queries"]) == 1
        assert result["queries"][0]["has_ground_truth"] is False

    @pytest.mark.anyio
    @patch("app.services.search_analytics.supabase_client")
    async def test_min_frequency_filter(self, mock_client):
        """Test that min_frequency filters out low-frequency queries."""
        mock_rpc = MagicMock()
        mock_client.rpc.return_value = mock_rpc
        mock_rpc.execute.return_value = MagicMock(
            data=[
                {
                    "query": "popular",
                    "search_count": 10,
                    "avg_hits": 5.0,
                    "avg_processing_ms": 50.0,
                },
                {
                    "query": "rare",
                    "search_count": 1,
                    "avg_hits": 1.0,
                    "avg_processing_ms": 20.0,
                },
            ]
        )

        result = await export_eval_queries(min_frequency=5, include_feedback=False)

        assert len(result["queries"]) == 1
        assert result["queries"][0]["query"] == "popular"


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
