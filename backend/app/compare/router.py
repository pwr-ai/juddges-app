"""HTTP surface of the PL/UK comparison: `/compare/facets`, `/compare/export`,
`/compare/pairs/{pair_id}`.

The two POST endpoints take the same body (`CompareRequest`) and share
`_run_compare`; export only changes the serialisation. Order of checks, and why:

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
4. `CompareService.compare` -- one blocking facet RPC per field, run via
   `asyncio.to_thread` so the loop stays free (same as `services/search.py`);
   any other failure is 500 `COMPARE_FAILED`.

`fields` is bounded by the registry size (`MAX_FIELDS`) and deduplicated by
`select_base_fields`, so one request can never cost more RPC calls than there
are comparable fields.

`GET /compare/pairs/{pair_id}` takes **no filter input at all**. The pair row is
looked up with `find_pair(pair_id, user.id)` (404 otherwise, before any data
read) and the base fields are computed over `{"collection_ids": [pl, uk]}`
built server-side from that row -- the ownership check is the lookup itself.
The extension-schema tally (`app.compare.schema_tally`) is best-effort: if it
fails the base fields are still returned with `extension_reason =
"extension_failed"`.

Every endpoint requires a Bearer user (`get_current_user`) on top of the
router-level API key: they read collection membership, so there is no
anonymous mode.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from io import BytesIO
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from juddges_search.db.supabase_db import get_collections_db
from loguru import logger
from pydantic import BaseModel, Field

from app.collection_pairs import get_collection_pairs_db, require_pair_uuid
from app.collections_from_filter import check_collection_ids_ownership
from app.compare.csv_export import csv_bytes, to_csv_rows
from app.compare.fields import FieldSpec, base_compare_fields, select_base_fields
from app.compare.models import CompareResponse, PairCompareResponse, PairSummary
from app.compare.schema_tally import ExtensionOutcome, extension_for_pair
from app.compare.service import CompareService, FieldNotComparableError
from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.core.supabase import supabase_client

router = APIRouter(prefix="/compare", tags=["compare"])

# Upper bound on `fields`: after deduplication a request can name at most every
# comparable field once, so anything longer is malformed (422), not just wasteful.
MAX_FIELDS = len(base_compare_fields())


class CompareRequest(BaseModel):
    """Same `filters`/`text_query` shape as POST /extractions/base-schema/filter."""

    filters: dict[str, Any] = Field(default_factory=dict)
    text_query: str | None = Field(default=None, max_length=1000)
    fields: list[str] | None = Field(
        default=None,
        max_length=MAX_FIELDS,
        description=(
            "Base-schema field names to compare, in this order (duplicates "
            "collapse to the first occurrence); defaults to every comparable "
            "field in registry order"
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
    service = CompareService(client)
    try:
        return await asyncio.to_thread(
            service.compare, request.filters, request.text_query, specs
        )
    except FieldNotComparableError as exc:
        # Registry and service disagree on a field: still the caller's 400.
        raise _unknown_field(str(exc), exc.fields) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise _compare_failed(exc) from exc


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


@router.post("/export", summary="Long-format CSV of the comparison")
async def compare_export(
    request: CompareRequest,
    db=Depends(get_collections_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> StreamingResponse:
    """One row per (field, value, jurisdiction); UTF-8 with BOM for Excel.

    Built from the same `CompareResponse` as `/compare/facets`, so the file
    holds exactly the numbers shown on screen. Headers follow the results
    export: `Content-Disposition` attachment + `X-Rows-Count`.
    """
    response = await _run_compare(request, db=db, user_id=user.id)
    rows = to_csv_rows(response)
    filename = f"compare_{datetime.now(UTC).strftime('%Y-%m-%d')}.csv"
    logger.info("compare export: {} rows as {}", len(rows), filename)
    return StreamingResponse(
        BytesIO(csv_bytes(rows)),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Rows-Count": str(len(rows)),
        },
    )


def _compare_failed(exc: Exception) -> HTTPException:
    logger.exception("compare failed: {}", exc)
    return HTTPException(
        status_code=500,
        detail={
            "error": "Compare Failed",
            "message": f"Failed to compute the comparison: {exc!s}",
            "code": "COMPARE_FAILED",
        },
    )


def _pair_compare_blocking(
    client: Any, pl_id: str, uk_id: str, *, user_id: str
) -> tuple[CompareResponse, ExtensionOutcome]:
    """Runs in a worker thread: base facet RPCs, then the best-effort extension."""
    base = CompareService(client).compare_collections(
        pl_id, uk_id, base_compare_fields()
    )
    try:
        outcome = extension_for_pair(client, pl_id, uk_id, user_id=user_id)
    except Exception as exc:  # the base comparison is still worth returning
        logger.exception("pair extension tally failed: {}", exc)
        outcome = ExtensionOutcome(reason="extension_failed")
    return base, outcome


@router.get(
    "/pairs/{pair_id}",
    response_model=PairCompareResponse,
    summary="Comparison of a saved PL/UK collection pair (base + extension schema fields)",
)
async def compare_pair(
    pair_id: str,
    pairs_db=Depends(get_collection_pairs_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> PairCompareResponse:
    """Base fields over the pair's two collections, plus the extension tally.

    No request filters are accepted: the membership is the pair's own
    `pl_collection_id`/`uk_collection_id`, and the pair must belong to the
    caller (`find_pair` scopes by user; anything else is a 404). `filters` in
    the response is the server-built `{"collection_ids": [pl, uk]}`, which
    `POST /compare/export` accepts for the CSV of the same numbers.
    """
    client = _require_db()
    pair = await pairs_db.find_pair(require_pair_uuid(pair_id), user.id)
    if pair is None:
        raise HTTPException(status_code=404, detail="Collection pair not found")
    pl_id, uk_id = str(pair["pl_collection_id"]), str(pair["uk_collection_id"])
    try:
        base, outcome = await asyncio.to_thread(
            _pair_compare_blocking, client, pl_id, uk_id, user_id=user.id
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise _compare_failed(exc) from exc
    return PairCompareResponse(
        **base.model_dump(exclude={"pair"}),
        pair=PairSummary(
            id=str(pair["id"]),
            name=pair["name"],
            pl_collection_id=pl_id,
            uk_collection_id=uk_id,
        ),
        extension=outcome.extension,
        extension_reason=outcome.reason,
    )
