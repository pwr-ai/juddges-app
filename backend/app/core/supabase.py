"""
Shared Supabase client singleton for the application.

This module provides a centralized Supabase client initialization to avoid
duplicating the same initialization code across multiple files.

Two client types are available:
- Sync client (get_supabase_client): for general use throughout the app.
- Async client (get_async_supabase_client): for latency-critical async
  endpoints (e.g., search) to avoid blocking the event loop.
"""

import asyncio
import os

from loguru import logger
from supabase import (
    AsyncClient,
    AsyncClientOptions,
    Client,
    ClientOptions,
    create_client,
)


def _create_supabase_client() -> Client | None:
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
supabase_client: Client | None = _create_supabase_client()


def get_supabase_client() -> Client | None:
    """
    Get the shared Supabase client instance.

    Returns:
        The shared Supabase client, or None if not initialized.
    """
    return supabase_client


# --- Async client for latency-critical paths (search) ---

_async_supabase_client: AsyncClient | None = None
_async_init_lock = asyncio.Lock()


async def get_async_supabase_client() -> AsyncClient | None:
    """Get or create the shared async Supabase client.

    Uses httpx.AsyncClient under the hood, avoiding event loop blocking
    that the sync client causes in async FastAPI endpoints. Connection
    pooling with HTTP/2 keeps persistent connections to Supabase.

    Thread-safe via double-checked locking with asyncio.Lock to prevent
    race conditions during concurrent initialization.
    """
    global _async_supabase_client

    if _async_supabase_client is not None:
        return _async_supabase_client

    async with _async_init_lock:
        # Double-check after acquiring the lock
        if _async_supabase_client is not None:
            return _async_supabase_client

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not supabase_url or not supabase_key:
            logger.warning("Async Supabase client not initialized: missing credentials")
            return None

        options = AsyncClientOptions(
            postgrest_client_timeout=30,
            storage_client_timeout=30,
            schema="public",
        )
        _async_supabase_client = await AsyncClient.create(
            supabase_url, supabase_key, options=options
        )
        logger.info(f"Async Supabase client initialized for URL: {supabase_url}")
        return _async_supabase_client
