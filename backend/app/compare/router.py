"""HTTP surface of the PL/UK comparison: `/compare/facets` (export, pairs later).

Order of checks in `_run_compare`, and why:

1. `supabase_client` configured, else 503 `DATABASE_UNAVAILABLE`.
2. Requested `fields` resolved against the base comparable registry
   (`select_base_fields`; the service re-checks and raises
   `FieldNotComparableError`) -- both are `ValueError`s and become 400
   `UNKNOWN_FIELD` naming the offending fields. No I/O happens before this.
3. **Ownership of `filters.collection_ids`** via
   `check_collection_ids_ownership` (shared with `/collections/from-filter`).
   The service runs with the service-role client, which bypasses the RPC's
   RLS, so a foreign id would otherwise leak another user's collection
   distribution. 400 `INVALID_COLLECTION_ID` / 404 `COLLECTION_NOT_FOUND`,
   never saying which id.
4. `CompareService.compare` -- one facet RPC per field; any other failure is
   500 `COMPARE_FAILED`.

Every endpoint requires a Bearer user (`get_current_user`) on top of the
router-level API key: they read collection membership, so there is no
anonymous mode.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from juddges_search.db.supabase_db import get_collections_db
from loguru import logger
from pydantic import BaseModel, Field

from app.collections_from_filter import check_collection_ids_ownership
from app.compare.fields import FieldSpec, base_compare_fields, select_base_fields
from app.compare.models import CompareResponse
from app.compare.service import CompareService, FieldNotComparableError
from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.core.supabase import supabase_client

router = APIRouter(prefix="/compare", tags=["compare"])


class CompareRequest(BaseModel):
    """Same `filters`/`text_query` shape as POST /extractions/base-schema/filter."""

    filters: dict[str, Any] = Field(default_factory=dict)
    text_query: str | None = Field(default=None, max_length=1000)
    fields: list[str] | None = Field(
        default=None,
        description=(
            "Base-schema field names to compare, in this order; "
            "defaults to every comparable field in registry order"
        ),
    )


def _require_db() -> Any:
    if not supabase_client:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Database Unavailable",
                "message": "Database connection not available.",
                "code": "DATABASE_UNAVAILABLE",
            },
        )
    return supabase_client


def _unknown_field(message: str, fields: list[str]) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={
            "error": "Unknown Field",
            "message": message,
            "code": "UNKNOWN_FIELD",
            "fields": fields,
        },
    )


def _resolve_fields(requested: list[str] | None) -> list[FieldSpec]:
    """Registry lookup; a 400 names every requested field that is not comparable."""
    try:
        return select_base_fields(requested)
    except ValueError as exc:
        known = {s.field for s in base_compare_fields()}
        bad = [f for f in requested or [] if f not in known]
        raise _unknown_field(str(exc), bad) from exc


async def _run_compare(
    request: CompareRequest, *, db: Any, user_id: str
) -> CompareResponse:
    client = _require_db()
    specs = _resolve_fields(request.fields)
    await check_collection_ids_ownership(db, request.filters, user_id=user_id)
    try:
        return CompareService(client).compare(
            request.filters, request.text_query, specs
        )
    except FieldNotComparableError as exc:
        # Registry and service disagree on a field: still the caller's 400.
        raise _unknown_field(str(exc), exc.fields) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("compare failed: {}", exc)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Compare Failed",
                "message": f"Failed to compute the comparison: {exc!s}",
                "code": "COMPARE_FAILED",
            },
        ) from exc


@router.post(
    "/facets",
    response_model=CompareResponse,
    summary="Side-by-side PL/UK value distributions for base-schema fields",
)
async def compare_facets(
    request: CompareRequest,
    db=Depends(get_collections_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> CompareResponse:
    return await _run_compare(request, db=db, user_id=user.id)
