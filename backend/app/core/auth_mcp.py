"""Long-lived MCP API keys: key material helpers and key resolution.

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
from datetime import UTC, datetime

from loguru import logger

from app.core.auth_jwt import AuthenticatedUser, get_admin_supabase_client

MCP_KEY_PREFIX = "jdg_mcp_"
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
    except Exception as e:
        logger.warning(f"MCP key resolution failed: {e}")
        return None
