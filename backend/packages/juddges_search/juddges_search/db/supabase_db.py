import os
import warnings
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from supabase import create_client, Client
from supabase.client import ClientOptions
from loguru import logger
from fastapi import HTTPException

# Suppress SSL ResourceWarnings from httpx/supabase client
warnings.filterwarnings("ignore", category=ResourceWarning, message=".*ssl.SSLSocket.*")

# Suppress DeprecationWarnings from supabase library's internal timeout parameter usage
# This is a library issue, not an issue with our code
warnings.filterwarnings("ignore", category=DeprecationWarning, message=".*timeout.*parameter.*deprecated.*")
warnings.filterwarnings("ignore", category=DeprecationWarning, message=".*verify.*parameter.*deprecated.*")


class CollectionsDB:
    """Database operations for collections management."""

    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not self.url or not self.service_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

        # Use ClientOptions to configure timeout instead of deprecated timeout parameter
        options = ClientOptions(postgrest_client_timeout=30, storage_client_timeout=30, schema="public")
        self.client: Client = create_client(self.url, self.service_key, options=options)
        logger.info(f"Initialized CollectionsDB with Supabase client: {self.url[:50]}...")

    def _handle_error(self, operation: str, error: Exception) -> None:
        logger.error(f"Supabase error during {operation}: {error}")

        error_msg = str(error).lower()
        if "duplicate key" in error_msg or "already exists" in error_msg:
            raise HTTPException(status_code=409, detail="Resource already exists")
        elif "not found" in error_msg or "no rows" in error_msg:
            raise HTTPException(status_code=404, detail="Resource not found")
        else:
            raise HTTPException(status_code=500, detail=f"Database error: {str(error)}")

    async def get_user_collections(self, user_id: str) -> List[Dict[str, Any]]:
        try:
            # First get all collections for the user
            response = (
                self.client.table("collections")
                .select("id, name, description, user_id, created_at, updated_at")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )

            if not response.data:
                return []

            collections = response.data
            collection_ids = [c["id"] for c in collections]

            # Batch-fetch all documents for all collections in a single query
            all_docs: List[Dict[str, Any]] = []
            page_size = 1000
            offset = 0

            while True:
                docs_response = (
                    self.client.table("collection_supabase_documents")
                    .select("collection_id, document_id")
                    .in_("collection_id", collection_ids)
                    .range(offset, offset + page_size - 1)
                    .execute()
                )

                if not docs_response.data:
                    break

                all_docs.extend(docs_response.data)

                if len(docs_response.data) < page_size:
                    break

                offset += page_size

            # Group documents by collection_id in Python
            docs_by_collection: Dict[str, List[Dict[str, Any]]] = {c["id"]: [] for c in collections}
            for doc in all_docs:
                cid = doc["collection_id"]
                if cid in docs_by_collection:
                    docs_by_collection[cid].append({"document_id": doc["document_id"]})

            for collection in collections:
                docs = docs_by_collection[collection["id"]]
                collection["collection_supabase_documents"] = docs
                collection["document_count"] = len(docs)

            return collections
        except Exception as e:
            logger.error(f"Error getting user collections: {e}")
            return []

    async def find_collection(
        self, collection_id: str, user_id: str, limit: Optional[int] = None, offset: int = 0
    ) -> Optional[Dict[str, Any]]:
        try:
            # First get the collection
            response = (
                self.client.table("collections")
                .select("id, name, description, user_id, created_at, updated_at")
                .eq("id", collection_id)
                .eq("user_id", user_id)
                .execute()
            )

            if not response.data:
                return None

            collection = response.data[0]

            # Get total document count first
            count_response = (
                self.client.table("collection_supabase_documents")
                .select("document_id", count="exact")
                .eq("collection_id", collection_id)
                .execute()
            )
            total_count = count_response.count if count_response.count is not None else len(count_response.data or [])
            collection["document_count"] = total_count

            # Fetch document IDs with pagination and sorting (newest first)
            if limit is not None:
                # Paginated fetch
                docs_response = (
                    self.client.table("collection_supabase_documents")
                    .select("document_id, created_at")
                    .eq("collection_id", collection_id)
                    .order("created_at", desc=True)
                    .range(offset, offset + limit - 1)
                    .execute()
                )
                all_documents = docs_response.data or []
            else:
                # Fetch all documents with pagination (for large collections)
                all_documents = []
                page_size = 1000
                current_offset = 0

                while True:
                    docs_response = (
                        self.client.table("collection_supabase_documents")
                        .select("document_id, created_at")
                        .eq("collection_id", collection_id)
                        .order("created_at", desc=True)
                        .range(current_offset, current_offset + page_size - 1)
                        .execute()
                    )

                    if not docs_response.data:
                        break

                    all_documents.extend(docs_response.data)

                    if len(docs_response.data) < page_size:
                        break

                    current_offset += page_size

            collection["collection_supabase_documents"] = all_documents
            return collection
        except Exception as e:
            logger.error(f"Error finding collection: {e}")
            return None

    async def create_collection(self, user_id: str, name: str, description: Optional[str] = None) -> Dict[str, Any]:
        try:
            data = {"user_id": user_id, "name": name}
            if description:
                data["description"] = description

            response = self.client.table("collections").insert(data).execute()

            return response.data[0] if response.data else {}
        except Exception as e:
            self._handle_error("create_collection", e)
            return {}

    async def update_collection(self, collection_id: str, user_id: str, name: str) -> Dict[str, Any]:
        try:
            response = (
                self.client.table("collections")
                .update({"name": name})
                .eq("id", collection_id)
                .eq("user_id", user_id)
                .execute()
            )

            if not response.data:
                raise HTTPException(status_code=404, detail="Collection not found")

            return response.data[0]
        except HTTPException:
            raise
        except Exception as e:
            self._handle_error("update_collection", e)
            return {}

    async def delete_collection(self, collection_id: str, user_id: str) -> bool:
        """Delete a collection and all its documents."""
        try:
            # Delete from collection_supabase_documents table
            self.client.table("collection_supabase_documents").delete().eq("collection_id", collection_id).execute()

            response = (
                self.client.table("collections").delete().eq("id", collection_id).eq("user_id", user_id).execute()
            )

            return bool(response.data)
        except Exception as e:
            logger.error(f"Error deleting collection: {e}")
            return False

    async def add_document(self, collection_id: str, document_id: str, user_id: str) -> bool:
        """Add a document to a collection."""
        collection = await self.find_collection(collection_id, user_id)
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")

        try:
            # Use collection_supabase_documents table for document IDs (text type)
            existing = (
                self.client.table("collection_supabase_documents")
                .select("collection_id, document_id")
                .eq("collection_id", collection_id)
                .eq("document_id", document_id)
                .execute()
            )

            if existing.data:
                logger.info(f"Document {document_id} already in collection {collection_id}")
                return True

            self.client.table("collection_supabase_documents").insert(
                {"collection_id": collection_id, "document_id": document_id}
            ).execute()

            logger.info(f"Added document {document_id} to collection {collection_id}")
            return True

        except Exception as e:
            error_msg = str(e).lower()
            if "duplicate" in error_msg or "already exists" in error_msg:
                return True

            logger.error(f"Error adding document to collection: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to add document: {str(e)}")

    async def remove_document(self, collection_id: str, document_id: str, user_id: str) -> bool:
        collection = await self.find_collection(collection_id, user_id)
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")

        try:
            # Use collection_supabase_documents table for document IDs
            (
                self.client.table("collection_supabase_documents")
                .delete()
                .eq("collection_id", collection_id)
                .eq("document_id", document_id)
                .execute()
            )

            logger.info(f"Removed document {document_id} from collection {collection_id}")
            return True

        except Exception as e:
            logger.error(f"Error removing document from collection: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to remove document: {str(e)}")

    async def get_collection_documents(self, collection_id: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all documents in a collection with their full metadata.

        Note: user_id is kept for API compatibility but not used for filtering.
        Any user can retrieve documents from any collection.
        """
        # Check if collection exists (without user_id filtering)
        try:
            collection_check = self.client.table("collections").select("id").eq("id", collection_id).execute()

            if not collection_check.data:
                raise HTTPException(status_code=404, detail="Collection not found")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking collection existence: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to check collection: {str(e)}")

        try:
            # Get document IDs from collection_supabase_documents
            response = (
                self.client.table("collection_supabase_documents")
                .select("document_id")
                .eq("collection_id", collection_id)
                .execute()
            )

            if not response.data:
                return []

            # Return simple document list with just IDs
            documents = []
            for item in response.data:
                doc_id = item.get("document_id")
                if doc_id:
                    documents.append(
                        {
                            "id": doc_id,
                            "document_id": doc_id,  # For compatibility with frontend
                        }
                    )

            logger.info(f"Retrieved {len(documents)} documents from collection {collection_id}")
            return documents

        except Exception as e:
            logger.error(f"Error getting collection documents: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get documents: {str(e)}")


class SupabaseDB:
    """Database operations for schema management."""

    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not self.url or not self.service_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

        self.client: Client = create_client(self.url, self.service_key)
        logger.info(f"Initialized SupabaseDB with Supabase client: {self.url[:50]}...")

    def _handle_error(self, operation: str, error: Exception) -> None:
        logger.error(f"Supabase error during {operation}: {error}")

        error_msg = str(error).lower()
        if "duplicate key" in error_msg or "already exists" in error_msg:
            raise HTTPException(status_code=409, detail="Resource already exists")
        elif "not found" in error_msg or "no rows" in error_msg:
            raise HTTPException(status_code=404, detail="Resource not found")
        else:
            raise HTTPException(status_code=500, detail=f"Database error: {str(error)}")

    async def add_schema(
        self,
        schema_name: str,
        schema: str,
        description: Optional[str] = None,
        type: Optional[str] = None,
        category: Optional[str] = None,
        dates: Optional[Dict[str, Any]] = None,
        status: Optional[str] = None,
        is_verified: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Adds a schema to the 'extraction_schemas' table.
        Verifies that the schema_name is unique before adding.
        """
        existing_schema = await self.get_schema_by_name(schema_name)
        if existing_schema:
            raise HTTPException(status_code=409, detail=f"Schema with name '{schema_name}' already exists.")

        try:
            data: Dict[str, Any] = {
                "name": schema_name,
                "text": schema,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if description:
                data["description"] = description
            if type:
                data["type"] = type
            if category:
                data["category"] = category
            if status:
                data["status"] = status
            if is_verified is not None:
                data["is_verified"] = is_verified

            data["dates"] = dates if dates else {}
            response = self.client.table("extraction_schemas").insert(data).execute()

            return response.data[0] if response.data else {}
        except Exception as e:
            self._handle_error("add_schema", e)
            return {}  # Unreachable, as _handle_error always raises

    async def update_schema(
        self,
        schema_id: str,
        schema_name: str,
        schema: str,
        description: Optional[str] = None,
        type: Optional[str] = None,
        category: Optional[str] = None,
        dates: Optional[Dict[str, Any]] = None,
        status: Optional[str] = None,
        is_verified: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Updates an existing schema in the 'extraction_schemas' table."""
        try:
            data: Dict[str, Any] = {
                "name": schema_name,
                "text": schema,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if description is not None:
                data["description"] = description
            if type is not None:
                data["type"] = type
            if category is not None:
                data["category"] = category
            if dates is not None:
                data["dates"] = dates
            if status is not None:
                data["status"] = status
            if is_verified is not None:
                data["is_verified"] = is_verified

            response = self.client.table("extraction_schemas").update(data).eq("id", schema_id).execute()

            return response.data[0] if response.data else {}
        except Exception as e:
            self._handle_error("update_schema", e)
            return {}  # Unreachable

    async def get_schemas(self, include_text: bool = True) -> List[Dict[str, Any]]:
        """
        Retrieves all schemas from the 'extraction_schemas' table.
        If include_text is False, the 'text' field is excluded.
        """
        try:
            columns = (
                "*"
                if include_text
                else "id, name, description, type, category, dates, created_at, updated_at, user_id, status, is_verified"
            )

            response = self.client.table("extraction_schemas").select(columns).order("created_at", desc=True).execute()

            return response.data or []
        except Exception as e:
            self._handle_error("get_schemas", e)
            return []  # Unreachable

    async def get_schema_by_name(self, schema_name: str) -> Optional[Dict[str, Any]]:
        """Retrieves a specific schema by its name."""
        try:
            response = (
                self.client.table("extraction_schemas")
                .select(
                    "id, name, text, type, category, description, user_id, is_public, version, status, created_at, updated_at"
                )
                .eq("name", schema_name)
                .limit(1)
                .execute()
            )

            return response.data[0] if response.data else None
        except Exception as e:
            self._handle_error("get_schema_by_name", e)


class PublicationsDB:
    """Database operations for publications management."""

    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not self.url or not self.service_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

        options = ClientOptions(postgrest_client_timeout=30, storage_client_timeout=30, schema="public")
        self.client: Client = create_client(self.url, self.service_key, options=options)
        logger.info(f"Initialized PublicationsDB with Supabase client: {self.url[:50]}...")

    def _handle_error(self, operation: str, error: Exception) -> None:
        logger.error(f"Supabase error during {operation}: {error}")

        error_msg = str(error).lower()
        if "duplicate key" in error_msg or "already exists" in error_msg:
            raise HTTPException(status_code=409, detail="Resource already exists")
        elif "not found" in error_msg or "no rows" in error_msg:
            raise HTTPException(status_code=404, detail="Resource not found")
        else:
            raise HTTPException(status_code=500, detail=f"Database error: {str(error)}")

    async def get_publications(
        self,
        project: Optional[str] = None,
        year: Optional[int] = None,
        status: Optional[str] = None,
        pub_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Get all publications with optional filtering."""
        try:
            query = self.client.table("publications").select(
                "*, publication_schemas(schema_id, description, created_at), "
                "publication_collections(collection_id, description, created_at), "
                "publication_extraction_jobs(job_id, description, created_at)"
            )

            if project:
                query = query.eq("project", project)
            if year:
                query = query.eq("year", year)
            if status:
                query = query.eq("status", status)
            if pub_type:
                query = query.eq("type", pub_type)

            response = (
                query.order("year", desc=True)
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )

            return response.data or []
        except Exception as e:
            logger.error(f"Error getting publications: {e}")
            return []

    async def get_publication(self, publication_id: str) -> Optional[Dict[str, Any]]:
        """Get a single publication by ID with linked schemas, collections, and extraction jobs."""
        try:
            response = (
                self.client.table("publications")
                .select(
                    "*, publication_schemas(schema_id, description, created_at), "
                    "publication_collections(collection_id, description, created_at), "
                    "publication_extraction_jobs(job_id, description, created_at)"
                )
                .eq("id", publication_id)
                .execute()
            )

            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting publication: {e}")
            return None

    async def create_publication(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new publication."""
        try:
            # Extract schema, collection, and extraction job IDs for junction tables
            schema_ids = data.pop("schema_ids", [])
            collection_ids = data.pop("collection_ids", [])
            extraction_job_ids = data.pop("extraction_job_ids", [])

            # Insert the publication
            response = self.client.table("publications").insert(data).execute()

            if not response.data:
                raise HTTPException(status_code=500, detail="Failed to create publication")

            publication = response.data[0]
            publication_id = publication["id"]

            # Add schema links
            if schema_ids:
                schema_links = [{"publication_id": publication_id, "schema_id": sid} for sid in schema_ids]
                self.client.table("publication_schemas").insert(schema_links).execute()

            # Add collection links
            if collection_ids:
                collection_links = [{"publication_id": publication_id, "collection_id": cid} for cid in collection_ids]
                self.client.table("publication_collections").insert(collection_links).execute()

            # Add extraction job links
            if extraction_job_ids:
                job_links = [{"publication_id": publication_id, "job_id": jid} for jid in extraction_job_ids]
                self.client.table("publication_extraction_jobs").insert(job_links).execute()

            # Return the full publication with links
            return await self.get_publication(publication_id) or publication
        except HTTPException:
            raise
        except Exception as e:
            self._handle_error("create_publication", e)
            return {}

    async def update_publication(self, publication_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing publication."""
        try:
            data["updated_at"] = datetime.now(timezone.utc).isoformat()
            response = self.client.table("publications").update(data).eq("id", publication_id).execute()

            if not response.data:
                raise HTTPException(status_code=404, detail="Publication not found")

            return await self.get_publication(publication_id) or response.data[0]
        except HTTPException:
            raise
        except Exception as e:
            self._handle_error("update_publication", e)
            return {}

    async def delete_publication(self, publication_id: str) -> bool:
        """Delete a publication and all its links."""
        try:
            # Junction tables will cascade delete due to ON DELETE CASCADE
            response = self.client.table("publications").delete().eq("id", publication_id).execute()
            return bool(response.data)
        except Exception as e:
            logger.error(f"Error deleting publication: {e}")
            return False

    async def add_schema_link(self, publication_id: str, schema_id: str, description: Optional[str] = None) -> bool:
        """Link a schema to a publication."""
        try:
            data = {"publication_id": publication_id, "schema_id": schema_id}
            if description:
                data["description"] = description

            self.client.table("publication_schemas").insert(data).execute()
            logger.info(f"Linked schema {schema_id} to publication {publication_id}")
            return True
        except Exception as e:
            error_msg = str(e).lower()
            if "duplicate" in error_msg or "already exists" in error_msg:
                return True
            logger.error(f"Error linking schema: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to link schema: {str(e)}")

    async def remove_schema_link(self, publication_id: str, schema_id: str) -> bool:
        """Remove a schema link from a publication."""
        try:
            self.client.table("publication_schemas").delete().eq("publication_id", publication_id).eq(
                "schema_id", schema_id
            ).execute()
            logger.info(f"Removed schema {schema_id} from publication {publication_id}")
            return True
        except Exception as e:
            logger.error(f"Error removing schema link: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to remove schema link: {str(e)}")

    async def add_collection_link(
        self, publication_id: str, collection_id: str, description: Optional[str] = None
    ) -> bool:
        """Link a collection to a publication."""
        try:
            data = {"publication_id": publication_id, "collection_id": collection_id}
            if description:
                data["description"] = description

            self.client.table("publication_collections").insert(data).execute()
            logger.info(f"Linked collection {collection_id} to publication {publication_id}")
            return True
        except Exception as e:
            error_msg = str(e).lower()
            if "duplicate" in error_msg or "already exists" in error_msg:
                return True
            logger.error(f"Error linking collection: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to link collection: {str(e)}")

    async def remove_collection_link(self, publication_id: str, collection_id: str) -> bool:
        """Remove a collection link from a publication."""
        try:
            self.client.table("publication_collections").delete().eq("publication_id", publication_id).eq(
                "collection_id", collection_id
            ).execute()
            logger.info(f"Removed collection {collection_id} from publication {publication_id}")
            return True
        except Exception as e:
            logger.error(f"Error removing collection link: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to remove collection link: {str(e)}")

    async def get_publication_schemas(self, publication_id: str) -> List[Dict[str, Any]]:
        """Get all schemas linked to a publication with schema details."""
        try:
            response = (
                self.client.table("publication_schemas")
                .select("schema_id, description, created_at, extraction_schemas(id, name, description, status)")
                .eq("publication_id", publication_id)
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.error(f"Error getting publication schemas: {e}")
            return []

    async def get_publication_collections(self, publication_id: str) -> List[Dict[str, Any]]:
        """Get all collections linked to a publication with collection details."""
        try:
            response = (
                self.client.table("publication_collections")
                .select("collection_id, description, created_at, collections(id, name, description)")
                .eq("publication_id", publication_id)
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.error(f"Error getting publication collections: {e}")
            return []

    async def add_extraction_job_link(
        self, publication_id: str, job_id: str, description: Optional[str] = None
    ) -> bool:
        """Link an extraction job to a publication."""
        try:
            data = {"publication_id": publication_id, "job_id": job_id}
            if description:
                data["description"] = description

            self.client.table("publication_extraction_jobs").insert(data).execute()
            logger.info(f"Linked extraction job {job_id} to publication {publication_id}")
            return True
        except Exception as e:
            error_msg = str(e).lower()
            if "duplicate" in error_msg or "already exists" in error_msg:
                return True
            logger.error(f"Error linking extraction job: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to link extraction job: {str(e)}")

    async def remove_extraction_job_link(self, publication_id: str, job_id: str) -> bool:
        """Remove an extraction job link from a publication."""
        try:
            self.client.table("publication_extraction_jobs").delete().eq("publication_id", publication_id).eq(
                "job_id", job_id
            ).execute()
            logger.info(f"Removed extraction job {job_id} from publication {publication_id}")
            return True
        except Exception as e:
            logger.error(f"Error removing extraction job link: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to remove extraction job link: {str(e)}")

    async def get_publication_extraction_jobs(self, publication_id: str) -> List[Dict[str, Any]]:
        """Get all extraction jobs linked to a publication with job details."""
        try:
            response = (
                self.client.table("publication_extraction_jobs")
                .select("job_id, description, created_at, extraction_jobs(id, job_id, status, schema_name, created_at)")
                .eq("publication_id", publication_id)
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.error(f"Error getting publication extraction jobs: {e}")
            return []


class SupabaseVectorDB:
    """Database operations for vector search using pgvector.

    This class provides semantic search capabilities using Supabase's pgvector extension.
    It supports:
    - Pure vector similarity search
    - Hybrid search (vector + full-text + metadata filters)
    - Chunk-level search for RAG applications
    """

    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not self.url or not self.service_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

        options = ClientOptions(
            postgrest_client_timeout=60,  # Longer timeout for vector searches
            storage_client_timeout=30,
            schema="public",
        )
        self.client: Client = create_client(self.url, self.service_key, options=options)
        logger.info(f"Initialized SupabaseVectorDB for URL: {self.url[:50]}...")

    async def search_by_vector(
        self,
        query_embedding: List[float],
        match_count: int = 10,
        match_threshold: float = 0.5,
    ) -> List[Dict[str, Any]]:
        """
        Pure vector similarity search.

        Args:
            query_embedding: 1024-dimensional embedding vector
            match_count: Maximum number of results
            match_threshold: Minimum similarity score (0-1)

        Returns:
            List of documents with similarity scores
        """
        try:
            response = self.client.rpc(
                "search_documents_by_vector",
                {
                    "query_embedding": query_embedding,
                    "match_count": match_count,
                    "match_threshold": match_threshold,
                },
            ).execute()

            return response.data or []
        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Vector search failed: {str(e)}")

    async def hybrid_search(
        self,
        query_text: str,
        query_embedding: List[float],
        document_type: Optional[str] = None,
        court_name: Optional[str] = None,
        language: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        country: Optional[str] = None,
        match_count: int = 10,
        vector_weight: float = 0.7,
        text_weight: float = 0.3,
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining vector similarity, full-text search, and metadata filters.

        Args:
            query_text: Text query for full-text search
            query_embedding: 1024-dimensional embedding vector
            document_type: Filter by document type (e.g., "judgment", "tax_interpretation")
            court_name: Filter by court name (partial match)
            language: Filter by language code (e.g., "pl", "en")
            start_date: Filter documents issued after this date (ISO format)
            end_date: Filter documents issued before this date (ISO format)
            country: Filter by country code (e.g., "PL", "UK")
            match_count: Maximum number of results
            vector_weight: Weight for vector similarity (0-1)
            text_weight: Weight for text search (0-1)

        Returns:
            List of documents with combined scores
        """
        try:
            response = self.client.rpc(
                "hybrid_search_documents",
                {
                    "query_text": query_text,
                    "query_embedding": query_embedding,
                    "p_document_type": document_type,
                    "p_court_name": court_name,
                    "p_language": language,
                    "p_start_date": start_date,
                    "p_end_date": end_date,
                    "p_country": country,
                    "match_count": match_count,
                    "vector_weight": vector_weight,
                    "text_weight": text_weight,
                },
            ).execute()

            return response.data or []
        except Exception as e:
            logger.error(f"Hybrid search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Hybrid search failed: {str(e)}")

    async def search_chunks(
        self,
        query_embedding: List[float],
        match_count: int = 20,
        match_threshold: float = 0.5,
        include_key_sections_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Chunk-level semantic search for RAG applications.

        Args:
            query_embedding: 1024-dimensional embedding vector
            match_count: Maximum number of chunks to return
            match_threshold: Minimum similarity score (0-1)
            include_key_sections_only: If True, only return key sections (holdings, conclusions)

        Returns:
            List of chunks with similarity scores
        """
        try:
            response = self.client.rpc(
                "search_document_chunks",
                {
                    "query_embedding": query_embedding,
                    "match_count": match_count,
                    "match_threshold": match_threshold,
                    "include_key_sections_only": include_key_sections_only,
                },
            ).execute()

            return response.data or []
        except Exception as e:
            logger.error(f"Chunk search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Chunk search failed: {str(e)}")

    async def get_document_chunks(
        self,
        document_id: str,
        include_embeddings: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Get all chunks for a specific document.

        Args:
            document_id: The document ID
            include_embeddings: Whether to include embedding vectors

        Returns:
            List of chunks ordered by chunk_index
        """
        try:
            response = self.client.rpc(
                "get_document_chunks",
                {
                    "p_document_id": document_id,
                    "include_embeddings": include_embeddings,
                },
            ).execute()

            return response.data or []
        except Exception as e:
            logger.error(f"Failed to get document chunks: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get chunks: {str(e)}")

    async def get_document_by_id(
        self,
        document_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch a single document by its document_id.

        Args:
            document_id: The document ID

        Returns:
            Document data or None if not found
        """
        try:
            response = (
                self.client.table("legal_documents")
                .select(
                    "document_id, document_type, title, date_issued, publication_date, "
                    "ingestion_date, last_updated, issuing_body, language, document_number, "
                    "country, full_text, summary, keywords, metadata, x, y, thesis, "
                    "processing_status, source_url, parties, outcome, raw_content, "
                    "presiding_judge, judges, legal_bases, court_name, department_name, "
                    "extracted_legal_bases, references, embedding, summary_embedding"
                )
                .eq("document_id", document_id)
                .limit(1)
                .execute()
            )

            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Failed to fetch document {document_id}: {e}")
            return None

    async def get_documents_by_ids(
        self,
        document_ids: List[str],
    ) -> List[Dict[str, Any]]:
        """
        Fetch multiple documents by their document_ids.

        Args:
            document_ids: List of document IDs

        Returns:
            List of document data
        """
        if not document_ids:
            return []

        try:
            response = (
                self.client.table("legal_documents")
                .select(
                    "document_id, document_type, title, date_issued, publication_date, "
                    "ingestion_date, last_updated, issuing_body, language, document_number, "
                    "country, full_text, summary, keywords, metadata, x, y, thesis, "
                    "processing_status, source_url, parties, outcome, raw_content, "
                    "presiding_judge, judges, legal_bases, court_name, department_name, "
                    "extracted_legal_bases, references"
                )
                .in_("document_id", document_ids)
                .execute()
            )

            return response.data or []
        except Exception as e:
            logger.error(f"Failed to fetch documents: {e}")
            return []

    async def get_embedding_stats(self) -> Dict[str, Any]:
        """
        Get statistics about embedding coverage.

        Returns:
            Dictionary with embedding statistics
        """
        try:
            response = self.client.rpc("get_embedding_stats").execute()
            return response.data[0] if response.data else {}
        except Exception as e:
            logger.error(f"Failed to get embedding stats: {e}")
            return {}

    async def full_text_search(
        self,
        query: str,
        document_type: Optional[str] = None,
        language: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Full-text search without vector similarity (fallback when no embeddings).

        Args:
            query: Search query text
            document_type: Filter by document type
            language: Filter by language
            limit: Maximum results
            offset: Pagination offset

        Returns:
            List of matching documents
        """
        try:
            # Build query with FTS
            query_builder = (
                self.client.table("legal_documents")
                .select(
                    "supabase_document_id, document_id, title, document_type, court_name, date_issued, language, summary"
                )
                .text_search("full_text", query, config="simple")
            )

            if document_type:
                query_builder = query_builder.eq("document_type", document_type)
            if language:
                query_builder = query_builder.eq("language", language)

            response = query_builder.range(offset, offset + limit - 1).execute()

            return response.data or []
        except Exception as e:
            logger.error(f"Full-text search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


_collections_db: Optional[CollectionsDB] = None
_supabase_db: Optional[SupabaseDB] = None
_publications_db: Optional[PublicationsDB] = None
_vector_db: Optional[SupabaseVectorDB] = None


def get_collections_db() -> CollectionsDB:
    global _collections_db
    if _collections_db is None:
        try:
            _collections_db = CollectionsDB()
        except ValueError as e:
            logger.error(f"Collections database not configured: {e}")
            raise HTTPException(status_code=500, detail=f"Database configuration error: {str(e)}")
    return _collections_db


def get_supabase_db() -> SupabaseDB:
    global _supabase_db
    if _supabase_db is None:
        try:
            _supabase_db = SupabaseDB()
        except ValueError as e:
            logger.warning(f"Supabase database not configured: {e}")
            raise HTTPException(
                status_code=500,
            )
    return _supabase_db


def reset_collections_db():
    global _collections_db
    if _collections_db is not None:
        # Properly close the client connection
        try:
            if hasattr(_collections_db.client, "close"):
                _collections_db.client.close()
        except Exception as e:
            logger.warning(f"Error closing Supabase client: {e}")
    _collections_db = None


def reset_supabase_db():
    global _supabase_db
    _supabase_db = None


def get_publications_db() -> PublicationsDB:
    global _publications_db
    if _publications_db is None:
        try:
            _publications_db = PublicationsDB()
        except ValueError as e:
            logger.error(f"Publications database not configured: {e}")
            raise HTTPException(status_code=500, detail=f"Database configuration error: {str(e)}")
    return _publications_db


def reset_publications_db():
    global _publications_db
    if _publications_db is not None:
        try:
            if hasattr(_publications_db.client, "close"):
                _publications_db.client.close()
        except Exception as e:
            logger.warning(f"Error closing Publications Supabase client: {e}")
    _publications_db = None


def get_vector_db() -> SupabaseVectorDB:
    """Get the shared SupabaseVectorDB instance for vector search operations."""
    global _vector_db
    if _vector_db is None:
        try:
            _vector_db = SupabaseVectorDB()
        except ValueError as e:
            logger.error(f"Vector database not configured: {e}")
            raise HTTPException(status_code=500, detail=f"Vector database configuration error: {str(e)}")
    return _vector_db


def reset_vector_db():
    """Reset the vector database singleton."""
    global _vector_db
    if _vector_db is not None:
        try:
            if hasattr(_vector_db.client, "close"):
                _vector_db.client.close()
        except Exception as e:
            logger.warning(f"Error closing Vector Supabase client: {e}")
    _vector_db = None
