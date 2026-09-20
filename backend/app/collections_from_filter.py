"""Create collections from a base-schema filter, server-side (Foundation for B and C).

One endpoint, list-shaped response: a single collection today (Spec B), and
Spec C extends the same request with `split_by_jurisdiction` to create a PL/UK
pair and fill `pair_id` — no second creation path. The 100-id cap on
POST /collections/{id}/documents/batch protects a browser-driven loop; here the
server owns the loop, so it bulk-inserts in chunks of 1 000 up to the
SAVE_FROM_FILTER_MAX_DOCUMENTS cap (5 000 per collection).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from juddges_search.db.supabase_db import get_collections_db
from loguru import logger
from pydantic import BaseModel, Field

from app.collections import Collection
from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.core.supabase import supabase_client
from app.extraction_domain.filter_ids import (
    SAVE_FROM_FILTER_MAX_DOCUMENTS,
    FilterTooLargeError,
    check_cap,
    resolve_filter_ids,
)
from app.models import Jurisdiction  # noqa: TC001 - pydantic field, needed at runtime
from app.services.audit_service import log_audit_background

# Registered BEFORE collections_router in server.py: /collections/{collection_id}
# would otherwise capture literal segments such as "from-filter" (and Spec C's "pairs").
router = APIRouter(prefix="/collections", tags=["collections"])

BULK_ADD_CHUNK = 1000


class CreateCollectionFromFilterRequest(BaseModel):
    """Same `filters`/`text_query` shape as POST /extractions/base-schema/filter."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    filters: dict[str, Any] = Field(default_factory=dict)
    text_query: str | None = Field(default=None, max_length=1000)


class CreatedCollection(BaseModel):
    jurisdiction: Jurisdiction | None = None
    collection: Collection
    added_count: int


class CollectionFromFilterResponse(BaseModel):
    collections: list[CreatedCollection]
    total_matched: int
    pair_id: str | None = None


def _db_unavailable() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={
            "error": "Database Unavailable",
            "message": "Database connection not available.",
            "code": "DATABASE_UNAVAILABLE",
        },
    )


async def create_collection_from_ids(
    db: Any, *, user_id: str, name: str, description: str | None, ids: list[str]
) -> tuple[dict[str, Any], int]:
    """Create one collection and bulk-add `ids` in chunks. Returns (collection row, added count).

    No partial collection survives a failed bulk add: if any chunk raises, the
    collection just created is deleted (best-effort) before the original
    exception propagates, so a bulk-add failure never leaves the user with a
    collection that silently holds only some of `ids`.
    """
    collection = await db.create_collection(user_id, name, description)
    added = 0
    try:
        for start in range(0, len(ids), BULK_ADD_CHUNK):
            result = await db.bulk_add_documents(
                collection["id"], ids[start : start + BULK_ADD_CHUNK], user_id
            )
            added += len(result["added"])
    except Exception:
        logger.warning(
            "bulk add failed for collection {} ({} of {} judgments added); deleting it",
            collection["id"],
            added,
            len(ids),
        )
        try:
            await db.delete_collection(collection["id"], user_id)
        except Exception:
            logger.exception(
                "compensating delete failed for collection {}; a partial collection may remain",
                collection["id"],
            )
        raise
    logger.info(
        "collection {} created with {} of {} judgments",
        collection["id"],
        added,
        len(ids),
    )
    return collection, added


@router.post(
    "/from-filter",
    response_model=CollectionFromFilterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a collection from a base-schema filter result",
)
async def create_collection_from_filter(
    request: CreateCollectionFromFilterRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_collections_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> CollectionFromFilterResponse:
    if not supabase_client:
        raise _db_unavailable()
    resolved = resolve_filter_ids(supabase_client, request.filters, request.text_query)
    if resolved.total == 0:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Empty Result",
                "message": "The filter matches no judgments.",
                "code": "FILTER_EMPTY",
            },
        )
    try:
        check_cap(resolved, SAVE_FROM_FILTER_MAX_DOCUMENTS)
    except FilterTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={
                "error": "Too Many Documents",
                "message": (
                    f"The filter matches {exc.total} judgments; a collection may hold "
                    f"at most {exc.cap}. Narrow the filter."
                ),
                "code": "FILTER_TOO_LARGE",
                "total": exc.total,
                "cap": exc.cap,
                "jurisdiction": exc.jurisdiction,
            },
        ) from exc

    collection, added = await create_collection_from_ids(
        db,
        user_id=user.id,
        name=request.name,
        description=request.description,
        ids=resolved.ids,
    )
    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="collection_created",
        resource_type="collection",
        resource_id=collection["id"],
    )
    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="collection_document_added",
        input_data={
            "source": "base_schema_filter",
            "count": added,
            "filters": request.filters,
        },
        resource_type="collection",
        resource_id=collection["id"],
    )
    return CollectionFromFilterResponse(
        collections=[
            CreatedCollection(collection=Collection(**collection), added_count=added)
        ],
        total_matched=resolved.total,
    )
