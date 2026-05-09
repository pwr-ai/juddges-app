"""Shared base class and utilities for Supabase database modules."""

import os
import warnings

from fastapi import HTTPException
from loguru import logger
from supabase import Client, PostgrestAPIError, StorageException, create_client
from supabase.client import ClientOptions

# Suppress SSL ResourceWarnings from httpx/supabase client
warnings.filterwarnings("ignore", category=ResourceWarning, message=".*ssl.SSLSocket.*")

# Suppress DeprecationWarnings from supabase library's internal timeout parameter usage
# This is a library issue, not an issue with our code
warnings.filterwarnings("ignore", category=DeprecationWarning, message=".*timeout.*parameter.*deprecated.*")
warnings.filterwarnings("ignore", category=DeprecationWarning, message=".*verify.*parameter.*deprecated.*")


class SupabaseClientMixin:
    """Mixin providing shared Supabase client initialisation and error handling."""

    def _init_client(self, class_name: str, postgrest_timeout: int = 30) -> None:
        """Initialise the Supabase client from environment variables.

        Args:
            class_name: Used only for the log message.
            postgrest_timeout: PostgREST client timeout in seconds.
        """
        self.url = os.getenv("SUPABASE_URL")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not self.url or not self.service_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

        options = ClientOptions(
            postgrest_client_timeout=postgrest_timeout,
            storage_client_timeout=30,
            schema="public",
        )
        self.client: Client = create_client(self.url, self.service_key, options=options)
        logger.info(f"Initialized {class_name} with Supabase client: {self.url[:50]}...")

    def _handle_error(self, operation: str, error: Exception) -> None:
        """Translate Supabase exceptions into FastAPI HTTP exceptions."""
        logger.exception(f"Supabase error during {operation}: {error}")

        error_msg = str(error).lower()
        if "duplicate key" in error_msg or "already exists" in error_msg:
            raise HTTPException(status_code=409, detail="Resource already exists")
        elif "not found" in error_msg or "no rows" in error_msg:
            raise HTTPException(status_code=404, detail="Resource not found")
        else:
            raise HTTPException(status_code=500, detail=f"Database error: {str(error)}")


__all__ = [
    "SupabaseClientMixin",
    "Client",
    "PostgrestAPIError",
    "StorageException",
]
