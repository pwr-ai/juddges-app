"""Unit tests for app.services.audit_service module.

Tests cover: data sanitization, IP anonymization, audit logging methods,
background task helper, and audit trail retrieval.
"""

from __future__ import annotations

import hashlib
import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi import BackgroundTasks

import app.services.audit_service as audit_service_module
from app.services.audit_service import AuditService, log_audit_background

# =============================================================================
# _sanitize_data
# =============================================================================


class TestSanitizeData:
    @pytest.mark.unit
    def test_redacts_sensitive_dict_keys(self) -> None:
        data = {"username": "alice", "password": "secret123", "api_key": "key-abc"}
        result = AuditService._sanitize_data(data)
        assert result["username"] == "alice"
        assert result["password"] == "[REDACTED]"  # noqa: S105
        assert result["api_key"] == "[REDACTED]"

    @pytest.mark.unit
    def test_redacts_nested_sensitive_keys(self) -> None:
        data = {"outer": {"inner_token": "tok-123", "name": "test"}}
        result = AuditService._sanitize_data(data)
        assert result["outer"]["inner_token"] == "[REDACTED]"  # noqa: S105
        assert result["outer"]["name"] == "test"

    @pytest.mark.unit
    def test_truncates_long_strings(self) -> None:
        long_text = "a" * 60000
        result = AuditService._sanitize_data(long_text)
        assert len(result) < 60000
        assert result.endswith("...[TRUNCATED]")

    @pytest.mark.unit
    def test_short_strings_unchanged(self) -> None:
        assert AuditService._sanitize_data("hello") == "hello"

    @pytest.mark.unit
    def test_max_depth_exceeded(self) -> None:
        result = AuditService._sanitize_data({"a": {"b": "c"}}, max_depth=0)
        assert result == "[MAX_DEPTH_EXCEEDED]"

    @pytest.mark.unit
    def test_list_truncation(self) -> None:
        long_list = list(range(150))
        result = AuditService._sanitize_data(long_list)
        # Should be truncated to 100 items + "[TRUNCATED]"
        assert len(result) == 101
        assert result[-1] == "[TRUNCATED]"

    @pytest.mark.unit
    def test_short_list_unchanged(self) -> None:
        data = [1, 2, 3]
        result = AuditService._sanitize_data(data)
        assert result == [1, 2, 3]

    @pytest.mark.unit
    def test_primitive_passthrough(self) -> None:
        assert AuditService._sanitize_data(42) == 42
        assert AuditService._sanitize_data(None) is None
        assert AuditService._sanitize_data(True) is True

    @pytest.mark.unit
    def test_case_insensitive_key_matching(self) -> None:
        data = {"Authorization": "Bearer xyz", "Credit_Card": "1234"}
        result = AuditService._sanitize_data(data)
        assert result["Authorization"] == "[REDACTED]"
        assert result["Credit_Card"] == "[REDACTED]"

    @pytest.mark.unit
    def test_polish_sensitive_field_pesel(self) -> None:
        data = {"user_pesel": "12345678901"}
        result = AuditService._sanitize_data(data)
        assert result["user_pesel"] == "[REDACTED]"

    @pytest.mark.unit
    def test_bank_account_redacted(self) -> None:
        data = {"bank_account_number": "PL12345678901234567890123456"}
        result = AuditService._sanitize_data(data)
        assert result["bank_account_number"] == "[REDACTED]"


# =============================================================================
# _anonymize_ip
# =============================================================================


class TestAnonymizeIp:
    @pytest.mark.unit
    def test_returns_hash(self) -> None:
        result = AuditService._anonymize_ip("192.168.1.1")
        assert result is not None
        assert len(result) == 16  # First 16 chars of SHA-256
        # Should not contain the original IP
        assert "192.168" not in result

    @pytest.mark.unit
    def test_none_returns_none(self) -> None:
        assert AuditService._anonymize_ip(None) is None

    @pytest.mark.unit
    def test_empty_returns_none(self) -> None:
        assert AuditService._anonymize_ip("") is None

    @pytest.mark.unit
    def test_deterministic(self) -> None:
        result1 = AuditService._anonymize_ip("10.0.0.1")
        result2 = AuditService._anonymize_ip("10.0.0.1")
        assert result1 == result2

    @pytest.mark.unit
    def test_different_ips_produce_different_hashes(self) -> None:
        result1 = AuditService._anonymize_ip("192.168.1.1")
        result2 = AuditService._anonymize_ip("192.168.1.2")
        assert result1 != result2


# =============================================================================
# log_query
# =============================================================================


class TestLogQuery:
    @pytest.mark.unit
    async def test_successful_log(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "audit-log-1"}]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await AuditService.log_query(
                user_id="user-1",
                query="search query",
                response={"answer": "result"},
                model_used="gpt-5-mini",
                duration_ms=150,
            )
            assert result == "audit-log-1"

    @pytest.mark.unit
    async def test_exception_returns_none(self) -> None:
        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            side_effect=RuntimeError("db down"),
        ):
            result = await AuditService.log_query(
                user_id="user-1",
                query="test",
                response={},
            )
            assert result is None

    @pytest.mark.unit
    async def test_user_agent_truncated(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "audit-log-2"}]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        long_ua = "x" * 1000

        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            await AuditService.log_query(
                user_id="user-1",
                query="test",
                response={},
                user_agent=long_ua,
            )
            # Verify the user_agent was truncated in the insert call
            insert_call = mock_client.table.return_value.insert
            log_entry = insert_call.call_args[0][0]
            assert len(log_entry["user_agent"]) == 500


# =============================================================================
# log_document_access
# =============================================================================


class TestLogDocumentAccess:
    @pytest.mark.unit
    async def test_view_action(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "log-doc-1"}]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await AuditService.log_document_access(
                user_id="user-1",
                document_id="doc-123",
                action="view",
            )
            assert result == "log-doc-1"
            log_entry = mock_client.table.return_value.insert.call_args[0][0]
            assert log_entry["action_type"] == "document_view"

    @pytest.mark.unit
    async def test_download_action_type(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "log-doc-2"}]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            await AuditService.log_document_access(
                user_id="user-1",
                document_id="doc-456",
                action="download",
            )
            log_entry = mock_client.table.return_value.insert.call_args[0][0]
            assert log_entry["action_type"] == "document_download"

    @pytest.mark.unit
    async def test_exception_returns_none(self) -> None:
        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            side_effect=RuntimeError("db down"),
        ):
            result = await AuditService.log_document_access(
                user_id="user-1",
                document_id="doc-1",
                action="view",
            )
            assert result is None


# =============================================================================
# log_export
# =============================================================================


class TestLogExport:
    @pytest.mark.unit
    async def test_successful_export_log(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "log-exp-1"}]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await AuditService.log_export(
                user_id="user-1",
                export_type="audit_trail",
            )
            assert result == "log-exp-1"

    @pytest.mark.unit
    async def test_export_failure_returns_none(self) -> None:
        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            side_effect=RuntimeError("error"),
        ):
            result = await AuditService.log_export(
                user_id="user-1",
                export_type="user_data",
            )
            assert result is None


# =============================================================================
# log_action (generic)
# =============================================================================


class TestLogAction:
    @pytest.mark.unit
    async def test_generic_action(self) -> None:
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "log-action-1"}]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await AuditService.log_action(
                user_id="user-1",
                action_type="custom_action",
                input_data={"key": "value"},
                resource_type="document",
                resource_id="doc-789",
                http_method="POST",
                http_status_code=200,
                api_endpoint="/api/test",
            )
            assert result == "log-action-1"

    @pytest.mark.unit
    async def test_action_failure_returns_none(self) -> None:
        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            side_effect=RuntimeError("db error"),
        ):
            result = await AuditService.log_action(
                user_id="user-1",
                action_type="test",
            )
            assert result is None


# =============================================================================
# get_user_audit_trail
# =============================================================================


class TestGetUserAuditTrail:
    @pytest.mark.unit
    async def test_successful_retrieval(self) -> None:
        mock_client = MagicMock()

        # Mock the main query chain
        mock_query = MagicMock()
        mock_query.eq.return_value = mock_query
        mock_query.gte.return_value = mock_query
        mock_query.lte.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.range.return_value = mock_query

        mock_result = MagicMock()
        mock_result.data = [{"id": "log-1", "action_type": "query"}]
        mock_query.execute.return_value = mock_result

        mock_client.table.return_value.select.return_value = mock_query

        # Mock count query
        mock_count_result = MagicMock()
        mock_count_result.count = 1
        mock_count_result.data = [{"id": "log-1"}]

        with patch(
            "app.services.audit_service.get_admin_supabase_client",
            return_value=mock_client,
        ):
            result = await AuditService.get_user_audit_trail(
                user_id="user-1",
                action_types=["query"],
                limit=50,
            )
            assert result["user_id"] == "user-1"
            assert "audit_logs" in result
            assert result["limit"] == 50

    @pytest.mark.unit
    async def test_retrieval_failure_raises(self) -> None:
        with (
            patch(
                "app.services.audit_service.get_admin_supabase_client",
                side_effect=RuntimeError("db unavailable"),
            ),
            pytest.raises(RuntimeError),
        ):
            await AuditService.get_user_audit_trail(user_id="user-1")


# =============================================================================
# log_audit_background
# =============================================================================


class TestLogAuditBackground:
    @pytest.mark.unit
    def test_adds_background_task(self) -> None:
        bg_tasks = BackgroundTasks()
        log_audit_background(
            bg_tasks,
            user_id="user-1",
            action_type="query",
            input_data={"q": "search"},
        )
        # BackgroundTasks stores tasks internally
        assert len(bg_tasks.tasks) == 1


# =============================================================================
# Regression: BUG 5 - salt must come from env var
# =============================================================================


class TestAnonymizeIpSaltFromEnv:
    @pytest.mark.unit
    def test_salt_from_env_var(self) -> None:
        """When AUDIT_HASH_SALT env var is set, _anonymize_ip must use it."""
        custom_salt = "my_custom_secure_salt_value"

        # Reset the cached salt so it gets re-read
        audit_service_module._AUDIT_HASH_SALT = None

        with patch.dict(os.environ, {"AUDIT_HASH_SALT": custom_salt}):
            result = AuditService._anonymize_ip("192.168.1.1")

        # Verify the result matches using the custom salt
        expected = hashlib.sha256(f"192.168.1.1{custom_salt}".encode()).hexdigest()[:16]
        assert result == expected

        # Clean up cached salt for other tests
        audit_service_module._AUDIT_HASH_SALT = None

    @pytest.mark.unit
    def test_default_salt_used_when_env_not_set(self) -> None:
        """When AUDIT_HASH_SALT env var is absent, the default salt is used."""
        # Reset the cached salt
        audit_service_module._AUDIT_HASH_SALT = None

        with patch.dict(os.environ, {}, clear=False):
            # Remove the env var if present
            os.environ.pop("AUDIT_HASH_SALT", None)
            result = AuditService._anonymize_ip("10.0.0.1")

        default_salt = audit_service_module._DEFAULT_AUDIT_SALT
        expected = hashlib.sha256(f"10.0.0.1{default_salt}".encode()).hexdigest()[:16]
        assert result == expected

        # Clean up
        audit_service_module._AUDIT_HASH_SALT = None

    @pytest.mark.unit
    def test_different_salts_produce_different_hashes(self) -> None:
        """Different salt values must produce different hashes for the same IP."""
        ip = "172.16.0.1"

        audit_service_module._AUDIT_HASH_SALT = None
        with patch.dict(os.environ, {"AUDIT_HASH_SALT": "salt_a"}):
            result_a = AuditService._anonymize_ip(ip)

        audit_service_module._AUDIT_HASH_SALT = None
        with patch.dict(os.environ, {"AUDIT_HASH_SALT": "salt_b"}):
            result_b = AuditService._anonymize_ip(ip)

        assert result_a != result_b

        # Clean up
        audit_service_module._AUDIT_HASH_SALT = None
