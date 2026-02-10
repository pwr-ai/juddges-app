import os
import re
from abc import ABC
from typing import Any, ClassVar, Optional

import weaviate
from loguru import logger
from weaviate.classes.init import Auth, Timeout
from weaviate.config import AdditionalConfig, ConnectionConfig

try:
    from ai_tax_search.db.weaviate_pool import get_weaviate_pool
    WEAVIATE_POOL_AVAILABLE = True
except ImportError:
    WEAVIATE_POOL_AVAILABLE = False
    get_weaviate_pool = None


class WeaviateDatabase(ABC):
    def __init__(
        self,
        host: str | None = None,
        port: str | None = None,
        grpc_port: str | None = None,
        api_key: str | None = None,
        use_pool: bool | None = None,
    ):
        # Use environment variables as defaults if not provided
        self.host = host or os.environ.get("WV_HOST", "localhost")
        self.port = port or os.environ.get("WV_PORT", "8084")
        self.grpc_port = grpc_port or os.environ.get("WV_GRPC_PORT", "8085")
        self.__api_key = api_key or os.environ.get("WV_API_KEY", "")
        
        # Validate API key format if provided
        if self.__api_key:
            if not isinstance(self.__api_key, str):
                raise ValueError("Weaviate API key must be a string")
            if len(self.__api_key) < 8:
                logger.warning("Weaviate API key appears to be too short (minimum 8 characters recommended)")
        
        # Connection pool configuration (HTTP/gRPC level pooling)
        # These settings control the httpx connection pool size
        # Conservative defaults - can be increased via environment variables if needed
        self.pool_connections = int(os.getenv("WV_POOL_CONNECTIONS", "10"))
        self.pool_maxsize = int(os.getenv("WV_POOL_MAXSIZE", "50"))
        self.pool_max_retries = int(os.getenv("WV_POOL_MAX_RETRIES", "3"))
        self.pool_timeout = int(os.getenv("WV_POOL_TIMEOUT", "5"))
        
        # Determine if we should use pool (default: True if WEAVIATE_USE_POOL is not explicitly False)
        if use_pool is None:
            use_pool = os.getenv("WEAVIATE_USE_POOL", "true").lower() == "true"
        self.use_pool = use_pool
        self._pool_client: Optional[weaviate.WeaviateAsyncClient] = None

        self.client: weaviate.WeaviateAsyncClient

    async def __aenter__(self) -> "WeaviateDatabase":
        # If using pool, get client from pool instead of creating new connection
        if self.use_pool and WEAVIATE_POOL_AVAILABLE and get_weaviate_pool:
            try:
                pool = get_weaviate_pool()
                self.client = pool.get_client()
                self._pool_client = self.client
                logger.debug("Using Weaviate connection from pool")
                return self
            except RuntimeError as e:
                # Sanitize error message to prevent information leakage
                error_type = type(e).__name__
                logger.warning(
                    f"Failed to get client from pool ({error_type}). "
                    "Falling back to creating new connection."
                )
                # Fall through to create new connection

        # Connect to Weaviate with HTTP and gRPC support
        # NOTE: Weaviate Python client v4 requires BOTH ports to be accessible:
        #   - HTTP port (8084) for REST API
        #   - gRPC port (8085) for high-performance vector operations
        # If gRPC port is not accessible, vector search queries will fail

        try:
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

            self.client = weaviate.use_async_with_custom(
                http_host=self.host,
                http_port=int(self.port),
                http_secure=False,  # Weaviate instances typically use HTTP
                grpc_host=self.host,
                grpc_port=int(self.grpc_port),
                grpc_secure=False,  # Weaviate instances typically use plain gRPC
                auth_credentials=Auth.api_key(self.__api_key) if self.__api_key else None,
                skip_init_checks=True,
                additional_config=additional_config,
            )
            await self.client.connect()
            
            # Validate connection with authenticated operation
            try:
                await self.client.collections.list_all()
            except Exception as auth_error:
                await self.client.close()
                raise RuntimeError(
                    "Weaviate connection established but authentication failed. "
                    "Please verify your API key is correct."
                ) from auth_error

            logger.info(
                f"Connected to Weaviate at {self.host}:{self.port} (HTTP) "
                f"and {self.host}:{self.grpc_port} (gRPC)"
            )
            return self
        except Exception as e:
            # Sanitize error messages to prevent information leakage
            error_type = type(e).__name__
            logger.error(f"Failed to connect to Weaviate: {error_type}")
            raise RuntimeError(
                "Failed to establish Weaviate connection. "
                "Please check your configuration and network connectivity."
            ) from e

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        # If using pool, don't close the connection (it's shared)
        if self._pool_client is not None:
            # Connection came from pool, don't close it
            return
            
        # Otherwise, close the connection we created
        try:
            if self.client and self.client.is_connected():
                await self.client.close()
        except Exception as e:
            # Sanitize error messages
            error_type = type(e).__name__
            logger.warning(f"Error closing Weaviate connection: {error_type}")
            # Don't re-raise - cleanup errors shouldn't propagate

    async def close(self) -> None:
        await self.__aexit__(None, None, None)

    @property
    def api_key(self):
        if self.__api_key is not None:
            return Auth.api_key(self.__api_key)
        logger.error("No API key provided")
        return None

    async def insert_batch(
        self,
        collection: weaviate.collections.Collection,
        objects: list[dict[str, Any]],
    ) -> None:
        try:
            response = await collection.data.insert_many(objects)
            if response.has_errors:
                # Sanitize error messages - don't expose full error details
                error_count = len(response.errors)
                error_types = set(type(err).__name__ for err in response.errors)
                raise ValueError(
                    f"Error ingesting batch: {error_count} error(s) of type(s) {error_types}. "
                    "Check Weaviate logs for details."
                )
        except ValueError:
            # Re-raise ValueError as-is (already sanitized)
            raise
        except Exception as e:
            # Sanitize other exceptions
            error_type = type(e).__name__
            logger.error(f"Unexpected error during batch insert: {error_type}")
            raise RuntimeError("Failed to insert batch into Weaviate") from e

    async def get_uuids(self, collection: weaviate.collections.Collection) -> list[str]:
        result = []
        async for obj in collection.iterator(return_properties=[]):
            result.append(str(obj.uuid))
        return result

    async def _safe_create_collection(self, *args: Any, **kwargs: Any) -> None:
        try:
            await self.client.collections.create(*args, **kwargs)
        except weaviate.exceptions.UnexpectedStatusCodeError as err:
            if re.search(r"class name (\w+?) already exists", err.message) and err.status_code == 422:
                pass
            else:
                raise


class WeaviateLegalDatabase(WeaviateDatabase):
    LEGAL_DOCUMENTS_COLLECTION: ClassVar[str] = "LegalDocuments"
    DOCUMENT_CHUNKS_COLLECTION: ClassVar[str] = "DocumentChunks"

    @property
    def legal_documents_collection(self) -> weaviate.collections.Collection:
        return self.client.collections.get(self.LEGAL_DOCUMENTS_COLLECTION)

    @property
    def document_chunks_collection(self) -> weaviate.collections.Collection:
        return self.client.collections.get(self.DOCUMENT_CHUNKS_COLLECTION)

    @staticmethod
    def uuid_from_document_chunk_id(document_id: str, chunk_id: int) -> str:
        return weaviate.util.generate_uuid5(f"{document_id}_chunk_{chunk_id}")
