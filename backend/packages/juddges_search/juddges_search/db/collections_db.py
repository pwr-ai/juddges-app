"""Database operations for collections management."""

from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from loguru import logger
from supabase import PostgrestAPIError, StorageException

from ._base import SupabaseClientMixin

# ---------------------------------------------------------------------------
# Column projection constants
# ---------------------------------------------------------------------------
_COLLECTIONS_COLS = "id, user_id, name, description, created_at, updated_at"
_COLLECTION_DOC_EXISTS_COLS = "collection_id, document_id"


class CollectionsDB(SupabaseClientMixin):
    """Database operations for collections management."""

    def __init__(self):
        self._init_client("CollectionsDB")

    async def get_user_collections(self, user_id: str) -> List[Dict[str, Any]]:
        try:
            # First get all collections for the user
            response = (
                self.client.table("collections")
                .select(_COLLECTIONS_COLS)
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
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Error getting user collections: {e}", exc_info=True)
            return []

    async def find_collection(
        self, collection_id: str, user_id: str, limit: Optional[int] = None, offset: int = 0
    ) -> Optional[Dict[str, Any]]:
        try:
            # First get the collection
            response = (
                self.client.table("collections")
                .select(_COLLECTIONS_COLS)
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
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Error finding collection: {e}", exc_info=True)
            return None

    async def create_collection(self, user_id: str, name: str, description: Optional[str] = None) -> Dict[str, Any]:
        try:
            data = {"user_id": user_id, "name": name}
            if description:
                data["description"] = description

            response = self.client.table("collections").insert(data).execute()

            return response.data[0] if response.data else {}
        except (PostgrestAPIError, StorageException) as e:
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
        except (PostgrestAPIError, StorageException) as e:
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
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Error deleting collection: {e}", exc_info=True)
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
                .select(_COLLECTION_DOC_EXISTS_COLS)
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

        except (PostgrestAPIError, StorageException) as e:
            error_msg = str(e).lower()
            if "duplicate" in error_msg or "already exists" in error_msg:
                return True

            logger.error(f"Error adding document to collection: {e}", exc_info=True)
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

        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Error removing document from collection: {e}", exc_info=True)
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
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Error checking collection existence: {e}", exc_info=True)
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

        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Error getting collection documents: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to get documents: {str(e)}")


# ---------------------------------------------------------------------------
# Singleton management
# ---------------------------------------------------------------------------
_collections_db: Optional[CollectionsDB] = None


def get_collections_db() -> CollectionsDB:
    global _collections_db
    if _collections_db is None:
        try:
            _collections_db = CollectionsDB()
        except ValueError as e:
            logger.error(f"Collections database not configured: {e}")
            raise HTTPException(status_code=500, detail=f"Database configuration error: {str(e)}")
    return _collections_db


def reset_collections_db():
    global _collections_db
    if _collections_db is not None:
        # Properly close the client connection
        try:
            if hasattr(_collections_db.client, "close"):
                _collections_db.client.close()
        except (PostgrestAPIError, StorageException) as e:
            logger.warning(f"Error closing Supabase client: {e}")
    _collections_db = None


__all__ = [
    "CollectionsDB",
    "get_collections_db",
    "reset_collections_db",
]
