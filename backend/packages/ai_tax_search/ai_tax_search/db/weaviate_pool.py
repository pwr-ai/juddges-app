"""
Weaviate connection pool manager for efficient connection reuse.

This module provides a singleton connection pool that manages a persistent
Weaviate client instance, eliminating the overhead of creating new connections
for each search request.
"""

import asyncio
import os
import threading
from typing import Optional

import weaviate
from loguru import logger
from weaviate.classes.init import Auth, Timeout
from weaviate.config import AdditionalConfig, ConnectionConfig


class WeaviateConnectionPool:
    """
    Connection pool for Weaviate clients.
    
    Manages a single persistent WeaviateAsyncClient instance that is reused
    across all search operations, significantly reducing connection overhead.
    """

    def __init__(self):
        """Initialize connection pool with configuration from environment."""
        self._client: Optional[weaviate.WeaviateAsyncClient] = None
        self._is_connected: bool = False
        self.host = os.environ.get("WV_HOST", "localhost")
        self.port = os.environ.get("WV_PORT", "8084")
        self.grpc_port = os.environ.get("WV_GRPC_PORT", "8085")
        self.api_key = os.environ.get("WV_API_KEY", "")
        
        # Connection pool configuration (HTTP/gRPC level pooling)
        # These settings control the httpx connection pool size
        # Conservative defaults - can be increased via environment variables if needed
        self.pool_connections = int(os.getenv("WV_POOL_CONNECTIONS", "10"))  # Connections to keep in pool
        self.pool_maxsize = int(os.getenv("WV_POOL_MAXSIZE", "50"))  # Maximum connections
        self.pool_max_retries = int(os.getenv("WV_POOL_MAX_RETRIES", "3"))
        self.pool_timeout = int(os.getenv("WV_POOL_TIMEOUT", "5"))
        
        # Validate API key format if provided (basic validation)
        if self.api_key:
            if len(self.api_key) < 8:
                logger.warning("Weaviate API key appears to be too short (minimum 8 characters recommended)")
            # Don't log the actual key, just validate format
            if not isinstance(self.api_key, str):
                raise ValueError("Weaviate API key must be a string")

    async def connect(
        self, 
        max_retries: int = 3, 
        base_delay: float = 1.0
    ) -> None:
        """
        Establish connection to Weaviate if not already connected.
        
        This should be called during application startup.
        
        Args:
            max_retries: Maximum number of connection retry attempts (default: 3)
            base_delay: Base delay in seconds for exponential backoff (default: 1.0)
        """
        if self._is_connected and self._client and self._client.is_connected():
            logger.debug("Weaviate connection pool already connected")
            return

        last_exception = None
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    delay = base_delay * (2 ** (attempt - 1))
                    logger.info(
                        f"Retrying Weaviate connection (attempt {attempt + 1}/{max_retries}) "
                        f"after {delay:.1f}s delay..."
                    )
                    await asyncio.sleep(delay)
                
                logger.info(
                    f"Connecting to Weaviate at {self.host}:{self.port} (HTTP) "
                    f"and {self.host}:{self.grpc_port} (gRPC) "
                    f"(pool: {self.pool_connections}/{self.pool_maxsize})"
                )

                # Configure timeout settings
                timeout_config = Timeout(query=120, insert=60, init=10)
                
                # Configure connection pooling (HTTP/gRPC level)
                # This enables multiple concurrent connections within a single client
                connection_config = ConnectionConfig(
                    session_pool_connections=self.pool_connections,
                    session_pool_maxsize=self.pool_maxsize,
                    session_pool_max_retries=self.pool_max_retries,
                    session_pool_timeout=self.pool_timeout,
                )
                
                additional_config = AdditionalConfig(
                    timeout=timeout_config,
                    connection=connection_config,
                )

                self._client = weaviate.use_async_with_custom(
                    http_host=self.host,
                    http_port=int(self.port),
                    http_secure=False,  # Weaviate instances typically use HTTP
                    grpc_host=self.host,
                    grpc_port=int(self.grpc_port),
                    grpc_secure=False,  # Weaviate instances typically use plain gRPC
                    auth_credentials=Auth.api_key(self.api_key) if self.api_key else None,
                    skip_init_checks=True,
                    additional_config=additional_config,
                )
                await self._client.connect()
                
                # Validate connection with authenticated operation
                try:
                    await self._client.collections.list_all()
                except Exception as auth_error:
                    await self._client.close()
                    self._client = None
                    raise RuntimeError(
                        "Weaviate connection established but authentication failed. "
                        "Please verify your API key is correct."
                    ) from auth_error
                
                self._is_connected = True

                logger.info(
                    f"Successfully connected to Weaviate connection pool at "
                    f"{self.host}:{self.port} (HTTP) and {self.host}:{self.grpc_port} (gRPC)"
                )
                return
                
            except Exception as e:
                last_exception = e
                error_type = type(e).__name__
                # Sanitize error messages to prevent information leakage
                logger.error(
                    f"Failed to connect to Weaviate (attempt {attempt + 1}/{max_retries}): "
                    f"{error_type}"
                )
                # Clean up failed connection attempt
                if self._client is not None:
                    try:
                        await self._client.close()
                    except Exception:
                        pass  # Ignore cleanup errors
                    self._client = None
                self._is_connected = False
                
                # If this was the last attempt, raise the exception
                if attempt == max_retries - 1:
                    break
        
        # All retries exhausted
        self._is_connected = False
        self._client = None
        raise RuntimeError(
            f"Failed to connect to Weaviate after {max_retries} attempts. "
            "Please check your Weaviate configuration and network connectivity."
        ) from last_exception

    async def disconnect(self) -> None:
        """
        Close the Weaviate connection safely.
        
        This should be called during application shutdown.
        Handles cleanup even if connection is in a bad state.
        """
        if self._client is None:
            logger.debug("Weaviate connection pool already disconnected")
            self._is_connected = False
            return

        try:
            # Check if client is still connected before attempting to close
            if self._client.is_connected():
                await self._client.close()
                logger.info("Weaviate connection pool disconnected successfully")
        except Exception as e:
            # Sanitize error messages
            error_type = type(e).__name__
            logger.error(f"Error disconnecting from Weaviate: {error_type}")
        finally:
            # Always clean up state, even if close() failed
            self._client = None
            self._is_connected = False

    def reset(self) -> None:
        """
        Reset the connection pool state.
        
        This should only be called during application shutdown or testing.
        Note: This does not close the connection - use disconnect() first.
        """
        if self._client is not None:
            logger.warning(
                "reset() called but connection still exists. "
                "Call disconnect() first to properly close the connection."
            )
        self._client = None
        self._is_connected = False

    def __del__(self):
        """
        Destructor to ensure connection is closed when object is garbage collected.
        
        This provides a safety net in case disconnect() wasn't called explicitly.
        """
        if self._client is not None:
            try:
                # Note: We can't use await in __del__, so we log a warning
                # The proper cleanup should happen via disconnect() during shutdown
                logger.warning(
                    "WeaviateConnectionPool being destroyed with active connection. "
                    "Ensure disconnect() is called during application shutdown."
                )
            except Exception:
                # Ignore errors in destructor
                pass

    def get_client(self) -> weaviate.WeaviateAsyncClient:
        """
        Get the pooled Weaviate client instance.
        
        Returns:
            The shared WeaviateAsyncClient instance
            
        Raises:
            RuntimeError: If the pool is not connected or connection is lost
        """
        if not self._is_connected or not self._client:
            raise RuntimeError(
                "Weaviate connection pool is not connected. "
                "Call connect() first or ensure pool was initialized in FastAPI lifespan."
            )

        # Safely check connection status
        try:
            if not self._client.is_connected():
                # Connection was lost, mark as disconnected
                logger.warning("Weaviate client connection lost")
                self._is_connected = False
                raise RuntimeError(
                    "Weaviate client connection lost. "
                    "The connection pool needs to be reconnected."
                )
        except Exception as e:
            # If is_connected() itself raises an exception, connection is definitely bad
            error_type = type(e).__name__
            logger.error(f"Error checking Weaviate connection status: {error_type}")
            self._is_connected = False
            self._client = None
            raise RuntimeError(
                "Weaviate client connection is in an invalid state. "
                "The connection pool needs to be reconnected."
            ) from e

        return self._client

    async def health_check(self) -> bool:
        """
        Check if the connection is healthy.
        
        Uses a lightweight check by verifying connection status rather than
        performing expensive operations like listing all collections.
        
        Returns:
            True if connection is healthy, False otherwise
        """
        try:
            if not self._client or not self._is_connected:
                return False
            # Use lightweight connection check instead of expensive list_all()
            if not self._client.is_connected():
                return False
            # Connection is healthy if is_connected() returns True
            # We avoid list_all() as it can be expensive with many collections
            return True
        except Exception as e:
            error_type = type(e).__name__
            logger.warning(f"Weaviate health check failed: {error_type}")
            return False

    @property
    def is_connected(self) -> bool:
        """
        Check if the pool is currently connected.
        
        Returns:
            True if pool is connected and client is available and connected, False otherwise
        """
        try:
            return (
                self._is_connected 
                and self._client is not None 
                and self._client.is_connected()
            )
        except Exception:
            # If is_connected() raises, connection is definitely not healthy
            return False


# Global pool instance with thread-safe access
_global_pool: Optional[WeaviateConnectionPool] = None
_pool_lock = threading.Lock()


def get_weaviate_pool() -> WeaviateConnectionPool:
    """
    Get the global Weaviate connection pool instance (thread-safe singleton).
    
    Uses double-checked locking pattern to ensure thread safety while
    maintaining performance.
    
    Returns:
        The singleton WeaviateConnectionPool instance
    """
    global _global_pool
    if _global_pool is None:
        with _pool_lock:
            # Double-check pattern: verify pool is still None after acquiring lock
            if _global_pool is None:
                _global_pool = WeaviateConnectionPool()
    return _global_pool


async def cleanup_weaviate_pool() -> None:
    """
    Safely cleanup the global Weaviate connection pool (thread-safe).
    
    This should be called during application shutdown to ensure
    all connections are properly closed.
    """
    global _global_pool
    with _pool_lock:
        if _global_pool is not None:
            try:
                await _global_pool.disconnect()
            except Exception as e:
                error_type = type(e).__name__
                logger.error(f"Error during Weaviate pool cleanup: {error_type}")
            finally:
                if _global_pool is not None:
                    _global_pool.reset()
                _global_pool = None

