"""
Data Retention Service Module

Manages data retention policies and cleanup operations for GDPR compliance.
Implements configurable retention periods for different data types.

This service provides:
- Scheduled cleanup jobs
- Data archival before deletion
- User data export (GDPR right to data portability)
- GDPR right to erasure (data deletion)

Author: Juddges Backend Team
Date: 2025-10-12
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from loguru import logger
from supabase import Client

from app.core.auth_jwt import get_admin_supabase_client


class RetentionConfig:
    """
    Configuration for data retention periods.

    These retention periods are based on legal requirements (GDPR, tax law)
    and can be customized per data type.
    """

    # Retention periods in days
    AUDIT_LOGS = 2555  # 7 years (legal requirement)
    USER_DATA = 1095  # 3 years after last activity
    CHAT_HISTORY = 365  # 1 year (configurable by user)
    ANALYTICS_DATA = 730  # 2 years
    FEEDBACK_DATA = 1095  # 3 years
    TEMPORARY_ANALYSIS = 90  # 90 days
    SESSION_DATA = 30  # 30 days

    @staticmethod
    def get_retention_period(data_type: str) -> int:
        """
        Get retention period for a specific data type.

        Args:
            data_type: Type of data

        Returns:
            Retention period in days
        """
        mapping = {
            "audit_logs": RetentionConfig.AUDIT_LOGS,
            "user_data": RetentionConfig.USER_DATA,
            "chat_history": RetentionConfig.CHAT_HISTORY,
            "analytics": RetentionConfig.ANALYTICS_DATA,
            "feedback": RetentionConfig.FEEDBACK_DATA,
            "temporary_data": RetentionConfig.TEMPORARY_ANALYSIS,
            "session_data": RetentionConfig.SESSION_DATA,
        }
        return mapping.get(data_type, RetentionConfig.USER_DATA)


class RetentionService:
    """
    Service for managing data retention and cleanup operations.
    """

    @staticmethod
    async def archive_expired_audit_logs() -> Dict[str, Any]:
        """
        Archive expired audit logs (mark for archival, don't delete).

        Audit logs are marked as archived but not deleted to maintain
        compliance with legal requirements. Actual deletion requires
        manual approval after archival.

        Returns:
            Dictionary with archival statistics
        """
        try:
            client = get_admin_supabase_client()

            # Call the database function to archive logs
            result = client.rpc("archive_expired_audit_logs").execute()

            archived_count = result.data if result.data else 0

            logger.info(f"Archived {archived_count} expired audit logs")

            return {
                "status": "success",
                "archived_count": archived_count,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.error(f"Failed to archive expired audit logs: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    @staticmethod
    async def export_user_data(user_id: str, format: str = "json") -> Dict[str, Any]:
        """
        Export all user data for GDPR compliance (right to data portability).

        Exports:
        - User consent records
        - Audit logs (sanitized)
        - Analytics events
        - Feedback submissions
        - Search queries

        Args:
            user_id: User identifier
            format: Export format ('json' or 'csv')

        Returns:
            Dictionary with exported data
        """
        try:
            client = get_admin_supabase_client()

            export_data = {
                "user_id": user_id,
                "export_date": datetime.now(timezone.utc).isoformat(),
                "format": format,
            }

            # Export user consent
            consent_result = (
                client.table("user_consent")
                .select("*")
                .eq("user_id", user_id)
                .execute()
            )
            export_data["consent"] = consent_result.data

            # Export audit logs (last 2 years for performance)
            two_years_ago = datetime.now(timezone.utc) - timedelta(days=730)
            audit_result = (
                client.table("audit_logs")
                .select(
                    "id, action_type, created_at, resource_type, resource_id, session_id"
                )
                .eq("user_id", user_id)
                .gte("created_at", two_years_ago.isoformat())
                .execute()
            )
            export_data["audit_logs"] = audit_result.data

            # Export analytics events
            events_result = (
                client.table("events").select("*").eq("user_id", user_id).execute()
            )
            export_data["events"] = events_result.data

            # Export search queries
            search_result = (
                client.table("search_queries")
                .select("*")
                .eq("user_id", user_id)
                .execute()
            )
            export_data["search_queries"] = search_result.data

            # Export feedback
            feedback_result = (
                client.table("search_feedback")
                .select("*")
                .eq("user_id", user_id)
                .execute()
            )
            export_data["feedback"] = feedback_result.data

            feature_feedback_result = (
                client.table("feature_requests")
                .select("*")
                .eq("user_id", user_id)
                .execute()
            )
            export_data["feature_requests"] = feature_feedback_result.data

            logger.info(f"Exported user data for user {user_id} (format: {format})")

            return {
                "status": "success",
                "data": export_data,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.error(f"Failed to export user data for user {user_id}: {e}")
            raise

    @staticmethod
    async def request_data_deletion(
        user_id: str,
        request_type: str = "full_deletion",
        data_types: Optional[List[str]] = None,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a data deletion request (GDPR right to erasure).

        This creates a deletion request that must be processed by an administrator.
        It does not immediately delete data to ensure proper review.

        Args:
            user_id: User identifier
            request_type: Type of deletion ('full_deletion', 'partial_deletion', 'anonymization')
            data_types: List of data types to delete (for partial deletion)
            reason: Reason for deletion request

        Returns:
            Dictionary with deletion request details
        """
        try:
            client = get_admin_supabase_client()

            # Default to all data types for full deletion
            if request_type == "full_deletion" and not data_types:
                data_types = [
                    "audit_logs",
                    "analytics",
                    "feedback",
                    "search_queries",
                    "user_consent",
                ]

            # Create deletion request
            deletion_request = {
                "user_id": user_id,
                "request_type": request_type,
                "data_types": data_types or [],
                "reason": reason,
                "status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            result = (
                client.table("data_deletion_requests")
                .insert(deletion_request)
                .execute()
            )

            if result.data:
                request_id = result.data[0].get("id")
                logger.info(
                    f"Created data deletion request {request_id} for user {user_id} "
                    f"(type: {request_type})"
                )

                return {
                    "status": "success",
                    "request_id": request_id,
                    "message": "Data deletion request created. It will be processed within 30 days as required by GDPR.",
                    "request_details": result.data[0],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }

        except Exception as e:
            logger.error(
                f"Failed to create data deletion request for user {user_id}: {e}"
            )
            raise

    @staticmethod
    async def process_deletion_request(
        request_id: str, processed_by: str
    ) -> Dict[str, Any]:
        """
        Process a data deletion request (admin only).

        This actually deletes or anonymizes the user data based on the request type.

        Args:
            request_id: Deletion request ID
            processed_by: Admin user processing the request

        Returns:
            Dictionary with processing results
        """
        try:
            client = get_admin_supabase_client()

            # Get the deletion request
            request_result = (
                client.table("data_deletion_requests")
                .select("*")
                .eq("id", request_id)
                .execute()
            )

            if not request_result.data:
                raise ValueError(f"Deletion request {request_id} not found")

            request = request_result.data[0]
            user_id = request["user_id"]
            request_type = request["request_type"]
            data_types = request["data_types"]

            # Update request status
            client.table("data_deletion_requests").update(
                {
                    "status": "in_progress",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "processed_by": processed_by,
                }
            ).eq("id", request_id).execute()

            deletion_summary = {}

            # Process deletion based on type
            if request_type == "anonymization":
                # Anonymize user data instead of deleting
                for data_type in data_types:
                    count = await RetentionService._anonymize_data(
                        client, user_id, data_type
                    )
                    deletion_summary[data_type] = f"anonymized {count} records"

            else:
                # Delete data (full or partial)
                for data_type in data_types:
                    count = await RetentionService._delete_data(
                        client, user_id, data_type
                    )
                    deletion_summary[data_type] = f"deleted {count} records"

            # Update request as completed
            client.table("data_deletion_requests").update(
                {
                    "status": "completed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "deletion_summary": deletion_summary,
                }
            ).eq("id", request_id).execute()

            logger.info(
                f"Processed deletion request {request_id} for user {user_id} "
                f"(type: {request_type}, processed by: {processed_by})"
            )

            return {
                "status": "success",
                "request_id": request_id,
                "deletion_summary": deletion_summary,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.error(f"Failed to process deletion request {request_id}: {e}")

            # Update request as failed
            try:
                client.table("data_deletion_requests").update(
                    {"status": "failed", "error_message": str(e)}
                ).eq("id", request_id).execute()
            except Exception:
                pass

            raise

    @staticmethod
    async def _delete_data(client: Client, user_id: str, data_type: str) -> int:
        """
        Delete specific data type for a user.

        Args:
            client: Supabase client
            user_id: User identifier
            data_type: Type of data to delete

        Returns:
            Number of records deleted
        """
        table_mapping = {
            "audit_logs": "audit_logs",
            "analytics": "events",
            "feedback": ["search_feedback", "feature_requests"],
            "search_queries": "search_queries",
            "user_consent": "user_consent",
        }

        table_names = table_mapping.get(data_type)
        if not table_names:
            logger.warning(f"Unknown data type for deletion: {data_type}")
            return 0

        if isinstance(table_names, str):
            table_names = [table_names]

        total_deleted = 0
        for table_name in table_names:
            result = client.table(table_name).delete().eq("user_id", user_id).execute()
            count = len(result.data) if result.data else 0
            total_deleted += count
            logger.info(f"Deleted {count} records from {table_name} for user {user_id}")

        return total_deleted

    @staticmethod
    async def _anonymize_data(client: Client, user_id: str, data_type: str) -> int:
        """
        Anonymize specific data type for a user.

        Args:
            client: Supabase client
            user_id: User identifier
            data_type: Type of data to anonymize

        Returns:
            Number of records anonymized
        """
        # For anonymization, we replace user_id with an anonymized hash
        anonymized_id = f"anonymized_{user_id[:8]}"

        table_mapping = {
            "audit_logs": "audit_logs",
            "analytics": "events",
            "feedback": ["search_feedback", "feature_requests"],
            "search_queries": "search_queries",
        }

        table_names = table_mapping.get(data_type)
        if not table_names:
            logger.warning(f"Unknown data type for anonymization: {data_type}")
            return 0

        if isinstance(table_names, str):
            table_names = [table_names]

        total_anonymized = 0
        for table_name in table_names:
            result = (
                client.table(table_name)
                .update({"user_id": anonymized_id})
                .eq("user_id", user_id)
                .execute()
            )

            count = len(result.data) if result.data else 0
            total_anonymized += count
            logger.info(
                f"Anonymized {count} records in {table_name} for user {user_id}"
            )

        return total_anonymized


logger.info("Retention service module initialized")
