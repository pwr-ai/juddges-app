"""
SSO Management API Endpoints

Provides admin endpoints for managing SAML 2.0 and OAuth 2.0 SSO connections
with enterprise identity providers (Azure AD, Okta, Google Workspace).

Includes:
- CRUD operations for SSO connections
- Domain-based SSO discovery for login
- SSO login event audit log
"""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import (
    AuthenticatedUser,
    get_admin_supabase_client,
    require_admin,
)

router = APIRouter(prefix="/api/sso", tags=["SSO Management"])

# Column projection for sso_connections — explicit list prevents fetching
# secrets like oauth_client_secret that are write-only and stored separately.
_SSO_CONNECTION_COLS = (
    "id, name, slug, organization, provider_type, status, domain, "
    "auto_provision_users, default_account_type, supabase_provider_id, "
    "saml_entity_id, saml_sso_url, saml_metadata_url, "
    "oauth_client_id, oauth_authorization_url, oauth_token_url, "
    "oauth_userinfo_url, oauth_scopes, created_at, updated_at"
)


# ===== Models =====


class SSOConnectionBase(BaseModel):
    """Base model for SSO connection data."""

    name: str = Field(description="Display name for the SSO connection")
    organization: str = Field(description="Organization/company name")
    provider_type: Literal["saml", "oauth"] = Field(description="SSO protocol type")
    domain: str = Field(description="Email domain for SSO discovery")
    auto_provision_users: bool = Field(
        default=True, description="Auto-create users on first SSO login"
    )
    default_account_type: str = Field(
        default="base", description="Default account type for provisioned users"
    )


class SSOConnectionCreateSAML(SSOConnectionBase):
    """Create a SAML 2.0 SSO connection."""

    provider_type: Literal["saml"] = "saml"
    saml_entity_id: str = Field(description="IdP Entity ID")
    saml_sso_url: str = Field(description="IdP SSO Login URL")
    saml_certificate: str = Field(description="IdP X.509 certificate (PEM format)")
    saml_metadata_url: str | None = Field(
        None, description="IdP metadata URL for auto-config"
    )


class SSOConnectionCreateOAuth(SSOConnectionBase):
    """Create an OAuth 2.0 / OIDC SSO connection."""

    provider_type: Literal["oauth"] = "oauth"
    oauth_client_id: str = Field(description="OAuth client ID")
    oauth_client_secret: str = Field(description="OAuth client secret")
    oauth_authorization_url: str = Field(description="Authorization endpoint URL")
    oauth_token_url: str = Field(description="Token endpoint URL")
    oauth_userinfo_url: str | None = Field(None, description="UserInfo endpoint URL")
    oauth_scopes: str = Field(
        default="openid email profile", description="OAuth scopes"
    )


class SSOConnectionResponse(BaseModel):
    """Response model for an SSO connection."""

    id: str
    name: str
    slug: str
    organization: str
    provider_type: str
    status: str
    domain: str
    auto_provision_users: bool
    default_account_type: str
    supabase_provider_id: str | None = None
    created_at: str
    updated_at: str

    # SAML fields (only for SAML connections)
    saml_entity_id: str | None = None
    saml_sso_url: str | None = None
    saml_metadata_url: str | None = None

    # OAuth fields (only for OAuth connections)
    oauth_client_id: str | None = None
    oauth_authorization_url: str | None = None
    oauth_token_url: str | None = None
    oauth_userinfo_url: str | None = None
    oauth_scopes: str | None = None


class SSOConnectionUpdateStatus(BaseModel):
    """Update SSO connection status."""

    status: Literal["active", "inactive", "pending"]


class SSODomainCheckResponse(BaseModel):
    """Response for domain-based SSO discovery."""

    sso_enabled: bool
    provider_type: str | None = None
    connection_id: str | None = None
    connection_name: str | None = None
    organization: str | None = None


class SSOLoginEventResponse(BaseModel):
    """SSO login event for audit log."""

    id: str
    connection_id: str
    connection_name: str | None = None
    user_id: str | None = None
    email: str
    event_type: str
    ip_address: str | None = None
    error_message: str | None = None
    created_at: str


def _slugify(name: str) -> str:
    """Convert a name to a URL-friendly slug."""
    import re

    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug)


# ===== Public Endpoints (for login flow) =====


@router.get(
    "/check-domain",
    response_model=SSODomainCheckResponse,
    summary="Check if SSO is enabled for an email domain",
)
async def check_domain_sso(
    domain: str = Query(description="Email domain to check (e.g., 'acme.com')"),
):
    """
    Public endpoint for domain-based SSO discovery.
    Used by the login form to detect if a user's email domain has SSO configured.
    """
    try:
        client = get_admin_supabase_client()
        result = (
            client.table("sso_connections")
            .select("id, name, organization, provider_type")
            .eq("domain", domain.lower())
            .eq("status", "active")
            .limit(1)
            .execute()
        )

        if result.data and len(result.data) > 0:
            conn = result.data[0]
            return SSODomainCheckResponse(
                sso_enabled=True,
                provider_type=conn["provider_type"],
                connection_id=conn["id"],
                connection_name=conn["name"],
                organization=conn["organization"],
            )

        return SSODomainCheckResponse(sso_enabled=False)

    except Exception as e:
        logger.error(f"Error checking domain SSO: {e}")
        return SSODomainCheckResponse(sso_enabled=False)


# ===== Admin Endpoints =====


@router.get(
    "/connections",
    response_model=list[SSOConnectionResponse],
    summary="List all SSO connections",
)
async def list_connections(
    status: str | None = Query(None, description="Filter by status"),
    admin: AuthenticatedUser = Depends(require_admin),
):
    """List all SSO connections. Admin only."""
    try:
        client = get_admin_supabase_client()
        query = (
            client.table("sso_connections")
            .select(_SSO_CONNECTION_COLS)
            .order("created_at", desc=True)
        )

        if status:
            query = query.eq("status", status)

        result = query.execute()
        return [SSOConnectionResponse(**conn) for conn in result.data]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing SSO connections: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to list SSO connections: {e}"
        )


@router.get(
    "/connections/{connection_id}",
    response_model=SSOConnectionResponse,
    summary="Get SSO connection details",
)
async def get_connection(
    connection_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
):
    """Get details of a specific SSO connection. Admin only."""
    try:
        client = get_admin_supabase_client()
        result = (
            client.table("sso_connections")
            .select(_SSO_CONNECTION_COLS)
            .eq("id", connection_id)
            .single()
            .execute()
        )
        return SSOConnectionResponse(**result.data)

    except Exception as e:
        logger.error(f"Error getting SSO connection {connection_id}: {e}")
        raise HTTPException(status_code=404, detail="SSO connection not found")


@router.post(
    "/connections",
    response_model=SSOConnectionResponse,
    status_code=201,
    summary="Create a new SSO connection",
)
async def create_connection(
    connection: SSOConnectionBase,
    admin: AuthenticatedUser = Depends(require_admin),
):
    """
    Create a new SSO connection for an enterprise identity provider.
    Admin only. The connection starts in 'pending' status.
    """
    try:
        client = get_admin_supabase_client()

        # Check for duplicate domain
        existing = (
            client.table("sso_connections")
            .select("id")
            .eq("domain", connection.domain.lower())
            .execute()
        )
        if existing.data:
            raise HTTPException(
                status_code=409,
                detail=f"SSO connection already exists for domain '{connection.domain}'",
            )

        slug = _slugify(connection.name)

        insert_data = {
            "name": connection.name,
            "slug": slug,
            "organization": connection.organization,
            "provider_type": connection.provider_type,
            "domain": connection.domain.lower(),
            "status": "pending",
            "auto_provision_users": connection.auto_provision_users,
            "default_account_type": connection.default_account_type,
            "created_by": admin.id,
        }

        # Add provider-specific fields
        if (
            isinstance(connection, SSOConnectionCreateSAML)
            or connection.provider_type == "saml"
        ):
            saml_data = connection.model_dump(
                include={
                    "saml_entity_id",
                    "saml_sso_url",
                    "saml_certificate",
                    "saml_metadata_url",
                }
            )
            insert_data.update({k: v for k, v in saml_data.items() if v is not None})
        elif (
            isinstance(connection, SSOConnectionCreateOAuth)
            or connection.provider_type == "oauth"
        ):
            oauth_data = connection.model_dump(
                include={
                    "oauth_client_id",
                    "oauth_client_secret",
                    "oauth_authorization_url",
                    "oauth_token_url",
                    "oauth_userinfo_url",
                    "oauth_scopes",
                }
            )
            # Rename client_secret to encrypted field name
            if "oauth_client_secret" in oauth_data:
                insert_data["oauth_client_secret_encrypted"] = oauth_data.pop(
                    "oauth_client_secret"
                )
            insert_data.update({k: v for k, v in oauth_data.items() if v is not None})

        result = client.table("sso_connections").insert(insert_data).execute()

        logger.info(
            f"SSO connection created: {connection.name} ({connection.provider_type}) "
            f"for domain {connection.domain} by admin {admin.email}"
        )

        return SSOConnectionResponse(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating SSO connection: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to create SSO connection: {e}"
        )


@router.patch(
    "/connections/{connection_id}/status",
    response_model=SSOConnectionResponse,
    summary="Update SSO connection status",
)
async def update_connection_status(
    connection_id: str,
    update: SSOConnectionUpdateStatus,
    admin: AuthenticatedUser = Depends(require_admin),
):
    """Activate, deactivate, or set pending status for an SSO connection. Admin only."""
    try:
        client = get_admin_supabase_client()
        result = (
            client.table("sso_connections")
            .update(
                {
                    "status": update.status,
                    "updated_at": datetime.now(UTC).isoformat(),
                }
            )
            .eq("id", connection_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="SSO connection not found")

        logger.info(
            f"SSO connection {connection_id} status updated to {update.status} "
            f"by admin {admin.email}"
        )

        return SSOConnectionResponse(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating SSO connection status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update connection: {e}")


@router.delete(
    "/connections/{connection_id}",
    status_code=204,
    summary="Delete an SSO connection",
)
async def delete_connection(
    connection_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
):
    """Delete an SSO connection. Admin only."""
    try:
        client = get_admin_supabase_client()
        client.table("sso_connections").delete().eq("id", connection_id).execute()

        logger.info(f"SSO connection {connection_id} deleted by admin {admin.email}")

    except Exception as e:
        logger.error(f"Error deleting SSO connection: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete connection: {e}")


@router.get(
    "/connections/{connection_id}/events",
    response_model=list[SSOLoginEventResponse],
    summary="Get SSO login events for a connection",
)
async def get_connection_events(
    connection_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: AuthenticatedUser = Depends(require_admin),
):
    """Get audit log of SSO login events for a connection. Admin only."""
    try:
        client = get_admin_supabase_client()
        result = (
            client.table("sso_login_events")
            .select("*, sso_connections(name)")
            .eq("connection_id", connection_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        events = []
        for event in result.data:
            conn_name = None
            if event.get("sso_connections"):
                conn_name = event["sso_connections"].get("name")
            events.append(
                SSOLoginEventResponse(
                    id=event["id"],
                    connection_id=event["connection_id"],
                    connection_name=conn_name,
                    user_id=event.get("user_id"),
                    email=event["email"],
                    event_type=event["event_type"],
                    ip_address=str(event["ip_address"])
                    if event.get("ip_address")
                    else None,
                    error_message=event.get("error_message"),
                    created_at=event["created_at"],
                )
            )
        return events

    except Exception as e:
        logger.error(f"Error getting SSO events: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get events: {e}")
