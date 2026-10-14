"""Long-lived MCP API keys: key material helpers, key resolution, and the dual-credential dependency.

A key is a bearer credential with no expiry by default, so only its sha256
hash is ever stored (see
supabase/migrations/20261014000001_create_mcp_api_keys.sql). The plaintext
is returned once, at creation, and is not recoverable afterwards.

This module is deliberately separate from app/auth.py, which verifies the
single shared BACKEND_API_KEY for the frontend-to-backend hop and carries no
user identity.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import BackgroundTasks, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from loguru import logger

from app.core.auth_jwt import (
    AuthenticatedUser,
    get_admin_supabase_client,
    get_current_user,
)

MCP_KEY_PREFIX = "jdg_mcp_"
THROTTLE_SECONDS = 300
_KEY_BYTES = 32
_DISPLAY_PREFIX_LENGTH = 8
_TABLE = "mcp_api_keys"
_LOOKUP_COLUMNS = "id, user_id, scopes, expires_at, revoked_at"


def generate_mcp_key() -> str:
    """Return a new plaintext key. Never store the return value."""
    return f"{MCP_KEY_PREFIX}{secrets.token_urlsafe(_KEY_BYTES)}"


def hash_mcp_key(token: str) -> str:
    """Return the sha256 hex digest stored in `mcp_api_keys.token_hash`."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def key_prefix(token: str) -> str:
    """Return the display-only prefix stored in `mcp_api_keys.prefix`."""
    return token[:_DISPLAY_PREFIX_LENGTH]


def _is_expired(expires_at: str | None) -> bool:
    if not expires_at:
        return False
    try:
        parsed = datetime.fromisoformat(expires_at)
        if parsed.tzinfo is None:
            raise ValueError("expires_at carries no timezone")
        return parsed <= datetime.now(UTC)
    except (TypeError, ValueError):
        # An unparseable or naive timestamp is treated as expired: fail closed.
        logger.warning("MCP key has an unusable expires_at; rejecting")
        return True


def resolve_mcp_principal(token: str) -> AuthenticatedUser | None:
    """Resolve a plaintext MCP key to its owner, or None if it is not usable.

    Returns None, never raises, on every rejection path, so callers can turn
    the absence of a principal into a single 401.
    """
    if not token or not token.startswith(MCP_KEY_PREFIX):
        return None

    try:
        response = (
            get_admin_supabase_client()
            .table(_TABLE)
            .select(_LOOKUP_COLUMNS)
            .eq("token_hash", hash_mcp_key(token))
            .execute()
        )
        rows = response.data or []
        if not rows:
            return None

        row = rows[0]
        if row.get("revoked_at") or _is_expired(row.get("expires_at")):
            return None

        user = AuthenticatedUser(
            {
                "id": row["user_id"],
                "sub": row["user_id"],
                "role": "authenticated",
                "aud": "authenticated",
            },
            "",
        )
        user.mcp_scopes = list(row.get("scopes") or [])
        user.mcp_key_id = row["id"]
        return user
    except Exception:
        logger.exception("MCP key resolution failed; rejecting")
        return None


def should_record_use(last_used_at: str | None, now: datetime | None = None) -> bool:
    """True when `last_used_at` is old enough to be worth another write."""
    if not last_used_at:
        return True
    try:
        previous = datetime.fromisoformat(last_used_at)
    except ValueError:
        return True
    if previous.tzinfo is None:
        # A naive timestamp cannot be compared with the aware clock; treat as unusable.
        return True
    reference = now or datetime.now(UTC)
    return reference - previous >= timedelta(seconds=THROTTLE_SECONDS)


def touch_key(key_id: str) -> None:
    """Record a use of `key_id`, at most once per THROTTLE_SECONDS.

    Runs in a background task: a tool call must not wait on this write, and a
    failure here must never fail the call.
    """
    try:
        client = get_admin_supabase_client()
        current = client.table(_TABLE).select("last_used_at").eq("id", key_id).execute()
        rows = current.data or []
        if rows and not should_record_use(rows[0].get("last_used_at")):
            return
        client.table(_TABLE).update({"last_used_at": datetime.now(UTC).isoformat()}).eq(
            "id", key_id
        ).execute()
    except Exception as e:
        logger.warning(
            f"Could not record MCP key use for {key_id}: {type(e).__name__}: {e}"
        )


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _bearer_value(request: Request) -> str | None:
    """Return the Bearer credential, or None when absent, non-Bearer, or empty."""
    header = request.headers.get("Authorization") or ""
    scheme, _, credential = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return credential.strip() or None


async def get_current_user_or_mcp_key(
    request: Request,
    background_tasks: BackgroundTasks,
) -> AuthenticatedUser:
    """Authenticate either a Supabase JWT or a long-lived MCP key.

    A Bearer value carrying the MCP prefix takes the key path; anything else
    falls through to the existing JWT dependency. Both yield the same
    AuthenticatedUser class, so no endpoint learns a second identity model.
    """
    credential = _bearer_value(request)
    if credential is None:
        raise _unauthorized()

    if credential.startswith(MCP_KEY_PREFIX):
        principal = resolve_mcp_principal(credential)
        if principal is None:
            raise _unauthorized()
        background_tasks.add_task(touch_key, principal.mcp_key_id)
        return principal

    return await get_current_user(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=credential)
    )
