"""Invite-gated registration for the pilot.

Registration deliberately does not go through the browser's Supabase client:
the anon key is public, so any client-side gate can be skipped. Account
creation happens here with the service-role key, and only after an invite
code has been atomically consumed.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Request, status
from limits import RateLimitItem, parse
from limits.storage import storage_from_string
from limits.strategies import MovingWindowRateLimiter
from loguru import logger
from pydantic import BaseModel, EmailStr, Field

from app.core.supabase import get_supabase_client
from app.rate_limiter import RATE_LIMIT_STORAGE_URI, limiter

# Loose total ceiling on this endpoint, keyed on the caller's proxy address
# (see get_client_ip). Registration is unauthenticated, so every external
# request arrives from the frontend container's internal IP — this is a
# SHARED bucket across every registrant, not per-client protection. It only
# exists so a runaway client can't hammer the endpoint indefinitely; it must
# stay loose enough that a handful of invitees registering within the same
# hour don't lock each other out. The real control is the per-email limit
# below.
INVITE_REDEEM_RATE_LIMIT = os.getenv("INVITE_REDEEM_RATE_LIMIT", "60/hour")

# Tight per-email limit — the actual brute-force / DoS protection. Charged
# against the normalized email address, independent of the shared-bucket
# ceiling above, so one registrant exhausting their own budget can't affect
# anyone else's.
DEFAULT_INVITE_REDEEM_EMAIL_RATE_LIMIT = "5/hour"

router = APIRouter(prefix="/auth/invites", tags=["auth"])

_email_limiter = MovingWindowRateLimiter(storage_from_string(RATE_LIMIT_STORAGE_URI))


def _current_email_limit() -> RateLimitItem:
    """Parse the configured per-email budget on every call so env overrides apply."""
    return parse(
        os.getenv(
            "INVITE_REDEEM_EMAIL_RATE_LIMIT", DEFAULT_INVITE_REDEEM_EMAIL_RATE_LIMIT
        )
    )


class InviteRedemptionRequest(BaseModel):
    code: str = Field(min_length=1, max_length=128)
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)


@router.post("/redeem", status_code=status.HTTP_201_CREATED)
@limiter.limit(INVITE_REDEEM_RATE_LIMIT)
async def redeem_invite(request: Request, payload: InviteRedemptionRequest) -> dict:
    """Consume an invite code and create the corresponding account."""
    normalized_email = payload.email.strip().lower()
    if not _email_limiter.hit(
        _current_email_limit(), "invite-redeem", normalized_email
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "INVITE_RATE_LIMIT_EXCEEDED",
                "message": "Too many registration attempts for this address. Try again later.",
            },
        )

    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SUPABASE_UNAVAILABLE", "message": "Try again shortly."},
        )

    redeemed = supabase.rpc("redeem_invite_code", {"p_code": payload.code}).execute()
    if not redeemed.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "INVALID_INVITE_CODE",
                "message": "This invite code is not valid, has expired, or is used up.",
            },
        )

    try:
        supabase.auth.admin.create_user(
            {
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
            }
        )
    except Exception:
        # The code is already spent. Say so plainly rather than inventing a
        # rollback: an admin raising max_uses is a two-second fix, whereas a
        # half-created account is not.
        logger.exception(f"Invite {payload.code} consumed but account creation failed")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ACCOUNT_CREATION_FAILED",
                "message": (
                    "Your invite code was accepted but the account could not be "
                    "created — this address may already be registered. Contact "
                    "the study administrator."
                ),
            },
        ) from None

    return {"status": "created"}
