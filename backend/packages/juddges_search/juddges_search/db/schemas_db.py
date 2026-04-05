"""Database operations for extraction schema management."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from loguru import logger
from supabase import PostgrestAPIError, StorageException

from ._base import SupabaseClientMixin

# ---------------------------------------------------------------------------
# Column projection constants
# ---------------------------------------------------------------------------
_EXTRACTION_SCHEMA_COLS = (
    "id, name, description, type, category, text, dates, user_id, status, is_verified, created_at, updated_at"
)


class SupabaseDB(SupabaseClientMixin):
    """Database operations for schema management."""

    def __init__(self):
        # SupabaseDB predates ClientOptions usage — preserve original plain client init
        # by using a longer timeout that matches the original create_client defaults.
        self._init_client("SupabaseDB")

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
        except (PostgrestAPIError, StorageException) as e:
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
        except (PostgrestAPIError, StorageException) as e:
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
        except (PostgrestAPIError, StorageException) as e:
            self._handle_error("get_schemas", e)
            return []  # Unreachable

    async def get_schema_by_name(self, schema_name: str) -> Optional[Dict[str, Any]]:
        """Retrieves a specific schema by its name."""
        try:
            response = (
                self.client.table("extraction_schemas")
                .select(_EXTRACTION_SCHEMA_COLS)
                .eq("name", schema_name)
                .limit(1)
                .execute()
            )

            return response.data[0] if response.data else None
        except (PostgrestAPIError, StorageException) as e:
            self._handle_error("get_schema_by_name", e)


# ---------------------------------------------------------------------------
# Singleton management
# ---------------------------------------------------------------------------
_supabase_db: Optional[SupabaseDB] = None


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


def reset_supabase_db():
    global _supabase_db
    _supabase_db = None


__all__ = [
    "SupabaseDB",
    "get_supabase_db",
    "reset_supabase_db",
]
