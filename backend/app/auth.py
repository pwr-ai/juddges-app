import os
import secrets
from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader
from loguru import logger

# Configure API key authentication
API_KEY = os.getenv("BACKEND_API_KEY")
if not API_KEY:
    raise ValueError("BACKEND_API_KEY environment variable not set")

api_key_header = APIKeyHeader(name="X-API-Key")


async def verify_api_key(api_key: str = Depends(api_key_header)):
    """
    Verify API key using constant-time comparison to prevent timing attacks.

    Args:
        api_key: API key from request header

    Returns:
        The verified API key

    Raises:
        HTTPException: If API key is invalid
    """
    # Use secrets.compare_digest for constant-time comparison
    # This prevents timing attacks that could leak information about the API key

    if not secrets.compare_digest(api_key, API_KEY):
        logger.warning("Invalid API key attempt from request")
        raise HTTPException(status_code=401, detail="Invalid API key")

    return api_key
