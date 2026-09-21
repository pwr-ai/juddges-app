"""Read and unlink PL/UK collection pairs (Spec C).

A pair is created by ``POST /collections/from-filter`` with
``split_by_jurisdiction: true`` (``app.collections_from_filter``) — there is no
second creation path. This router only reads pairs back and unlinks them.

``DELETE /collections/pairs/{pair_id}`` removes the pair row and nothing else:
both collections survive as ordinary collections. Deleting either collection
through ``DELETE /collections/{id}`` cascades the pair row instead
(``ON DELETE CASCADE`` in migration 20260921000002).
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from juddges_search.db.collection_pairs_db import CollectionPairsDB
from loguru import logger
from pydantic import BaseModel

from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.models import JURISDICTIONS, Jurisdiction

# Registered BEFORE collections_router in server.py: /collections/{collection_id}
# would otherwise capture the literal "pairs" segment and answer 404.
router = APIRouter(prefix="/collections/pairs", tags=["collections"])


class PairSide(BaseModel):
    """One side of a pair. No document_count: the read path cannot compute it
    cheaply -- ``GET /collections`` already carries per-collection counts."""

    jurisdiction: Jurisdiction
    collection_id: str


class CollectionPair(BaseModel):
    id: str
    user_id: str
    name: str
    filters: dict[str, Any]
    text_query: str | None = None
    created_at: str
    updated_at: str
    sides: list[PairSide]


def pair_to_model(row: dict[str, Any]) -> CollectionPair:
    """``collection_pairs`` row -> API model; ``sides`` always in JURISDICTIONS order."""
    side_columns = {"PL": "pl_collection_id", "UK": "uk_collection_id"}
    return CollectionPair(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        filters=row.get("filters") or {},
        text_query=row.get("text_query"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        sides=[
            PairSide(jurisdiction=j, collection_id=row[side_columns[j]])
            for j in JURISDICTIONS
        ],
    )


# ---------------------------------------------------------------------------
# Singleton management (mirrors get_collections_db)
# ---------------------------------------------------------------------------
_pairs_db: CollectionPairsDB | None = None


def get_collection_pairs_db() -> CollectionPairsDB:
    global _pairs_db
    if _pairs_db is None:
        try:
            _pairs_db = CollectionPairsDB()
        except ValueError as e:
            logger.error(f"Collection pairs database not configured: {e}")
            raise HTTPException(
                status_code=500, detail=f"Database configuration error: {e!s}"
            ) from e
    return _pairs_db


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Collection pair not found")


def _require_uuid(pair_id: str) -> str:
    """A pair id is a UUID; anything else cannot exist, so it is a plain 404.

    Checked before the query so a malformed id never reaches PostgREST (which
    would answer ``22P02 invalid input syntax for type uuid`` as a 500).
    """
    try:
        uuid.UUID(pair_id)
    except ValueError:
        raise _not_found() from None
    return pair_id


@router.get(
    "",
    response_model=list[CollectionPair],
    summary="List the caller's PL/UK collection pairs (newest first)",
)
async def list_pairs(
    pairs_db=Depends(get_collection_pairs_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[CollectionPair]:
    return [pair_to_model(row) for row in await pairs_db.list_pairs(user.id)]


@router.get(
    "/{pair_id}",
    response_model=CollectionPair,
    summary="Get one PL/UK collection pair",
)
async def get_pair(
    pair_id: str = Path(...),
    pairs_db=Depends(get_collection_pairs_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> CollectionPair:
    row = await pairs_db.find_pair(_require_uuid(pair_id), user.id)
    if row is None:
        raise _not_found()
    return pair_to_model(row)


@router.delete(
    "/{pair_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlink a PL/UK pair (both collections are kept)",
)
async def delete_pair(
    pair_id: str = Path(...),
    pairs_db=Depends(get_collection_pairs_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> Response:
    if not await pairs_db.delete_pair(_require_uuid(pair_id), user.id):
        raise _not_found()
    logger.info("collection pair {} unlinked by user {}", pair_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
