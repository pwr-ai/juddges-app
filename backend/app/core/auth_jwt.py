"""
JWT Authentication Module

Implements Supabase JWT token validation and user authentication for the API.
This module provides secure user authentication by validating JWT tokens issued by Supabase.

Author: Juddges Backend Team
Date: 2025-10-11
"""

import os
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from loguru import logger
from supabase import Client, create_client
from supabase.client import ClientOptions

# Security scheme for Bearer token authentication
security = HTTPBearer()


# Global Supabase clients (separate from user-specific clients)
_admin_supabase_client: Client | None = None


def get_admin_supabase_client() -> Client:
    """
    Get Supabase admin client with service role key.

    Use this ONLY for admin operations that should bypass RLS.
    For user operations, use get_user_supabase_client() instead.

    Returns:
        Client: Supabase client with service role access

    Raises:
        ValueError: If required environment variables are not set
    """
    global _admin_supabase_client

    if _admin_supabase_client is None:
        url = os.getenv("SUPABASE_URL")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not url or not service_role_key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables required"
            )

        # Use ClientOptions to configure timeout instead of deprecated timeout parameter
        options = ClientOptions(
            postgrest_client_timeout=30, storage_client_timeout=30, schema="public"
        )
        _admin_supabase_client = create_client(url, service_role_key, options=options)
        logger.info("Initialized Supabase admin client (service role)")

    return _admin_supabase_client


def get_user_supabase_client(access_token: str) -> Client:
    """
    Create a Supabase client with user's JWT token.

    This client respects Row Level Security (RLS) policies and operates
    with the permissions of the authenticated user.

    Args:
        access_token: User's JWT access token from Supabase

    Returns:
        Client: Supabase client configured for the user

    Raises:
        ValueError: If required environment variables are not set
    """
    url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not url or not anon_key:
        raise ValueError(
            "SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables required"
        )

    # Create client with anon key and user's access token
    # This ensures RLS policies are enforced
    # Use ClientOptions to configure timeout instead of deprecated timeout parameter
    options = ClientOptions(
        postgrest_client_timeout=30, storage_client_timeout=30, schema="public"
    )
    client = create_client(url, anon_key, options=options)

    # Set the user's access token for authenticated requests
    client.auth.set_session(access_token, "")  # Empty refresh token is OK for API

    return client


class AuthenticatedUser:
    """
    Represents an authenticated user with their JWT claims.

    Attributes:
        id: User's unique ID from Supabase
        email: User's email address
        role: User's role (authenticated, service_role, etc.)
        aud: Token audience
        exp: Token expiration timestamp
        iat: Token issued at timestamp
        sub: Token subject (usually same as id)
        raw_token: Original JWT token string
        raw_claims: All JWT claims
    """

    def __init__(self, user_data: dict[str, Any], access_token: str):
        """
        Initialize authenticated user from Supabase user data.

        Args:
            user_data: User data from Supabase auth.get_user()
            access_token: The JWT access token
        """
        self.id: str = user_data.get("id")
        self.email: str = user_data.get("email")
        self.role: str = user_data.get("role", "authenticated")
        self.aud: str = user_data.get("aud", "")
        self.exp: int = user_data.get("exp", 0)
        self.iat: int = user_data.get("iat", 0)
        self.sub: str = user_data.get("sub", self.id)
        self.raw_token: str = access_token
        self.raw_claims: dict[str, Any] = user_data

        # User metadata (if available)
        self.user_metadata = user_data.get("user_metadata", {})
        self.app_metadata = user_data.get("app_metadata", {})

    def __repr__(self) -> str:
        return f"AuthenticatedUser(id={self.id}, email={self.email}, role={self.role})"

    def has_role(self, role: str) -> bool:
        """Check if user has a specific role."""
        return self.role == role

    def is_admin(self) -> bool:
        """Check if user is an admin."""
        return self.role == "service_role" or self.app_metadata.get("is_admin", False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthenticatedUser:
    """
    Dependency to get the current authenticated user from JWT token.

    This function validates the JWT token from the Authorization header
    and returns an AuthenticatedUser object with user information.

    Usage:
        ```python
        @router.get("/protected")
        async def protected_endpoint(user: AuthenticatedUser = Depends(get_current_user)):
            return {"user_id": user.id, "email": user.email}
        ```

    Args:
        credentials: HTTP Bearer token credentials from Authorization header

    Returns:
        AuthenticatedUser: Authenticated user with JWT claims

    Raises:
        HTTPException: 401 if token is invalid, expired, or missing
    """
    access_token = credentials.credentials

    if not access_token:
        logger.warning("Authentication failed: No access token provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No access token provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # Validate token using Supabase admin client
        admin_client = get_admin_supabase_client()

        # Verify the JWT token with Supabase
        # This validates signature, expiration, and authenticity
        user_response = admin_client.auth.get_user(access_token)

        if not user_response or not user_response.user:
            logger.warning("Authentication failed: Invalid token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_data = user_response.user

        # Create authenticated user object
        auth_user = AuthenticatedUser(
            user_data=user_data.model_dump()
            if hasattr(user_data, "model_dump")
            else user_data.__dict__,
            access_token=access_token,
        )

        logger.debug(f"User authenticated: {auth_user.id} ({auth_user.email})")

        return auth_user

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e!s}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Failed to authenticate: {e!s}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
) -> AuthenticatedUser | None:
    """
    Dependency to optionally get the current authenticated user.

    Similar to get_current_user() but doesn't raise an error if no token is provided.
    Useful for endpoints that work both with and without authentication.

    Usage:
        ```python
        @router.get("/optional")
        async def optional_endpoint(user: Optional[AuthenticatedUser] = Depends(get_optional_user)):
            if user:
                return {"message": f"Hello {user.email}"}
            return {"message": "Hello guest"}
        ```

    Args:
        credentials: Optional HTTP Bearer token credentials

    Returns:
        Optional[AuthenticatedUser]: Authenticated user or None if no token provided
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


async def require_admin(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    """
    Dependency to require admin role.

    Usage:
        ```python
        @router.delete("/admin/users/{user_id}")
        async def delete_user(
            user_id: str,
            admin: AuthenticatedUser = Depends(require_admin)
        ):
            # Only admins can access this endpoint
            ...
        ```

    Args:
        user: Authenticated user from get_current_user

    Returns:
        AuthenticatedUser: Admin user

    Raises:
        HTTPException: 403 if user is not an admin
    """
    if not user.is_admin():
        logger.warning(f"Admin access denied for user {user.id} ({user.email})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )

    return user


# Convenience function for getting user's Supabase client in endpoints
def get_user_db_client(user: AuthenticatedUser) -> Client:
    """
    Get a Supabase client configured for the authenticated user.

    This client will respect RLS policies and operate with user's permissions.

    Usage:
        ```python
        @router.get("/my-data")
        async def get_my_data(user: AuthenticatedUser = Depends(get_current_user)):
            client = get_user_db_client(user)
            result = client.table("my_table").select("*").execute()
            return result.data
        ```

    Args:
        user: Authenticated user from get_current_user

    Returns:
        Client: Supabase client configured for the user
    """
    return get_user_supabase_client(user.raw_token)


logger.info("JWT authentication module initialized")
