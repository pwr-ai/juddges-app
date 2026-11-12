"""Long-lived MCP API keys: key material helpers and key resolution.

A key is a bearer credential with no expiry by default, so only its sha256
hash is ever stored (see
supabase/migrations/20261020000001_create_mcp_api_keys.sql). The plaintext
is returned once, at creation, and is not recoverable afterwards.

This module is deliberately separate from app/auth.py, which verifies the
single shared BACKEND_API_KEY for the frontend-to-backend hop and carries no
user identity.

It deliberately exposes no FastAPI dependency. A key authenticates one place
only: the ASGI middleware in front of the mounted /mcp app
(juddges_mcp.http.McpAuthMiddleware). Keeping it off the HTTP routers means a
leaked key reaches the MCP tools and nothing else -- above all not /mcp/keys,
so it can neither mint nor revoke a key.
"""

import hashlib
import os
import secrets
import time
from datetime import UTC, datetime, timedelta

from loguru import logger

from app.core.auth_jwt import AuthenticatedUser, get_admin_supabase_client

MCP_KEY_PREFIX = "jdg_mcp_"
THROTTLE_SECONDS = 300
_KEY_BYTES = 32
_DISPLAY_PREFIX_LENGTH = 16
_TABLE = "mcp_api_keys"
_LOOKUP_COLUMNS = "id, user_id, scopes, expires_at, revoked_at, last_used_at"


_CACHE_TTL_ENV = "MCP_KEY_CACHE_TTL_SECONDS"
_DEFAULT_CACHE_TTL_SECONDS = 30.0
_CACHE_MAX_ENTRIES = 1024

# token_hash -> (monotonic deadline, principal). Successful resolutions only,
# keyed on the hash so the plaintext key is never held. A revoked or expired
# key stays usable for at most the TTL; MCP_KEY_CACHE_TTL_SECONDS=0 disables.
_principal_cache: dict[str, tuple[float, AuthenticatedUser]] = {}


def clear_principal_cache() -> None:
    _principal_cache.clear()


def _cache_ttl() -> float:
    try:
        return max(0.0, float(os.getenv(_CACHE_TTL_ENV, _DEFAULT_CACHE_TTL_SECONDS)))
    except ValueError:
        return _DEFAULT_CACHE_TTL_SECONDS


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

    token_hash = hash_mcp_key(token)
    ttl = _cache_ttl()
    if ttl:
        cached = _principal_cache.get(token_hash)
        if cached is not None:
            if time.monotonic() < cached[0]:
                return cached[1]
            _principal_cache.pop(token_hash, None)

    try:
        response = (
            get_admin_supabase_client()
            .table(_TABLE)
            .select(_LOOKUP_COLUMNS)
            .eq("token_hash", token_hash)
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
        user.mcp_last_used_at = row.get("last_used_at")
        if ttl:
            if len(_principal_cache) >= _CACHE_MAX_ENTRIES:
                _principal_cache.clear()
            _principal_cache[token_hash] = (time.monotonic() + ttl, user)
        return user
    except Exception as e:
        # Deliberately NOT logger.exception / opt(exception=...): loguru's
        # default handler runs with diagnose=True, which prints the value of
        # every name on each traceback line. `token` here and `credential` in
        # the caller's frame hold the full plaintext key, which has no expiry,
        # so a traceback would write a working credential to the log. Type and
        # message are enough to tell a misconfiguration from an outage.
        logger.error(f"MCP key resolution failed; rejecting: {type(e).__name__}: {e}")
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


def touch_key(key_id: str, last_used_at: str | None = None) -> None:
    """Record a use of `key_id`, at most once per THROTTLE_SECONDS.

    `last_used_at` is what resolution already read; when it is recent no query
    is made at all. Otherwise a single conditional UPDATE does the throttle
    server-side, so a race between two requests writes once.

    Runs in a background task: a tool call must not wait on this write, and a
    failure here must never fail the call.
    """
    if last_used_at and not should_record_use(last_used_at):
        return
    try:
        now = datetime.now(UTC)
        cutoff = (now - timedelta(seconds=THROTTLE_SECONDS)).isoformat()
        get_admin_supabase_client().table(_TABLE).update(
            {"last_used_at": now.isoformat()}
        ).eq("id", key_id).or_(
            f'last_used_at.is.null,last_used_at.lt."{cutoff}"'
        ).execute()
    except Exception as e:
        logger.warning(
            f"Could not record MCP key use for {key_id}: {type(e).__name__}: {e}"
        )
