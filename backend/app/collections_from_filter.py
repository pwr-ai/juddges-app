"""Create collections from a base-schema filter, server-side (Specs B and C).

One endpoint, list-shaped response: a single collection by default (Spec B);
with `split_by_jurisdiction: true` (Spec C) the same request creates one PL and
one UK collection, links them in `collection_pairs` and fills `pair_id` — there
is no second creation path. The 100-id cap on
POST /collections/{id}/documents/batch protects a browser-driven loop; here the
server owns the loop, so it bulk-inserts in chunks of 1 000 up to the
SAVE_FROM_FILTER_MAX_DOCUMENTS cap (5 000 per collection, i.e. per side).
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from juddges_search.db.supabase_db import get_collections_db
from loguru import logger
from pydantic import BaseModel, Field, model_validator

from app.collection_pairs import get_collection_pairs_db
from app.collections import Collection
from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.core.supabase import supabase_client
from app.extraction_domain.filter_ids import (
    SAVE_FROM_FILTER_MAX_DOCUMENTS,
    FilterIdsResult,
    FilterTooLargeError,
    check_cap,
    resolve_filter_ids,
    strip_ignored,
)
from app.models import (
    JURISDICTIONS,
    Jurisdiction,
)
from app.services.audit_service import log_audit_background

# Registered BEFORE collections_router in server.py: /collections/{collection_id}
# would otherwise capture literal segments such as "from-filter" (and Spec C's "pairs").
router = APIRouter(prefix="/collections", tags=["collections"])

BULK_ADD_CHUNK = 1000
# collection_pairs.name is CHECKed at 1..200 chars (migration 20260921000002) and
# each side's collection name adds " — PL"/" — UK" under collections' 255 bound.
PAIR_NAME_MAX_LENGTH = 200


class CreateCollectionFromFilterRequest(BaseModel):
    """Same `filters`/`text_query` shape as POST /extractions/base-schema/filter."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    filters: dict[str, Any] = Field(default_factory=dict)
    text_query: str | None = Field(default=None, max_length=1000)
    split_by_jurisdiction: bool = Field(
        default=False,
        description=(
            'Create one collection per jurisdiction ("<name> — PL", '
            '"<name> — UK") linked as a pair. `filters.jurisdiction` is ignored '
            "(echoed in `ignored_filter_keys`); the size cap applies per side; "
            f"`name` is limited to {PAIR_NAME_MAX_LENGTH} characters."
        ),
    )

    @model_validator(mode="after")
    def _normalise_name(self) -> CreateCollectionFromFilterRequest:
        """Strip `name` once so validation and persistence see the same value,
        and reject a too-long pair name at the door, not after both sides are filled.

        The stripped value is what `create_collection_from_ids` (side names) and
        `create_pair` receive; checking `len(name.strip())` while persisting the
        raw name would let a whitespace-padded 201-255-char name create and
        bulk-fill both collections and only then fail the CHECK on
        collection_pairs.name (500 + rollback).
        """
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("name must not be blank")
        if self.split_by_jurisdiction and len(self.name) > PAIR_NAME_MAX_LENGTH:
            raise ValueError(
                f"name must be at most {PAIR_NAME_MAX_LENGTH} characters when "
                "split_by_jurisdiction is true (the pair name is stored as-is and "
                "each side is suffixed with ' — PL' / ' — UK')"
            )
        return self


class CreatedCollection(BaseModel):
    jurisdiction: Jurisdiction | None = None
    collection: Collection
    added_count: int


class CollectionFromFilterResponse(BaseModel):
    collections: list[CreatedCollection]
    total_matched: int
    pair_id: str | None = None
    ignored_filter_keys: list[str] = Field(default_factory=list)


def _db_unavailable() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={
            "error": "Database Unavailable",
            "message": "Database connection not available.",
            "code": "DATABASE_UNAVAILABLE",
        },
    )


def _invalid_collection_id() -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={
            "error": "Invalid Collection ID",
            "message": "filters.collection_ids must be a list of UUID strings.",
            "code": "INVALID_COLLECTION_ID",
        },
    )


def _collection_not_found() -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={
            "error": "Collection Not Found",
            "message": "One or more collections in filters.collection_ids were not found.",
            "code": "COLLECTION_NOT_FOUND",
        },
    )


async def check_collection_ids_ownership(
    db: Any, filters: dict[str, Any], *, user_id: str
) -> None:
    """Reject `filters.collection_ids` entries that are malformed or not owned by `user_id`.

    `resolve_filter_ids` calls `list_extracted_filter_matches` with the
    service-role client, which bypasses the RPC's own RLS (it is
    `SECURITY INVOKER`, scoped to `auth.uid()` over PostgREST) -- so every
    endpoint that forwards a user-supplied filter to that RPC (this one, and
    `/compare/*` in `app.compare.router`) must enforce ownership itself before
    the filter ever reaches it. An empty list mirrors the RPC's own "no
    filter" semantics and skips the check entirely (see
    docs/reference/base-schema-filter-api.md). Which id(s) are missing is
    never revealed -- foreign and malformed ids alike collapse into one
    404/400 message.
    """
    raw = filters.get("collection_ids")
    if not raw:
        return
    collection_ids = raw if isinstance(raw, list) else [raw]

    for collection_id in collection_ids:
        if not isinstance(collection_id, str):
            raise _invalid_collection_id()
        try:
            uuid.UUID(collection_id)
        except ValueError:
            raise _invalid_collection_id() from None

    owned = await db.get_user_collections(user_id)
    owned_ids = {row["id"] for row in owned}
    if any(cid not in owned_ids for cid in collection_ids):
        raise _collection_not_found()


def _filter_empty(jurisdiction: str | None = None) -> HTTPException:
    side = f" for {jurisdiction}" if jurisdiction else ""
    return HTTPException(
        status_code=400,
        detail={
            "error": "Empty Result",
            "message": f"The filter matches no judgments{side}.",
            "code": "FILTER_EMPTY",
            "jurisdiction": jurisdiction,
        },
    )


def _filter_too_large(exc: FilterTooLargeError) -> HTTPException:
    side = f" ({exc.jurisdiction})" if exc.jurisdiction else ""
    return HTTPException(
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        detail={
            "error": "Too Many Documents",
            "message": (
                f"The filter matches {exc.total} judgments{side}; a collection may "
                f"hold at most {exc.cap}. Narrow the filter."
            ),
            "code": "FILTER_TOO_LARGE",
            "total": exc.total,
            "cap": exc.cap,
            "jurisdiction": exc.jurisdiction,
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


async def _rollback_collections(
    db: Any, *, user_id: str, collection_ids: list[str]
) -> None:
    """Best-effort delete of every collection created so far; never raises."""
    for collection_id in collection_ids:
        try:
            await db.delete_collection(collection_id, user_id)
        except Exception:
            logger.exception(
                "rollback delete failed for collection {}; it may remain orphaned",
                collection_id,
            )


async def create_pair_from_ids(
    db: Any,
    pairs_db: Any,
    *,
    user_id: str,
    name: str,
    description: str | None,
    filters: dict[str, Any],
    text_query: str | None,
    resolved: FilterIdsResult,
) -> tuple[dict[str, Any], list[CreatedCollection]]:
    """Create "<name> — PL" and "<name> — UK" and link them in collection_pairs.

    All-or-nothing: if either side or the pair insert fails, every collection
    created so far is deleted (best-effort, logged) and the original error
    propagates, so the user never sees one orphaned half of a pair.
    """
    created: list[CreatedCollection] = []
    try:
        for jurisdiction in JURISDICTIONS:
            collection, added = await create_collection_from_ids(
                db,
                user_id=user_id,
                name=f"{name} — {jurisdiction}",
                description=description,
                ids=resolved.by_jurisdiction[jurisdiction],
            )
            created.append(
                CreatedCollection(
                    jurisdiction=jurisdiction,
                    collection=Collection(**collection),
                    added_count=added,
                )
            )
        by_side = {c.jurisdiction: c.collection.id for c in created}
        pair = await pairs_db.create_pair(
            user_id, name, filters, text_query, by_side["PL"], by_side["UK"]
        )
    except Exception:
        logger.warning(
            "pair creation failed after {} of {} collections; rolling back",
            len(created),
            len(JURISDICTIONS),
        )
        await _rollback_collections(
            db, user_id=user_id, collection_ids=[c.collection.id for c in created]
        )
        raise
    return pair, created


@router.post(
    "/from-filter",
    response_model=CollectionFromFilterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a collection (or a PL/UK pair) from a base-schema filter result",
)
async def create_collection_from_filter(
    request: CreateCollectionFromFilterRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_collections_db),
    pairs_db=Depends(get_collection_pairs_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> CollectionFromFilterResponse:
    if not supabase_client:
        raise _db_unavailable()
    await check_collection_ids_ownership(db, request.filters, user_id=user.id)

    if request.split_by_jurisdiction:
        return await _create_pair(request, background_tasks, db, pairs_db, user)

    resolved = resolve_filter_ids(supabase_client, request.filters, request.text_query)
    if resolved.total == 0:
        raise _filter_empty()
    try:
        check_cap(resolved, SAVE_FROM_FILTER_MAX_DOCUMENTS)
    except FilterTooLargeError as exc:
        raise _filter_too_large(exc) from exc

    collection, added = await create_collection_from_ids(
        db,
        user_id=user.id,
        name=request.name,
        description=request.description,
        ids=resolved.ids,
    )
    _audit_created(
        background_tasks,
        user_id=user.id,
        collection_id=collection["id"],
        added=added,
        filters=request.filters,
    )
    return CollectionFromFilterResponse(
        collections=[
            CreatedCollection(collection=Collection(**collection), added_count=added)
        ],
        total_matched=resolved.total,
    )


async def _create_pair(
    request: CreateCollectionFromFilterRequest,
    background_tasks: BackgroundTasks,
    db: Any,
    pairs_db: Any,
    user: AuthenticatedUser,
) -> CollectionFromFilterResponse:
    """split_by_jurisdiction=true: PL + UK collections and a collection_pairs row."""
    filters, ignored = strip_ignored(request.filters)
    resolved = resolve_filter_ids(supabase_client, filters, request.text_query)
    try:
        check_cap(resolved, SAVE_FROM_FILTER_MAX_DOCUMENTS, per_jurisdiction=True)
    except FilterTooLargeError as exc:
        raise _filter_too_large(exc) from exc
    empty_sides = [j for j in JURISDICTIONS if not resolved.by_jurisdiction.get(j)]
    if len(empty_sides) == len(JURISDICTIONS):
        raise _filter_empty()
    if empty_sides:
        raise _filter_empty(empty_sides[0])

    pair, created = await create_pair_from_ids(
        db,
        pairs_db,
        user_id=user.id,
        name=request.name,
        description=request.description,
        filters=filters,
        text_query=request.text_query,
        resolved=resolved,
    )
    for entry in created:
        _audit_created(
            background_tasks,
            user_id=user.id,
            collection_id=entry.collection.id,
            added=entry.added_count,
            filters=filters,
        )
    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="collection_pair_created",
        resource_type="collection_pair",
        resource_id=pair["id"],
        input_data={
            "filters": filters,
            "text_query": request.text_query,
            "collections": {c.jurisdiction: c.collection.id for c in created},
        },
    )
    return CollectionFromFilterResponse(
        collections=created,
        total_matched=resolved.total,
        pair_id=pair["id"],
        ignored_filter_keys=ignored,
    )


def _audit_created(
    background_tasks: BackgroundTasks,
    *,
    user_id: str,
    collection_id: str,
    added: int,
    filters: dict[str, Any],
) -> None:
    log_audit_background(
        background_tasks,
        user_id=user_id,
        action_type="collection_created",
        resource_type="collection",
        resource_id=collection_id,
    )
    log_audit_background(
        background_tasks,
        user_id=user_id,
        action_type="collection_document_added",
        input_data={"source": "base_schema_filter", "count": added, "filters": filters},
        resource_type="collection",
        resource_id=collection_id,
    )
