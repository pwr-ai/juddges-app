"""
Audit Service Module

Provides comprehensive audit logging functionality for legal compliance.
All user interactions with the AI system are logged for 7-year retention.

This service implements:
- Async audit logging (non-blocking)
- Data sanitization (removes sensitive information)
- IP address anonymization
- Query and response logging
- Document access tracking
- Export tracking

Author: Juddges Backend Team
Date: 2025-10-12
"""

import hashlib
import os
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import BackgroundTasks
from loguru import logger

from app.core.auth_jwt import get_admin_supabase_client

# Default salt for development only -- in production, set the AUDIT_HASH_SALT env var
_DEFAULT_AUDIT_SALT = "juddges_audit_salt_2025_default"
_AUDIT_HASH_SALT: str | None = None  # resolved lazily


class AuditService:
    """
    Service for creating and managing audit logs.

    This service provides methods to log various user actions and system events
    for legal compliance and security auditing.
    """

    # Maximum length for stored strings to prevent abuse
    MAX_INPUT_LENGTH = 50000  # ~50KB of text
    MAX_OUTPUT_LENGTH = 50000

    # Sensitive fields to redact from logs
    SENSITIVE_FIELDS = {
        "password",
        "token",
        "api_key",
        "secret",
        "authorization",
        "cookie",
        "session_token",
        "refresh_token",
        "private_key",
        "credit_card",
        "ssn",
        "pesel",
        "bank_account",
    }

    @staticmethod
    def _sanitize_data(data: Any, max_depth: int = 5) -> Any:
        """
        Sanitize data by removing sensitive information.

        Args:
            data: Data to sanitize (dict, list, or primitive)
            max_depth: Maximum recursion depth

        Returns:
            Sanitized data with sensitive fields redacted
        """
        if max_depth <= 0:
            return "[MAX_DEPTH_EXCEEDED]"

        if isinstance(data, dict):
            sanitized = {}
            for key, value in data.items():
                # Check if key contains sensitive information
                key_lower = key.lower()
                if any(
                    sensitive in key_lower
                    for sensitive in AuditService.SENSITIVE_FIELDS
                ):
                    sanitized[key] = "[REDACTED]"
                else:
                    sanitized[key] = AuditService._sanitize_data(value, max_depth - 1)
            return sanitized

        if isinstance(data, list):
            # Limit list size to prevent abuse
            if len(data) > 100:
                return [
                    AuditService._sanitize_data(item, max_depth - 1)
                    for item in data[:100]
                ] + ["[TRUNCATED]"]
            return [AuditService._sanitize_data(item, max_depth - 1) for item in data]

        if isinstance(data, str):
            # Truncate very long strings
            if len(data) > AuditService.MAX_INPUT_LENGTH:
                return data[: AuditService.MAX_INPUT_LENGTH] + "...[TRUNCATED]"
            return data

        # Return primitive types as-is
        return data

    @staticmethod
    def _anonymize_ip(ip_address: str | None) -> str | None:
        """
        Anonymize IP address by hashing it.

        This maintains uniqueness for analytics while protecting privacy.

        Args:
            ip_address: IP address to anonymize

        Returns:
            Hashed IP address or None
        """
        if not ip_address:
            return None

        # Read salt from environment variable, falling back to a default for dev
        global _AUDIT_HASH_SALT
        if _AUDIT_HASH_SALT is None:
            _AUDIT_HASH_SALT = os.environ.get("AUDIT_HASH_SALT", _DEFAULT_AUDIT_SALT)
            if _AUDIT_HASH_SALT == _DEFAULT_AUDIT_SALT:
                logger.warning(
                    "AUDIT_HASH_SALT env var is not set -- using default salt. "
                    "Set AUDIT_HASH_SALT in production for secure IP anonymization."
                )

        hashed = hashlib.sha256(f"{ip_address}{_AUDIT_HASH_SALT}".encode()).hexdigest()
        return hashed[:16]  # First 16 chars for brevity

    @staticmethod
    async def log_query(
        user_id: str,
        query: str,
        response: dict[str, Any],
        session_id: str | None = None,
        model_used: str | None = None,
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        duration_ms: int | None = None,
    ) -> str | None:
        """
        Log a user query and AI response.

        Args:
            user_id: User identifier
            query: Search/question query
            response: AI response data
            session_id: Session identifier
            model_used: AI model used (e.g., 'gpt-4', 'gemini-pro')
            metadata: Additional metadata
            ip_address: Client IP address (will be anonymized)
            user_agent: Client user agent
            duration_ms: Request duration in milliseconds

        Returns:
            Audit log ID or None if logging failed
        """
        try:
            client = get_admin_supabase_client()

            # Sanitize input and output data
            input_data = AuditService._sanitize_data(
                {"query": query, "metadata": metadata or {}}
            )

            output_data = AuditService._sanitize_data(response)

            # Create audit log entry
            log_entry = {
                "user_id": user_id,
                "session_id": session_id,
                "action_type": "query",
                "input_data": input_data,
                "output_data": output_data,
                "model_used": model_used,
                "ip_address": AuditService._anonymize_ip(ip_address),
                "user_agent": user_agent[:500]
                if user_agent
                else None,  # Truncate user agent
                "request_duration_ms": duration_ms,
                "resource_type": "query",
                "created_at": datetime.now(UTC).isoformat(),
            }

            result = client.table("audit_logs").insert(log_entry).execute()

            if result.data:
                audit_id = result.data[0].get("id")
                logger.debug(
                    f"Audit log created: {audit_id} (user: {user_id}, action: query)"
                )
                return audit_id

        except Exception as e:
            logger.error(f"Failed to create audit log for query: {e}")
            # Don't raise - audit logging should never break the application
            return None

    @staticmethod
    async def log_document_access(
        user_id: str,
        document_id: str,
        action: str,  # 'view', 'download', 'upload'
        session_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> str | None:
        """
        Log document access (view, download, upload).

        Args:
            user_id: User identifier
            document_id: Document identifier
            action: Action type ('view', 'download', 'upload')
            session_id: Session identifier
            metadata: Additional metadata (e.g., document title, type)
            ip_address: Client IP address (will be anonymized)

        Returns:
            Audit log ID or None if logging failed
        """
        try:
            client = get_admin_supabase_client()

            # Map action to audit action type
            action_type_map = {
                "view": "document_view",
                "download": "document_download",
                "upload": "document_upload",
            }
            action_type = action_type_map.get(action, "document_view")

            # Create audit log entry
            log_entry = {
                "user_id": user_id,
                "session_id": session_id,
                "action_type": action_type,
                "input_data": AuditService._sanitize_data(
                    {"document_id": document_id, "metadata": metadata or {}}
                ),
                "output_data": {},
                "ip_address": AuditService._anonymize_ip(ip_address),
                "resource_type": "document",
                "resource_id": document_id,
                "created_at": datetime.now(UTC).isoformat(),
            }

            result = client.table("audit_logs").insert(log_entry).execute()

            if result.data:
                audit_id = result.data[0].get("id")
                logger.debug(
                    f"Audit log created: {audit_id} (user: {user_id}, action: {action_type})"
                )
                return audit_id

        except Exception as e:
            logger.error(f"Failed to create audit log for document access: {e}")
            return None

    @staticmethod
    async def log_export(
        user_id: str,
        export_type: str,  # 'audit_trail', 'user_data', 'analysis_results'
        data_range: dict[str, str] | None = None,
        session_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> str | None:
        """
        Log data export operations.

        Args:
            user_id: User identifier
            export_type: Type of export
            data_range: Date range for export (start_date, end_date)
            session_id: Session identifier
            metadata: Additional metadata
            ip_address: Client IP address (will be anonymized)

        Returns:
            Audit log ID or None if logging failed
        """
        try:
            client = get_admin_supabase_client()

            # Create audit log entry
            log_entry = {
                "user_id": user_id,
                "session_id": session_id,
                "action_type": "export",
                "input_data": AuditService._sanitize_data(
                    {
                        "export_type": export_type,
                        "data_range": data_range or {},
                        "metadata": metadata or {},
                    }
                ),
                "output_data": {},
                "ip_address": AuditService._anonymize_ip(ip_address),
                "resource_type": "export",
                "created_at": datetime.now(UTC).isoformat(),
            }

            result = client.table("audit_logs").insert(log_entry).execute()

            if result.data:
                audit_id = result.data[0].get("id")
                logger.debug(
                    f"Audit log created: {audit_id} (user: {user_id}, action: export)"
                )
                return audit_id

        except Exception as e:
            logger.error(f"Failed to create audit log for export: {e}")
            return None

    @staticmethod
    async def log_action(
        user_id: str,
        action_type: str,
        input_data: dict[str, Any] | None = None,
        output_data: dict[str, Any] | None = None,
        session_id: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        model_used: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        duration_ms: int | None = None,
        http_method: str | None = None,
        http_status_code: int | None = None,
        api_endpoint: str | None = None,
        error_message: str | None = None,
    ) -> str | None:
        """
        Generic method to log any user action.

        Args:
            user_id: User identifier
            action_type: Type of action (must be one of the allowed types)
            input_data: Input data for the action
            output_data: Output data from the action
            session_id: Session identifier
            resource_type: Type of resource affected
            resource_id: ID of resource affected
            model_used: AI model used
            ip_address: Client IP address (will be anonymized)
            user_agent: Client user agent
            duration_ms: Request duration in milliseconds
            http_method: HTTP method (GET, POST, etc.)
            http_status_code: HTTP status code
            api_endpoint: API endpoint called
            error_message: Error message if action failed

        Returns:
            Audit log ID or None if logging failed
        """
        try:
            client = get_admin_supabase_client()

            # Create audit log entry
            log_entry = {
                "user_id": user_id,
                "session_id": session_id,
                "action_type": action_type,
                "input_data": AuditService._sanitize_data(input_data or {}),
                "output_data": AuditService._sanitize_data(output_data or {}),
                "model_used": model_used,
                "ip_address": AuditService._anonymize_ip(ip_address),
                "user_agent": user_agent[:500] if user_agent else None,
                "request_duration_ms": duration_ms,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "http_method": http_method,
                "http_status_code": http_status_code,
                "api_endpoint": api_endpoint,
                "error_message": error_message,
                "created_at": datetime.now(UTC).isoformat(),
            }

            result = client.table("audit_logs").insert(log_entry).execute()

            if result.data:
                audit_id = result.data[0].get("id")
                logger.debug(
                    f"Audit log created: {audit_id} (user: {user_id}, action: {action_type})"
                )
                return audit_id

        except Exception as e:
            logger.error(f"Failed to create audit log for action '{action_type}': {e}")
            return None

    @staticmethod
    async def get_user_audit_trail(
        user_id: str,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        action_types: list[str] | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        """
        Retrieve audit trail for a specific user.

        Args:
            user_id: User identifier
            start_date: Start date for filtering (default: 90 days ago)
            end_date: End date for filtering (default: now)
            action_types: Filter by specific action types
            limit: Maximum number of records to return
            offset: Pagination offset

        Returns:
            Dictionary with audit trail data and metadata
        """
        try:
            client = get_admin_supabase_client()

            # Set default date range
            if not start_date:
                start_date = datetime.now(UTC) - timedelta(days=90)
            if not end_date:
                end_date = datetime.now(UTC)

            # Build query
            query = (
                client.table("audit_logs")
                .select(
                    "id, user_id, action_type, resource_type, resource_id, "
                    "session_id, ip_address, user_agent, created_at"
                )
                .eq("user_id", user_id)
            )

            # Apply filters
            query = query.gte("created_at", start_date.isoformat())
            query = query.lte("created_at", end_date.isoformat())

            if action_types:
                query = query.in_("action_type", action_types)

            # Execute query with pagination
            result = (
                query.order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )

            # Get total count (for pagination)
            count_query = (
                client.table("audit_logs")
                .select("id", count="exact")
                .eq("user_id", user_id)
            )
            count_query = count_query.gte("created_at", start_date.isoformat())
            count_query = count_query.lte("created_at", end_date.isoformat())
            if action_types:
                count_query = count_query.in_("action_type", action_types)

            count_result = count_query.execute()
            total_count = (
                count_result.count
                if hasattr(count_result, "count")
                else len(result.data)
            )

            logger.info(
                f"Retrieved audit trail for user {user_id}: {len(result.data)} records"
            )

            return {
                "user_id": user_id,
                "audit_logs": result.data,
                "total_count": total_count,
                "limit": limit,
                "offset": offset,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            }

        except Exception as e:
            logger.error(f"Failed to retrieve audit trail for user {user_id}: {e}")
            raise


# Background task helper for non-blocking audit logging
def log_audit_background(
    background_tasks: BackgroundTasks, user_id: str, action_type: str, **kwargs
):
    """
    Add audit logging as a background task (non-blocking).

    Usage:
        from fastapi import BackgroundTasks

        @router.post("/some-endpoint")
        async def endpoint(background_tasks: BackgroundTasks):
            log_audit_background(
                background_tasks,
                user_id="user-123",
                action_type="query",
                input_data={"query": "tax question"},
                ...
            )

    Args:
        background_tasks: FastAPI BackgroundTasks instance
        user_id: User identifier
        action_type: Action type
        **kwargs: Additional arguments for AuditService.log_action()
    """
    background_tasks.add_task(
        AuditService.log_action, user_id=user_id, action_type=action_type, **kwargs
    )


logger.info("Audit service module initialized")
