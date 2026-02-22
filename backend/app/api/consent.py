"""
User Consent Management API

Handles user consent for legal compliance (GDPR, professional acknowledgment).
Tracks consent versions and maintains consent history.

Author: Juddges Backend Team
Date: 2025-10-12
"""

from datetime import datetime
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import (
    AuthenticatedUser,
    get_admin_supabase_client,
    get_current_user,
)


# Router configuration
router = APIRouter(prefix="/api/consent", tags=["User Consent"])


# ===== Models =====


class ConsentUpdateRequest(BaseModel):
    """Request to update user consent."""

    consent_type: Literal[
        "professional_acknowledgment",
        "terms",
        "privacy_policy",
        "data_processing",
        "marketing",
    ] = Field(description="Type of consent to update")

    accepted: bool = Field(description="Whether consent is accepted or revoked")

    version: Optional[str] = Field(
        None,
        description="Version of the document being accepted (e.g., 'v1.0', '2024-10-12')",
    )


class ConsentStatusResponse(BaseModel):
    """Response model for consent status."""

    user_id: str

    professional_acknowledgment_accepted: bool = Field(
        description="Whether user accepted professional acknowledgment"
    )
    professional_acknowledgment_date: Optional[str] = Field(
        None, description="Date of acceptance"
    )
    professional_acknowledgment_version: Optional[str] = Field(
        None, description="Version accepted"
    )

    terms_accepted: bool = Field(description="Whether user accepted terms of service")
    terms_accepted_date: Optional[str] = None
    terms_accepted_version: Optional[str] = None

    privacy_policy_accepted: bool = Field(
        description="Whether user accepted privacy policy"
    )
    privacy_policy_accepted_date: Optional[str] = None
    privacy_policy_accepted_version: Optional[str] = None

    data_processing_consent: bool = Field(
        description="Whether user consented to data processing"
    )
    data_processing_consent_date: Optional[str] = None

    marketing_consent: bool = Field(description="Whether user consented to marketing")
    marketing_consent_date: Optional[str] = None

    is_compliant: bool = Field(description="Whether all required consents are obtained")

    last_updated: str = Field(description="Last update timestamp")


class ConsentHistoryEntry(BaseModel):
    """Single entry in consent history."""

    consent_type: str
    accepted: bool
    version: Optional[str]
    timestamp: str


class ConsentHistoryResponse(BaseModel):
    """Response model for consent history."""

    user_id: str
    consent_history: List[ConsentHistoryEntry] = Field(
        description="Chronological list of consent changes"
    )


class ConsentUpdateResponse(BaseModel):
    """Response model for consent update."""

    status: Literal["success", "failed"]
    message: str
    consent_status: Optional[ConsentStatusResponse] = None


# ===== Helper Functions =====


def _check_compliance(consent_data: Dict) -> bool:
    """
    Check if user has all required consents.

    Required consents:
    - Professional acknowledgment
    - Terms of service
    - Privacy policy
    - Data processing consent

    Args:
        consent_data: Consent data from database

    Returns:
        True if compliant, False otherwise
    """
    required_fields = [
        "professional_acknowledgment_accepted",
        "terms_accepted",
        "privacy_policy_accepted",
        "data_processing_consent",
    ]

    return all(consent_data.get(field, False) for field in required_fields)


# ===== API Endpoints =====


@router.post("/update", response_model=ConsentUpdateResponse)
async def update_consent(
    request: ConsentUpdateRequest, user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Update user consent.

    Updates a specific consent type and maintains consent history.
    All consent changes are logged with timestamps and versions.

    Args:
        request: Consent update request
        user: Authenticated user (from JWT token)

    Returns:
        ConsentUpdateResponse with updated status
    """
    try:
        client = get_admin_supabase_client()

        # Call database function to update consent
        client.rpc(
            "update_user_consent",
            {
                "p_user_id": user.id,
                "p_consent_type": request.consent_type,
                "p_accepted": request.accepted,
                "p_version": request.version,
            },
        ).execute()

        # Get updated consent status
        consent_result = (
            client.table("user_consent").select("*").eq("user_id", user.id).execute()
        )

        if not consent_result.data:
            raise HTTPException(
                status_code=500, detail="Failed to retrieve updated consent status"
            )

        consent_data = consent_result.data[0]

        # Check compliance
        is_compliant = _check_compliance(consent_data)

        consent_status = ConsentStatusResponse(
            user_id=user.id,
            professional_acknowledgment_accepted=consent_data.get(
                "professional_acknowledgment_accepted", False
            ),
            professional_acknowledgment_date=consent_data.get(
                "professional_acknowledgment_date"
            ),
            professional_acknowledgment_version=consent_data.get(
                "professional_acknowledgment_version"
            ),
            terms_accepted=consent_data.get("terms_accepted", False),
            terms_accepted_date=consent_data.get("terms_accepted_date"),
            terms_accepted_version=consent_data.get("terms_accepted_version"),
            privacy_policy_accepted=consent_data.get("privacy_policy_accepted", False),
            privacy_policy_accepted_date=consent_data.get(
                "privacy_policy_accepted_date"
            ),
            privacy_policy_accepted_version=consent_data.get(
                "privacy_policy_accepted_version"
            ),
            data_processing_consent=consent_data.get("data_processing_consent", False),
            data_processing_consent_date=consent_data.get(
                "data_processing_consent_date"
            ),
            marketing_consent=consent_data.get("marketing_consent", False),
            marketing_consent_date=consent_data.get("marketing_consent_date"),
            is_compliant=is_compliant,
            last_updated=consent_data.get("updated_at", datetime.utcnow().isoformat()),
        )

        action_word = "accepted" if request.accepted else "revoked"
        logger.info(
            f"User {user.id} {action_word} consent: {request.consent_type} "
            f"(version: {request.version})"
        )

        return ConsentUpdateResponse(
            status="success",
            message=f"Consent {action_word} successfully",
            consent_status=consent_status,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update consent for user {user.id}: {e}")
        return ConsentUpdateResponse(
            status="failed",
            message=f"Failed to update consent: {str(e)}",
            consent_status=None,
        )


@router.get("/status", response_model=ConsentStatusResponse)
async def get_consent_status(user: AuthenticatedUser = Depends(get_current_user)):
    """
    Get current consent status.

    Retrieves all consent flags and their versions for the authenticated user.

    Args:
        user: Authenticated user (from JWT token)

    Returns:
        ConsentStatusResponse with current consent status
    """
    try:
        client = get_admin_supabase_client()

        # Get consent status
        result = (
            client.table("user_consent").select("*").eq("user_id", user.id).execute()
        )

        if not result.data:
            # No consent record yet - return defaults
            logger.info(
                f"No consent record found for user {user.id}, returning defaults"
            )

            return ConsentStatusResponse(
                user_id=user.id,
                professional_acknowledgment_accepted=False,
                terms_accepted=False,
                privacy_policy_accepted=False,
                data_processing_consent=False,
                marketing_consent=False,
                is_compliant=False,
                last_updated=datetime.utcnow().isoformat(),
            )

        consent_data = result.data[0]

        # Check compliance
        is_compliant = _check_compliance(consent_data)

        logger.info(
            f"Retrieved consent status for user {user.id} (compliant: {is_compliant})"
        )

        return ConsentStatusResponse(
            user_id=user.id,
            professional_acknowledgment_accepted=consent_data.get(
                "professional_acknowledgment_accepted", False
            ),
            professional_acknowledgment_date=consent_data.get(
                "professional_acknowledgment_date"
            ),
            professional_acknowledgment_version=consent_data.get(
                "professional_acknowledgment_version"
            ),
            terms_accepted=consent_data.get("terms_accepted", False),
            terms_accepted_date=consent_data.get("terms_accepted_date"),
            terms_accepted_version=consent_data.get("terms_accepted_version"),
            privacy_policy_accepted=consent_data.get("privacy_policy_accepted", False),
            privacy_policy_accepted_date=consent_data.get(
                "privacy_policy_accepted_date"
            ),
            privacy_policy_accepted_version=consent_data.get(
                "privacy_policy_accepted_version"
            ),
            data_processing_consent=consent_data.get("data_processing_consent", False),
            data_processing_consent_date=consent_data.get(
                "data_processing_consent_date"
            ),
            marketing_consent=consent_data.get("marketing_consent", False),
            marketing_consent_date=consent_data.get("marketing_consent_date"),
            is_compliant=is_compliant,
            last_updated=consent_data.get("updated_at", datetime.utcnow().isoformat()),
        )

    except Exception as e:
        logger.error(f"Failed to retrieve consent status for user {user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve consent status: {str(e)}"
        )


@router.get("/history", response_model=ConsentHistoryResponse)
async def get_consent_history(user: AuthenticatedUser = Depends(get_current_user)):
    """
    Get consent change history.

    Retrieves the complete history of consent changes for the authenticated user.
    Useful for auditing and transparency.

    Args:
        user: Authenticated user (from JWT token)

    Returns:
        ConsentHistoryResponse with consent history
    """
    try:
        client = get_admin_supabase_client()

        # Get consent record with history
        result = (
            client.table("user_consent")
            .select("consent_history")
            .eq("user_id", user.id)
            .execute()
        )

        if not result.data or not result.data[0].get("consent_history"):
            logger.info(f"No consent history found for user {user.id}")
            return ConsentHistoryResponse(user_id=user.id, consent_history=[])

        consent_history = result.data[0]["consent_history"]

        # Parse history entries
        history_entries = [ConsentHistoryEntry(**entry) for entry in consent_history]

        logger.info(
            f"Retrieved consent history for user {user.id}: {len(history_entries)} entries"
        )

        return ConsentHistoryResponse(user_id=user.id, consent_history=history_entries)

    except Exception as e:
        logger.error(f"Failed to retrieve consent history for user {user.id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve consent history: {str(e)}"
        )


@router.post("/professional-acknowledgment", response_model=ConsentUpdateResponse)
async def accept_professional_acknowledgment(
    version: str = "v1.0", user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Accept professional acknowledgment.

    Convenience endpoint specifically for accepting the professional acknowledgment
    that Juddges is not a replacement for professional legal advice.

    This is a required consent for using the service.

    Args:
        version: Version of the acknowledgment being accepted
        user: Authenticated user (from JWT token)

    Returns:
        ConsentUpdateResponse with updated status
    """
    request = ConsentUpdateRequest(
        consent_type="professional_acknowledgment", accepted=True, version=version
    )

    return await update_consent(request, user)


logger.info("Consent API module initialized")
