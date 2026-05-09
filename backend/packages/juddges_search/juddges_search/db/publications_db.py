"""Database operations for publications management."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from loguru import logger
from supabase import PostgrestAPIError, StorageException

from ._base import SupabaseClientMixin


class PublicationsDB(SupabaseClientMixin):
    """Database operations for publications management."""

    def __init__(self):
        self._init_client("PublicationsDB")

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
        except (PostgrestAPIError, StorageException) as e:
            logger.exception(f"Error getting publications: {e}")
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
        except (PostgrestAPIError, StorageException) as e:
            logger.exception(f"Error getting publication: {e}")
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
        except (PostgrestAPIError, StorageException) as e:
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
        except (PostgrestAPIError, StorageException) as e:
            self._handle_error("update_publication", e)
            return {}

    async def delete_publication(self, publication_id: str) -> bool:
        """Delete a publication and all its links."""
        try:
            # Junction tables will cascade delete due to ON DELETE CASCADE
            response = self.client.table("publications").delete().eq("id", publication_id).execute()
            return bool(response.data)
        except (PostgrestAPIError, StorageException) as e:
            logger.exception(f"Error deleting publication: {e}")
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
        except (PostgrestAPIError, StorageException) as e:
            error_msg = str(e).lower()
            if "duplicate" in error_msg or "already exists" in error_msg:
                return True
            logger.exception(f"Error linking schema: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to link schema: {str(e)}")

    async def remove_schema_link(self, publication_id: str, schema_id: str) -> bool:
        """Remove a schema link from a publication."""
        try:
            self.client.table("publication_schemas").delete().eq("publication_id", publication_id).eq(
                "schema_id", schema_id
            ).execute()
            logger.info(f"Removed schema {schema_id} from publication {publication_id}")
            return True
        except (PostgrestAPIError, StorageException) as e:
            logger.exception(f"Error removing schema link: {e}")
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
        except (PostgrestAPIError, StorageException) as e:
            error_msg = str(e).lower()
            if "duplicate" in error_msg or "already exists" in error_msg:
                return True
            logger.exception(f"Error linking collection: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to link collection: {str(e)}")

    async def remove_collection_link(self, publication_id: str, collection_id: str) -> bool:
        """Remove a collection link from a publication."""
        try:
            self.client.table("publication_collections").delete().eq("publication_id", publication_id).eq(
                "collection_id", collection_id
            ).execute()
            logger.info(f"Removed collection {collection_id} from publication {publication_id}")
            return True
        except (PostgrestAPIError, StorageException) as e:
            logger.exception(f"Error removing collection link: {e}")
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
        except (PostgrestAPIError, StorageException) as e:
            logger.exception(f"Error getting publication schemas: {e}")
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
        except (PostgrestAPIError, StorageException) as e:
            logger.exception(f"Error getting publication collections: {e}")
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
        except (PostgrestAPIError, StorageException) as e:
            error_msg = str(e).lower()
            if "duplicate" in error_msg or "already exists" in error_msg:
                return True
            logger.exception(f"Error linking extraction job: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to link extraction job: {str(e)}")

    async def remove_extraction_job_link(self, publication_id: str, job_id: str) -> bool:
        """Remove an extraction job link from a publication."""
        try:
            self.client.table("publication_extraction_jobs").delete().eq("publication_id", publication_id).eq(
                "job_id", job_id
            ).execute()
            logger.info(f"Removed extraction job {job_id} from publication {publication_id}")
            return True
        except (PostgrestAPIError, StorageException) as e:
            logger.exception(f"Error removing extraction job link: {e}")
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
        except (PostgrestAPIError, StorageException) as e:
            logger.exception(f"Error getting publication extraction jobs: {e}")
            return []


# ---------------------------------------------------------------------------
# Singleton management
# ---------------------------------------------------------------------------
_publications_db: Optional[PublicationsDB] = None


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
        except (PostgrestAPIError, StorageException) as e:
            logger.warning(f"Error closing Publications Supabase client: {e}")
    _publications_db = None


__all__ = [
    "PublicationsDB",
    "get_publications_db",
    "reset_publications_db",
]
