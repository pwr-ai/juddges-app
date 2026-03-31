"""Unit tests for app.services.retention_service module.

Tests cover: RetentionConfig lookup, RetentionService methods for archival,
export, deletion requests, deletion processing, and data anonymization.
"""

from __future__ import annotations

import hashlib
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.retention_service import RetentionConfig, RetentionService

# =============================================================================
# RetentionConfig
# =============================================================================


class TestRetentionConfig:
    @pytest.mark.unit
    def test_known_data_types(self) -> None:
        assert RetentionConfig.get_retention_period("audit_logs") == 2555
        assert RetentionConfig.get_retention_period("user_data") == 1095
        assert RetentionConfig.get_retention_period("chat_history") == 365
        assert RetentionConfig.get_retention_period("analytics") == 730
        assert RetentionConfig.get_retention_period("feedback") == 1095
        assert RetentionConfig.get_retention_period("temporary_data") == 90
        assert RetentionConfig.get_retention_period("session_data") == 30

    @pytest.mark.unit
    def test_unknown_data_type_returns_default(self) -> None:
        # Unknown types should return USER_DATA retention period
        result = RetentionConfig.get_retention_period("unknown_type")
        assert result == RetentionConfig.USER_DATA

    @pytest.mark.unit
    def test_constants_are_positive_integers(self) -> None:
        assert RetentionConfig.AUDIT_LOGS > 0
        assert RetentionConfig.SESSION_DATA > 0
        # Audit logs should be longest (7 years)
        assert RetentionConfig.AUDIT_LOGS > RetentionConfig.USER_DATA


# =============================================================================
# RetentionService.archive_expired_audit_logs
# =============================================================================


class TestArchiveExpiredAuditLogs:
    @pytest.mark.unit
    async def test_successful_archival(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = 42
        mock_client.rpc.return_value.execute.return_value = mock_result

        with patch(
            "app.services.retention_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await RetentionService.archive_expired_audit_logs()
            assert result["status"] == "success"
            assert result["archived_count"] == 42

    @pytest.mark.unit
    async def test_archival_failure(self) -> None:
        with patch(
            "app.services.retention_service.get_admin_supabase_client",
            side_effect=RuntimeError("db error"),
        ):
            result = await RetentionService.archive_expired_audit_logs()
            assert result["status"] == "failed"
            assert "error" in result

    @pytest.mark.unit
    async def test_archival_no_data(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = None
        mock_client.rpc.return_value.execute.return_value = mock_result

        with patch(
            "app.services.retention_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await RetentionService.archive_expired_audit_logs()
            assert result["status"] == "success"
            # When data is None, code uses `result.data if result.data else 0`
            assert result["archived_count"] == 0


# =============================================================================
# RetentionService.export_user_data
# =============================================================================


class TestExportUserData:
    @pytest.mark.unit
    async def test_successful_export(self) -> None:
        mock_client = MagicMock()

        # Mock all table queries to return empty data
        mock_execute = MagicMock()
        mock_execute.data = []

        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_execute
        mock_client.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = mock_execute

        with patch(
            "app.services.retention_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await RetentionService.export_user_data("user-1")
            assert result["status"] == "success"
            assert "data" in result
            assert result["data"]["user_id"] == "user-1"

    @pytest.mark.unit
    async def test_export_failure_raises(self) -> None:
        with (
            patch(
                "app.services.retention_service.get_admin_supabase_client",
                side_effect=RuntimeError("connection failed"),
            ),
            pytest.raises(RuntimeError),
        ):
            await RetentionService.export_user_data("user-1")


# =============================================================================
# RetentionService.request_data_deletion
# =============================================================================


class TestRequestDataDeletion:
    @pytest.mark.unit
    async def test_full_deletion_request(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "del-req-1"}]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with patch(
            "app.services.retention_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await RetentionService.request_data_deletion(
                user_id="user-1",
                request_type="full_deletion",
                reason="GDPR request",
            )
            assert result["status"] == "success"
            assert result["request_id"] == "del-req-1"
            assert "30 days" in result["message"]

    @pytest.mark.unit
    async def test_partial_deletion_request(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "del-req-2"}]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with patch(
            "app.services.retention_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await RetentionService.request_data_deletion(
                user_id="user-1",
                request_type="partial_deletion",
                data_types=["analytics", "feedback"],
            )
            assert result["status"] == "success"

    @pytest.mark.unit
    async def test_full_deletion_auto_populates_data_types(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "del-req-3"}]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with patch(
            "app.services.retention_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            await RetentionService.request_data_deletion(
                user_id="user-1",
                request_type="full_deletion",
            )
            insert_call = mock_client.table.return_value.insert
            request_data = insert_call.call_args[0][0]
            assert "audit_logs" in request_data["data_types"]
            assert "analytics" in request_data["data_types"]

    @pytest.mark.unit
    async def test_request_failure_raises(self) -> None:
        with (
            patch(
                "app.services.retention_service.get_admin_supabase_client",
                side_effect=RuntimeError("db error"),
            ),
            pytest.raises(RuntimeError),
        ):
            await RetentionService.request_data_deletion(user_id="user-1")


# =============================================================================
# RetentionService.process_deletion_request
# =============================================================================


class TestProcessDeletionRequest:
    @pytest.mark.unit
    async def test_successful_full_deletion(self) -> None:
        mock_client = MagicMock()

        # Mock fetching the deletion request
        mock_request_result = MagicMock()
        mock_request_result.data = [
            {
                "id": "req-1",
                "user_id": "user-1",
                "request_type": "full_deletion",
                "data_types": ["analytics"],
            }
        ]
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_request_result

        # Mock update calls
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

        # Mock delete operation
        mock_delete_result = MagicMock()
        mock_delete_result.data = [{"id": "row-1"}]
        mock_client.table.return_value.delete.return_value.eq.return_value.execute.return_value = mock_delete_result

        with patch(
            "app.services.retention_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await RetentionService.process_deletion_request(
                request_id="req-1",
                processed_by="admin-1",
            )
            assert result["status"] == "success"
            assert "deletion_summary" in result

    @pytest.mark.unit
    async def test_anonymization_request(self) -> None:
        mock_client = MagicMock()

        # Mock fetching the deletion request
        mock_request_result = MagicMock()
        mock_request_result.data = [
            {
                "id": "req-2",
                "user_id": "user-2",
                "request_type": "anonymization",
                "data_types": ["audit_logs"],
            }
        ]
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_request_result

        # Mock update calls
        mock_update_result = MagicMock()
        mock_update_result.data = [{"id": "row-1"}]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_update_result

        with patch(
            "app.services.retention_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await RetentionService.process_deletion_request(
                request_id="req-2",
                processed_by="admin-1",
            )
            assert result["status"] == "success"

    @pytest.mark.unit
    async def test_request_not_found(self) -> None:
        mock_client = MagicMock()
        mock_request_result = MagicMock()
        mock_request_result.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_request_result

        with (
            patch(
                "app.services.retention_service.get_admin_supabase_client",
                return_value=mock_client,
            ),
            pytest.raises(ValueError, match="not found"),
        ):
            await RetentionService.process_deletion_request(
                request_id="missing",
                processed_by="admin-1",
            )


# =============================================================================
# RetentionService._delete_data
# =============================================================================


class TestDeleteData:
    @pytest.mark.unit
    async def test_delete_single_table(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "1"}, {"id": "2"}]
        mock_client.table.return_value.delete.return_value.eq.return_value.execute.return_value = mock_result

        count = await RetentionService._delete_data(mock_client, "user-1", "analytics")
        assert count == 2

    @pytest.mark.unit
    async def test_delete_multi_table(self) -> None:
        """Feedback maps to two tables: search_feedback and feature_requests."""
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "1"}]
        mock_client.table.return_value.delete.return_value.eq.return_value.execute.return_value = mock_result

        count = await RetentionService._delete_data(mock_client, "user-1", "feedback")
        # 1 record from each of the 2 tables
        assert count == 2

    @pytest.mark.unit
    async def test_delete_unknown_type(self) -> None:
        mock_client = MagicMock()
        count = await RetentionService._delete_data(
            mock_client, "user-1", "nonexistent_type"
        )
        assert count == 0


# =============================================================================
# RetentionService._anonymize_data
# =============================================================================


class TestAnonymizeData:
    @pytest.mark.unit
    async def test_anonymize_single_table(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "1"}, {"id": "2"}, {"id": "3"}]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_result

        count = await RetentionService._anonymize_data(
            mock_client, "user-1", "analytics"
        )
        assert count == 3
        # Verify that the anonymized ID is a SHA-256 hex prefix (not reversible)
        update_call = mock_client.table.return_value.update
        update_data = update_call.call_args[0][0]
        assert len(update_data["user_id"]) == 16
        # Must not contain original user_id substring
        assert "user-1" not in update_data["user_id"]

    @pytest.mark.unit
    async def test_anonymize_unknown_type(self) -> None:
        mock_client = MagicMock()
        count = await RetentionService._anonymize_data(
            mock_client, "user-1", "nonexistent_type"
        )
        assert count == 0

    @pytest.mark.unit
    async def test_anonymize_multi_table(self) -> None:
        """Feedback maps to two tables."""
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "1"}]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_result

        count = await RetentionService._anonymize_data(
            mock_client, "user-1", "feedback"
        )
        # 1 record from each of the 2 tables
        assert count == 2


# =============================================================================
# Regression: BUG 3 - anonymized ID must be non-reversible and PII scrubbed
# =============================================================================


class TestAnonymizeDataGdprRegression:
    @pytest.mark.unit
    async def test_anonymized_id_is_not_reversible(self) -> None:
        """Anonymized user_id must not contain any substring of the original ID."""
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "1"}]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_result

        original_user_id = "user-abc-12345678-xyz"
        await RetentionService._anonymize_data(
            mock_client, original_user_id, "analytics"
        )

        update_call = mock_client.table.return_value.update
        update_data = update_call.call_args[0][0]
        anonymized_id = update_data["user_id"]

        # Must NOT contain any prefix substring of the original user_id
        assert original_user_id[:8] not in anonymized_id
        assert "user-abc" not in anonymized_id
        # Must be a proper SHA-256 hex prefix
        expected = hashlib.sha256(original_user_id.encode()).hexdigest()[:16]
        assert anonymized_id == expected

    @pytest.mark.unit
    async def test_pii_fields_scrubbed_in_audit_logs(self) -> None:
        """Anonymizing audit_logs must also scrub ip_address and user_agent."""
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "1"}]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_result

        await RetentionService._anonymize_data(mock_client, "user-1", "audit_logs")

        update_call = mock_client.table.return_value.update
        update_data = update_call.call_args[0][0]

        # PII fields must be nullified
        assert "ip_address" in update_data
        assert update_data["ip_address"] is None
        assert "user_agent" in update_data
        assert update_data["user_agent"] is None

    @pytest.mark.unit
    async def test_pii_fields_scrubbed_in_search_queries(self) -> None:
        """Anonymizing search_queries must scrub ip, user_agent, and query content."""
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "1"}]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_result

        await RetentionService._anonymize_data(mock_client, "user-1", "search_queries")

        update_call = mock_client.table.return_value.update
        update_data = update_call.call_args[0][0]

        assert update_data["ip_address"] is None
        assert update_data["user_agent"] is None
        assert update_data["query"] == "[REDACTED]"


# =============================================================================
# Regression: BUG 4 - deletion request must raise on empty result
# =============================================================================


class TestRequestDataDeletionEmptyResult:
    @pytest.mark.unit
    async def test_empty_result_raises_http_exception(self) -> None:
        """When the insert returns no rows, an HTTPException must be raised."""
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = []  # empty -- no rows inserted
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with (
            patch(
                "app.services.retention_service.get_admin_supabase_client",
                return_value=mock_client,
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await RetentionService.request_data_deletion(
                user_id="user-1",
                request_type="full_deletion",
                reason="GDPR request",
            )
        assert exc_info.value.status_code == 500

    @pytest.mark.unit
    async def test_none_result_raises_http_exception(self) -> None:
        """When the insert returns None data, an HTTPException must be raised."""
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = None  # None -- insert failed silently
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with (
            patch(
                "app.services.retention_service.get_admin_supabase_client",
                return_value=mock_client,
            ),
            pytest.raises(HTTPException),
        ):
            await RetentionService.request_data_deletion(
                user_id="user-1",
                request_type="full_deletion",
            )
