"""
Audit Trail API Endpoints

Provides user access to their own audit trail for transparency and compliance.
Users can view and export their activity history.

Author: Juddges Backend Team
Date: 2025-10-12
"""

import csv
import io
import json
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.services.audit_service import AuditService

# Router configuration
router = APIRouter(prefix="/api/audit", tags=["Audit Trail"])


# ===== Models =====


class AuditLogEntry(BaseModel):
    """Single audit log entry."""

    id: str = Field(description="Audit log ID")
    action_type: str = Field(description="Type of action performed")
    created_at: str = Field(description="Timestamp (ISO 8601)")
    resource_type: str | None = Field(None, description="Type of resource affected")
    resource_id: str | None = Field(None, description="ID of resource affected")
    session_id: str | None = Field(None, description="Session identifier")
    model_used: str | None = Field(None, description="AI model used")
    request_duration_ms: int | None = Field(
        None, description="Request duration in milliseconds"
    )


class AuditTrailResponse(BaseModel):
    """Response model for audit trail retrieval."""

    user_id: str = Field(description="User identifier")
    audit_logs: list[AuditLogEntry] = Field(description="List of audit log entries")
    total_count: int = Field(description="Total number of records matching filters")
    limit: int = Field(description="Page size limit")
    offset: int = Field(description="Pagination offset")
    start_date: str = Field(description="Start date for filtering")
    end_date: str = Field(description="End date for filtering")


class AuditStatistics(BaseModel):
    """Statistics about user activity."""

    user_id: str
    total_actions: int = Field(description="Total number of actions")
    total_sessions: int = Field(description="Number of unique sessions")
    date_range: dict = Field(description="Date range of activity")
    action_breakdown: dict = Field(description="Breakdown by action type")
    most_recent_activity: str | None = Field(
        None, description="Most recent activity timestamp"
    )


# ===== API Endpoints =====


@router.get("/my-activity", response_model=AuditTrailResponse)
async def get_my_audit_trail(
    user: AuthenticatedUser = Depends(get_current_user),
    start_date: str | None = Query(
        None, description="Start date (ISO 8601 format, default: 90 days ago)"
    ),
    end_date: str | None = Query(
        None, description="End date (ISO 8601 format, default: now)"
    ),
    action_types: list[str] | None = Query(
        None, description="Filter by specific action types"
    ),
    limit: int = Query(
        100, ge=1, le=1000, description="Maximum number of records to return"
    ),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """
    Get your own audit trail.

    Retrieves all logged activities for the authenticated user.
    Data includes:
    - Search queries and analyses
    - Document access (views, downloads, uploads)
    - Data exports
    - System interactions

    All sensitive data is sanitized in the audit logs.

    Args:
        user: Authenticated user (from JWT token)
        start_date: Optional start date filter
        end_date: Optional end date filter
        action_types: Optional filter by action types
        limit: Page size (max 1000)
        offset: Pagination offset

    Returns:
        AuditTrailResponse with user's activity history
    """
    try:
        # Parse dates if provided
        start_datetime = None
        end_datetime = None

        if start_date:
            try:
                start_datetime = datetime.fromisoformat(
                    start_date.replace("Z", "+00:00")
                )
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid start_date format. Use ISO 8601 format (e.g., 2024-01-01T00:00:00Z)",
                )

        if end_date:
            try:
                end_datetime = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid end_date format. Use ISO 8601 format (e.g., 2024-12-31T23:59:59Z)",
                )

        # Retrieve audit trail
        result = await AuditService.get_user_audit_trail(
            user_id=user.id,
            start_date=start_datetime,
            end_date=end_datetime,
            action_types=action_types,
            limit=limit,
            offset=offset,
        )

        logger.info(
            f"User {user.id} retrieved audit trail: {len(result['audit_logs'])} records"
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve audit trail for user {user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve audit trail: {e!s}"
        )


@router.get("/my-activity/statistics", response_model=AuditStatistics)
async def get_my_activity_statistics(
    user: AuthenticatedUser = Depends(get_current_user),
    days: int = Query(
        90, ge=1, le=365, description="Number of days to analyze (max 365)"
    ),
):
    """
    Get statistics about your activity.

    Provides a summary of your usage including:
    - Total number of actions
    - Breakdown by action type
    - Session count
    - Most recent activity

    Args:
        user: Authenticated user (from JWT token)
        days: Number of days to analyze

    Returns:
        AuditStatistics with activity summary
    """
    try:
        # Calculate date range
        end_date = datetime.now(UTC)
        start_date = end_date - timedelta(days=days)

        # Get audit trail for statistics
        result = await AuditService.get_user_audit_trail(
            user_id=user.id,
            start_date=start_date,
            end_date=end_date,
            limit=10000,  # Get all for statistics
        )

        audit_logs = result["audit_logs"]

        # Calculate statistics
        total_actions = len(audit_logs)
        unique_sessions = len(
            {log.get("session_id") for log in audit_logs if log.get("session_id")}
        )

        # Breakdown by action type
        action_breakdown = {}
        for log in audit_logs:
            action_type = log.get("action_type", "unknown")
            action_breakdown[action_type] = action_breakdown.get(action_type, 0) + 1

        # Most recent activity
        most_recent = audit_logs[0].get("created_at") if audit_logs else None

        logger.info(
            f"User {user.id} retrieved activity statistics: {total_actions} actions in {days} days"
        )

        return AuditStatistics(
            user_id=user.id,
            total_actions=total_actions,
            total_sessions=unique_sessions,
            date_range={
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "days": days,
            },
            action_breakdown=action_breakdown,
            most_recent_activity=most_recent,
        )

    except Exception as e:
        logger.error(f"Failed to retrieve activity statistics for user {user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve statistics: {e!s}"
        )


@router.get("/my-activity/export")
async def export_my_audit_trail(
    user: AuthenticatedUser = Depends(get_current_user),
    format: Literal["json", "csv"] = Query(
        "json", description="Export format (json or csv)"
    ),
    start_date: str | None = Query(
        None, description="Start date (ISO 8601 format, default: 90 days ago)"
    ),
    end_date: str | None = Query(
        None, description="End date (ISO 8601 format, default: now)"
    ),
):
    """
    Export your audit trail.

    Downloads your complete activity history in JSON or CSV format.
    Useful for record-keeping and compliance purposes.

    Args:
        user: Authenticated user (from JWT token)
        format: Export format ('json' or 'csv')
        start_date: Optional start date filter
        end_date: Optional end date filter

    Returns:
        File download (JSON or CSV)
    """
    try:
        # Parse dates if provided
        start_datetime = None
        end_datetime = None

        if start_date:
            start_datetime = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        if end_date:
            end_datetime = datetime.fromisoformat(end_date.replace("Z", "+00:00"))

        # Retrieve complete audit trail (no pagination limit for export)
        result = await AuditService.get_user_audit_trail(
            user_id=user.id,
            start_date=start_datetime,
            end_date=end_datetime,
            limit=10000,  # Max for export
        )

        audit_logs = result["audit_logs"]

        # Log the export action
        await AuditService.log_export(
            user_id=user.id,
            export_type="audit_trail",
            data_range={
                "start_date": result["start_date"],
                "end_date": result["end_date"],
            },
            metadata={"format": format, "record_count": len(audit_logs)},
        )

        # Generate filename
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        filename = f"audit_trail_{user.id[:8]}_{timestamp}.{format}"

        if format == "json":
            # Export as JSON
            json_data = json.dumps(result, indent=2)

            return Response(
                content=json_data,
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        if format == "csv":
            # Export as CSV
            output = io.StringIO()
            if audit_logs:
                # Get all keys from first log entry
                fieldnames = [
                    "id",
                    "action_type",
                    "created_at",
                    "resource_type",
                    "resource_id",
                    "session_id",
                    "model_used",
                    "request_duration_ms",
                ]

                writer = csv.DictWriter(
                    output, fieldnames=fieldnames, extrasaction="ignore"
                )
                writer.writeheader()

                for log in audit_logs:
                    writer.writerow(log)

            csv_data = output.getvalue()

            return Response(
                content=csv_data,
                media_type="text/csv",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        logger.info(
            f"User {user.id} exported audit trail: {len(audit_logs)} records ({format})"
        )

    except Exception as e:
        logger.error(f"Failed to export audit trail for user {user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to export audit trail: {e!s}"
        )


logger.info("Audit API module initialized")
