"""Management endpoints for long-lived MCP API keys.

Every route here depends on `get_current_user` — a Supabase JWT. An MCP key
authenticates only in the ASGI middleware in front of the mounted /mcp app, so
it can reach no route here: it cannot mint or revoke another MCP key. That is
the single mitigation that bounds a leaked key, and it is asserted
structurally in tests/app/test_mcp_keys_router.py.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, status
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import (
    AuthenticatedUser,
    get_admin_supabase_client,
    get_current_user,
)
from app.core.auth_mcp import generate_mcp_key, hash_mcp_key, key_prefix
from app.services.audit_service import log_audit_background

router = APIRouter(prefix="/mcp/keys", tags=["mcp"])

_TABLE = "mcp_api_keys"
_DEFAULT_SCOPES = ["search:read"]


class CreateKeyRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    expires_at: datetime | None = None


class McpKeySummary(BaseModel):
    id: str
    name: str | None
    prefix: str
    scopes: list[str]
    created_at: str
    last_used_at: str | None
    expires_at: str | None
    revoked_at: str | None


class McpKeyCreated(McpKeySummary):
    key: str = Field(
        description="The plaintext key. Shown once; not recoverable afterwards."
    )


@router.post("", response_model=McpKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_key(
    request: CreateKeyRequest,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user),
) -> McpKeyCreated:
    """Mint a key for the caller and return its plaintext exactly once."""
    token = generate_mcp_key()
    now = datetime.now(UTC).isoformat()
    record = {
        "user_id": user.id,
        "token_hash": hash_mcp_key(token),
        "prefix": key_prefix(token),
        "name": request.name,
        "scopes": _DEFAULT_SCOPES,
        "created_at": now,
        "expires_at": request.expires_at.isoformat() if request.expires_at else None,
    }

    try:
        response = get_admin_supabase_client().table(_TABLE).insert(record).execute()
    except Exception as e:
        logger.error(f"Failed to create MCP key for {user.id}: {e}")
        raise HTTPException(status_code=500, detail="Could not create key") from e

    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Could not create key")

    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="mcp_key_created",
        input_data={"key_id": rows[0]["id"], "prefix": record["prefix"]},
    )

    return McpKeyCreated(
        id=rows[0]["id"],
        name=record["name"],
        prefix=record["prefix"],
        scopes=record["scopes"],
        created_at=rows[0].get("created_at") or now,
        last_used_at=None,
        expires_at=record["expires_at"],
        revoked_at=None,
        key=token,
    )


@router.get("", response_model=list[McpKeySummary])
async def list_keys(
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[McpKeySummary]:
    """List the caller's keys. Never returns a hash or a plaintext."""
    try:
        response = (
            get_admin_supabase_client()
            .table(_TABLE)
            .select(
                "id, name, prefix, scopes, created_at, last_used_at, "
                "expires_at, revoked_at"
            )
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        logger.error(f"Failed to list MCP keys for {user.id}: {e}")
        raise HTTPException(status_code=500, detail="Could not list keys") from e

    return [McpKeySummary(**row) for row in (response.data or [])]


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_key(
    background_tasks: BackgroundTasks,
    key_id: UUID = Path(..., description="Key id to revoke"),
    user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    """Revoke one of the caller's keys. The row is kept for the audit trail."""
    try:
        response = (
            get_admin_supabase_client()
            .table(_TABLE)
            .update({"revoked_at": datetime.now(UTC).isoformat()})
            .eq("id", str(key_id))
            .eq("user_id", user.id)
            .is_("revoked_at", "null")
            .execute()
        )
    except Exception as e:
        logger.error(f"Failed to revoke MCP key {key_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not revoke key") from e

    if not (response.data or []):
        raise HTTPException(status_code=404, detail="Key not found")

    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="mcp_key_revoked",
        input_data={"key_id": str(key_id)},
    )
