"""
Core utilities and shared functionality for the AI-Tax backend.

This package contains core modules for authentication, configuration, and shared utilities.
"""

from app.core.auth_jwt import (
    get_current_user,
    get_optional_user,
    get_user_db_client,
    get_admin_supabase_client,
    get_user_supabase_client,
    require_admin,
    AuthenticatedUser,
)

__all__ = [
    "get_current_user",
    "get_optional_user",
    "get_user_db_client",
    "get_admin_supabase_client",
    "get_user_supabase_client",
    "require_admin",
    "AuthenticatedUser",
]
