"""Persistence for PL/UK collection pairs (table ``public.collection_pairs``).

A pair is one row pointing at two collections (``pl_collection_id``,
``uk_collection_id``) plus the filter that produced them. The client is
service-role and bypasses RLS, so every query here scopes by ``user_id``
itself; nothing in this module may run an unscoped read or write.
"""

from __future__ import annotations

from typing import Any

from loguru import logger
from supabase import PostgrestAPIError

from ._base import SupabaseClientMixin

_PAIR_COLS = "id, user_id, name, filters, text_query, pl_collection_id, uk_collection_id, created_at, updated_at"


class CollectionPairsDB(SupabaseClientMixin):
    """Database operations for ``collection_pairs``."""

    def __init__(self):
        self._init_client("CollectionPairsDB")

    async def create_pair(
        self,
        user_id: str,
        name: str,
        filters: dict[str, Any],
        text_query: str | None,
        pl_collection_id: str,
        uk_collection_id: str,
    ) -> dict[str, Any]:
        """Insert one pair row and return it (UNIQUE side violations surface as 409)."""
        try:
            response = (
                self.client.table("collection_pairs")
                .insert(
                    {
                        "user_id": user_id,
                        "name": name,
                        "filters": filters,
                        "text_query": text_query,
                        "pl_collection_id": pl_collection_id,
                        "uk_collection_id": uk_collection_id,
                    }
                )
                .execute()
            )
        except PostgrestAPIError as e:
            self._handle_error("create_pair", e)
        row = response.data[0]
        logger.info(
            "collection pair {} created for user {}: PL={} UK={}",
            row["id"],
            user_id,
            pl_collection_id,
            uk_collection_id,
        )
        return row

    async def list_pairs(self, user_id: str) -> list[dict[str, Any]]:
        """All pairs owned by ``user_id``, newest first."""
        try:
            response = (
                self.client.table("collection_pairs")
                .select(_PAIR_COLS)
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
        except PostgrestAPIError as e:
            self._handle_error("list_pairs", e)
        return list(response.data or [])

    async def find_pair(self, pair_id: str, user_id: str) -> dict[str, Any] | None:
        """The pair ``pair_id`` if ``user_id`` owns it, else ``None``."""
        try:
            response = (
                self.client.table("collection_pairs")
                .select(_PAIR_COLS)
                .eq("id", pair_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
        except PostgrestAPIError as e:
            self._handle_error("find_pair", e)
        return response.data[0] if response.data else None

    async def delete_pair(self, pair_id: str, user_id: str) -> bool:
        """Delete the pair row only; both collections survive. True when a row went."""
        try:
            response = self.client.table("collection_pairs").delete().eq("id", pair_id).eq("user_id", user_id).execute()
        except PostgrestAPIError as e:
            self._handle_error("delete_pair", e)
        return bool(response.data)

    async def pairs_by_collection(self, user_id: str) -> dict[str, dict[str, Any]]:
        """``collection_id -> {id, name, role, partner_collection_id}`` over the user's pairs.

        Lets ``GET /collections`` annotate each collection with its pair in one
        query instead of one lookup per row.
        """
        out: dict[str, dict[str, Any]] = {}
        for pair in await self.list_pairs(user_id):
            pl, uk = pair["pl_collection_id"], pair["uk_collection_id"]
            out[pl] = {
                "id": pair["id"],
                "name": pair["name"],
                "role": "PL",
                "partner_collection_id": uk,
            }
            out[uk] = {
                "id": pair["id"],
                "name": pair["name"],
                "role": "UK",
                "partner_collection_id": pl,
            }
        return out
