"""
LangChain cache configuration using PostgreSQL.

This module provides global LangChain LLM cache setup for the entire application.
The cache uses PostgreSQL to persist LLM responses across application restarts.
"""

import os

from loguru import logger

from langchain_community.cache import SQLAlchemyMd5Cache
from langchain_core.globals import set_llm_cache
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
        database_url = os.getenv(
            "LANGCHAIN_CACHE_DATABASE_URL",
            "postgresql://llm_cache:xNnseZW5SjjU5j7DKGyW_2oNFRsq1vdBGpgjwzsqB-w@host.docker.internal:5555/llm_cache",
        )

        logger.info(
            f"Setting up LangChain PostgreSQL cache at {database_url.split('@')[1]}"
        )

        engine = create_engine(database_url)
        set_llm_cache(SQLAlchemyMd5Cache(engine))

        logger.info("LangChain PostgreSQL cache initialized successfully")
    except Exception as e:
        logger.error(f"Failed to setup LangChain cache: {e}")
        logger.warning(
            "LangChain will run without caching - LLM responses will not be cached"
        )
        # Don't raise - allow app to continue without cache
