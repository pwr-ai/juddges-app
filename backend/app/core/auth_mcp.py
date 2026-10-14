"""Long-lived MCP API keys: key material helpers.

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

MCP_KEY_PREFIX = "jdg_mcp_"
_KEY_BYTES = 32
_DISPLAY_PREFIX_LENGTH = 8


def generate_mcp_key() -> str:
    """Return a new plaintext key. Never store the return value."""
    return f"{MCP_KEY_PREFIX}{secrets.token_urlsafe(_KEY_BYTES)}"


def hash_mcp_key(token: str) -> str:
    """Return the sha256 hex digest stored in `mcp_api_keys.token_hash`."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def key_prefix(token: str) -> str:
    """Return the display-only prefix stored in `mcp_api_keys.prefix`."""
    return token[:_DISPLAY_PREFIX_LENGTH]
