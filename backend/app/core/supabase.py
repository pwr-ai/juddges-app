"""
Shared Supabase client singleton for the application.

This module provides a centralized Supabase client initialization to avoid
duplicating the same initialization code across multiple files.
"""
import os
from typing import Optional

from loguru import logger
from supabase import Client, ClientOptions, create_client


def _create_supabase_client() -> Optional[Client]:
    """
    Create and configure a Supabase client.

    Returns:
        Configured Supabase client, or None if credentials are not available.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        logger.warning(
            f"Supabase client not initialized. "
            f"SUPABASE_URL={'set' if supabase_url else 'not set'}, "
            f"SUPABASE_KEY={'set' if supabase_key else 'not set'}"
        )
        return None

    options = ClientOptions(
        postgrest_client_timeout=30,
        storage_client_timeout=30,
        schema="public",
    )
    client = create_client(supabase_url, supabase_key, options=options)
    logger.info(f"Supabase client initialized successfully for URL: {supabase_url}")
    return client


# Singleton client instance - created once on module import
supabase_client: Optional[Client] = _create_supabase_client()


def get_supabase_client() -> Optional[Client]:
    """
    Get the shared Supabase client instance.

    Returns:
        The shared Supabase client, or None if not initialized.
    """
    return supabase_client
