"""
Legal and Compliance API

Provides access to legal documents and GDPR compliance features.
Includes data processing agreements, data exports, and deletion requests.

Author: Juddges Backend Team
Date: 2025-10-12
"""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import AuthenticatedUser, get_current_user, get_optional_user
from app.services.retention_service import RetentionConfig, RetentionService

# Router configuration
router = APIRouter(prefix="/api/legal", tags=["Legal & Compliance"])


# ===== Models =====


class DataDeletionRequest(BaseModel):
    """Request for data deletion (GDPR right to erasure)."""

    request_type: Literal["full_deletion", "partial_deletion", "anonymization"] = Field(
        default="full_deletion", description="Type of deletion request"
    )

    data_types: list[str] | None = Field(
        None,
        description="Specific data types to delete (for partial deletion)",
        examples=[["audit_logs", "analytics", "feedback"]],
    )

    reason: str | None = Field(
        None, max_length=500, description="Reason for deletion (optional)"
    )


class DataDeletionResponse(BaseModel):
    """Response for data deletion request."""

    status: Literal["success", "failed"]
    request_id: str | None = None
    message: str
    processing_time: str = Field(
        default="30 days", description="Time frame for processing (GDPR requirement)"
    )


class DataExportResponse(BaseModel):
    """Response for data export request."""

    status: Literal["success", "failed"]
    message: str
    export_data: dict | None = None


class RetentionPolicyInfo(BaseModel):
    """Information about data retention policies."""

    data_type: str
    retention_period_days: int
    retention_period_description: str
    legal_basis: str
    archive_before_delete: bool


class DPAInfoResponse(BaseModel):
    """Data Processing Agreement information."""

    version: str = Field(default="1.0")
    effective_date: str
    data_processor: dict = Field(
        description="Information about data processor (Juddges)"
    )
    data_controller: str = Field(
        default="User", description="Data controller (typically the user)"
    )
    processing_purposes: list[str] = Field(description="Purposes for data processing")
    data_categories: list[str] = Field(
        description="Categories of personal data processed"
    )
    data_subjects: list[str] = Field(description="Categories of data subjects")
    retention_periods: list[RetentionPolicyInfo] = Field(
        description="Data retention periods by category"
    )
    sub_processors: list[dict] = Field(description="List of sub-processors")
    security_measures: list[str] = Field(
        description="Technical and organizational security measures"
    )


# ===== API Endpoints =====


@router.get("/dpa", response_model=DPAInfoResponse)
async def get_dpa_info(user: AuthenticatedUser | None = Depends(get_optional_user)):
    """
    Get Data Processing Agreement (DPA) information.

    Returns comprehensive information about how Juddges processes user data,
    including retention periods, security measures, and sub-processors.

    This is required for GDPR Article 28 compliance.

    Args:
        user: Authenticated user (optional)

    Returns:
        DPAInfoResponse with complete DPA information
    """
    try:
        # Log access if user is authenticated
        if user:
            logger.info(f"User {user.id} accessed DPA information")

        # Define DPA information
        return DPAInfoResponse(
            version="1.0",
            effective_date="2025-01-01",
            data_processor={
                "name": "Juddges",
                "contact": "legal@legal-ai.augustyniak.ai",
                "dpo_email": "dpo@legal-ai.augustyniak.ai",
                "address": "To be determined",
                "registration_number": "To be determined",
            },
            data_controller="User (Individual or Organization using Juddges services)",
            processing_purposes=[
                "Legal research and document analysis",
                "AI-powered search and recommendations",
                "Service improvement and analytics",
                "Compliance and audit trail maintenance",
                "User support and communication",
            ],
            data_categories=[
                "User account information (email, name)",
                "Search queries and analysis requests",
                "Document access history",
                "Usage analytics and session data",
                "User feedback and feature requests",
                "Consent records",
            ],
            data_subjects=[
                "Legal professionals (lawyers, tax advisors)",
                "Individual users seeking legal information",
                "Business users and organizations",
            ],
            retention_periods=[
                RetentionPolicyInfo(
                    data_type="audit_logs",
                    retention_period_days=RetentionConfig.AUDIT_LOGS,
                    retention_period_description="7 years",
                    legal_basis="Tax law and GDPR Art. 6(1)(c) - Legal obligation",
                    archive_before_delete=True,
                ),
                RetentionPolicyInfo(
                    data_type="user_data",
                    retention_period_days=RetentionConfig.USER_DATA,
                    retention_period_description="3 years after last activity",
                    legal_basis="GDPR Art. 6(1)(b) - Contract performance",
                    archive_before_delete=True,
                ),
                RetentionPolicyInfo(
                    data_type="analytics",
                    retention_period_days=RetentionConfig.ANALYTICS_DATA,
                    retention_period_description="2 years",
                    legal_basis="GDPR Art. 6(1)(f) - Legitimate interest",
                    archive_before_delete=True,
                ),
                RetentionPolicyInfo(
                    data_type="chat_history",
                    retention_period_days=RetentionConfig.CHAT_HISTORY,
                    retention_period_description="1 year (configurable)",
                    legal_basis="User consent - GDPR Art. 6(1)(a)",
                    archive_before_delete=True,
                ),
            ],
            sub_processors=[
                {
                    "name": "OpenAI",
                    "purpose": "AI language model processing",
                    "location": "United States",
                    "safeguards": "Standard Contractual Clauses (SCCs)",
                },
                {
                    "name": "Google Cloud / Gemini",
                    "purpose": "AI language model processing",
                    "location": "European Union / United States",
                    "safeguards": "Standard Contractual Clauses (SCCs)",
                },
                {
                    "name": "Supabase",
                    "purpose": "Database, authentication, and vector search services",
                    "location": "European Union",
                    "safeguards": "EU-based infrastructure",
                },
            ],
            security_measures=[
                "End-to-end encryption for data in transit (TLS 1.3)",
                "Encryption at rest for sensitive data",
                "Role-Based Access Control (RBAC) and Row Level Security (RLS)",
                "Regular security audits and penetration testing",
                "Anonymization of IP addresses in audit logs",
                "Data sanitization in audit trails (sensitive data redacted)",
                "Multi-factor authentication (MFA) support",
                "Regular backups with secure storage",
                "Incident response procedures and breach notification",
                "Data minimization and purpose limitation",
                "Staff training on data protection and GDPR",
                "Secure development lifecycle (SDLC) practices",
            ],
        )

    except Exception as e:
        logger.error(f"Failed to retrieve DPA information: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve DPA information: {e!s}"
        )


@router.post("/data-export", response_model=DataExportResponse)
async def request_data_export(
    format: Literal["json", "csv"] = Query("json", description="Export format"),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Export all your personal data (GDPR right to data portability).

    Downloads all data associated with your account including:
    - Consent records
    - Audit logs (last 2 years)
    - Analytics events
    - Search queries
    - Feedback submissions

    This implements GDPR Article 20 (Right to data portability).

    Args:
        format: Export format ('json' or 'csv')
        user: Authenticated user (from JWT token)

    Returns:
        DataExportResponse with exported data
    """
    try:
        logger.info(f"User {user.id} requested data export (format: {format})")

        # Export user data
        result = await RetentionService.export_user_data(user_id=user.id, format=format)

        if result["status"] == "success":
            logger.info(f"Data export successful for user {user.id}")

            return DataExportResponse(
                status="success",
                message="Data exported successfully",
                export_data=result["data"],
            )
        raise Exception("Export failed")

    except Exception as e:
        logger.error(f"Failed to export data for user {user.id}: {e}")
        return DataExportResponse(
            status="failed",
            message=f"Failed to export data: {e!s}",
            export_data=None,
        )


@router.post("/data-deletion", response_model=DataDeletionResponse)
async def request_data_deletion(
    request: DataDeletionRequest, user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Request deletion of your personal data (GDPR right to erasure).

    Creates a data deletion request that will be processed within 30 days
    as required by GDPR Article 17.

    Options:
    - **full_deletion**: Complete account and data deletion
    - **partial_deletion**: Delete specific data types only
    - **anonymization**: Anonymize data instead of deleting (preserves analytics)

    Note: Some data may need to be retained for legal compliance (e.g., audit logs
    for tax purposes). In such cases, data will be anonymized instead of deleted.

    Args:
        request: Data deletion request details
        user: Authenticated user (from JWT token)

    Returns:
        DataDeletionResponse with request status
    """
    try:
        logger.info(
            f"User {user.id} requested data deletion "
            f"(type: {request.request_type}, data_types: {request.data_types})"
        )

        # Create deletion request
        result = await RetentionService.request_data_deletion(
            user_id=user.id,
            request_type=request.request_type,
            data_types=request.data_types,
            reason=request.reason,
        )

        if result["status"] == "success":
            logger.info(
                f"Data deletion request created for user {user.id}: "
                f"{result['request_id']}"
            )

            return DataDeletionResponse(
                status="success",
                request_id=result["request_id"],
                message=result["message"],
                processing_time="30 days (GDPR requirement)",
            )
        raise Exception("Failed to create deletion request")

    except Exception as e:
        logger.error(f"Failed to create data deletion request for user {user.id}: {e}")
        return DataDeletionResponse(
            status="failed",
            request_id=None,
            message=f"Failed to create deletion request: {e!s}",
            processing_time="N/A",
        )


@router.get("/retention-policies", response_model=list[RetentionPolicyInfo])
async def get_retention_policies(
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Get information about data retention policies.

    Returns retention periods and legal basis for different types of data.

    Args:
        user: Authenticated user (optional)

    Returns:
        List of retention policies
    """
    try:
        # Log access if user is authenticated
        if user:
            logger.info(f"User {user.id} accessed retention policies")

        return [
            RetentionPolicyInfo(
                data_type="audit_logs",
                retention_period_days=RetentionConfig.AUDIT_LOGS,
                retention_period_description="7 years (legal requirement)",
                legal_basis="Tax law and GDPR Art. 6(1)(c) - Legal obligation",
                archive_before_delete=True,
            ),
            RetentionPolicyInfo(
                data_type="user_data",
                retention_period_days=RetentionConfig.USER_DATA,
                retention_period_description="3 years after last activity",
                legal_basis="GDPR Art. 6(1)(b) - Contract performance",
                archive_before_delete=True,
            ),
            RetentionPolicyInfo(
                data_type="chat_history",
                retention_period_days=RetentionConfig.CHAT_HISTORY,
                retention_period_description="1 year (configurable by user)",
                legal_basis="User consent - GDPR Art. 6(1)(a)",
                archive_before_delete=True,
            ),
            RetentionPolicyInfo(
                data_type="analytics",
                retention_period_days=RetentionConfig.ANALYTICS_DATA,
                retention_period_description="2 years for product analytics",
                legal_basis="GDPR Art. 6(1)(f) - Legitimate interest",
                archive_before_delete=True,
            ),
            RetentionPolicyInfo(
                data_type="feedback",
                retention_period_days=RetentionConfig.FEEDBACK_DATA,
                retention_period_description="3 years for product improvement",
                legal_basis="GDPR Art. 6(1)(f) - Legitimate interest",
                archive_before_delete=True,
            ),
            RetentionPolicyInfo(
                data_type="temporary_data",
                retention_period_days=RetentionConfig.TEMPORARY_ANALYSIS,
                retention_period_description="90 days for temporary analysis results",
                legal_basis="User consent",
                archive_before_delete=False,
            ),
        ]

    except Exception as e:
        logger.error(f"Failed to retrieve retention policies: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve retention policies: {e!s}"
        )


@router.get("/privacy-policy")
async def get_privacy_policy(
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Get privacy policy (placeholder - should return actual policy document).

    Returns:
        Privacy policy information
    """
    if user:
        logger.info(f"User {user.id} accessed privacy policy")

    return JSONResponse(
        content={
            "version": "1.0",
            "effective_date": "2025-01-01",
            "message": "Privacy policy document should be hosted separately and referenced here.",
            "url": "/docs/privacy-policy.html",
            "last_updated": datetime.now(UTC).isoformat(),
        }
    )


@router.get("/terms-of-service")
async def get_terms_of_service(
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Get terms of service (placeholder - should return actual terms document).

    Returns:
        Terms of service information
    """
    if user:
        logger.info(f"User {user.id} accessed terms of service")

    return JSONResponse(
        content={
            "version": "1.0",
            "effective_date": "2025-01-01",
            "message": "Terms of service document should be hosted separately and referenced here.",
            "url": "/docs/terms-of-service.html",
            "last_updated": datetime.now(UTC).isoformat(),
        }
    )


logger.info("Legal API module initialized")
