"""
LangChain cache configuration using PostgreSQL.

This module provides global LangChain LLM cache setup for the entire application.
The cache uses PostgreSQL to persist LLM responses across application restarts.
"""

import os

from langchain_community.cache import SQLAlchemyMd5Cache
from langchain_core.globals import set_llm_cache
from loguru import logger
from sqlalchemy import create_engine


def setup_langchain_cache() -> None:
    """
    Setup LangChain LLM cache using PostgreSQL.

    Uses LANGCHAIN_CACHE_DATABASE_URL environment variable for database connection.
    For Docker containers, this should use host.docker.internal to connect to the host PostgreSQL.

    The cache stores LLM responses to avoid redundant API calls, improving:
    - Response time for repeated queries
    - Cost efficiency by reducing API usage
    - System reliability by caching responses

    Raises:
        Exception: If cache setup fails (logged but not raised to prevent app crash)
    """
    try:
        database_url = os.getenv("LANGCHAIN_CACHE_DATABASE_URL")
        if not database_url:
            logger.warning(
                "LANGCHAIN_CACHE_DATABASE_URL not set — skipping cache setup"
            )
            return

        # Extract only the host portion for safe logging (never log credentials)
        from urllib.parse import urlparse

        parsed = urlparse(database_url)
        safe_host = f"{parsed.hostname}:{parsed.port or 5432}/{parsed.path.lstrip('/')}"
        logger.info(f"Setting up LangChain PostgreSQL cache at {safe_host}")

        engine = create_engine(database_url)
        set_llm_cache(SQLAlchemyMd5Cache(engine))

        logger.info("LangChain PostgreSQL cache initialized successfully")
    except Exception as e:
        logger.error(f"Failed to setup LangChain cache: {e}")
        logger.warning(
            "LangChain will run without caching - LLM responses will not be cached"
        )
        # Don't raise - allow app to continue without cache
