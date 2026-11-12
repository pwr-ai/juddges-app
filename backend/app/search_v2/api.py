"""``POST /search/v2`` — test search over the Weaviate v2 corpus.

Registered in ``API_KEY_PROTECTED_ROUTERS`` (``BACKEND_API_KEY``) and, unlike
the guest-reachable ``/api/search/documents``, it also requires a signed-in
Supabase user: it is a test engine, so it never spends guest allowance.
"""

from __future__ import annotations

import asyncio
import threading
import time
from collections.abc import Awaitable, Callable, Sequence
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from pydantic import BaseModel, Field, field_validator
from weaviate.exceptions import WeaviateBaseError

from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.search_v2.config import WeaviateV2Settings, load_settings
from app.search_v2.engine import WeaviateV2Engine
from app.search_v2.supabase_ids import lookup_supabase_ids

ENGINE_NAME = "weaviate-v2"
THESIS_MAX_CHARS = 600
CHUNK_MAX_CHARS = 800

router = APIRouter(prefix="/search/v2", tags=["Search v2 (test)"])

SupabaseLookup = Callable[
    [Sequence[tuple[str, str | None]]], Awaitable[dict[str, str | None]]
]


class SearchV2Request(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    limit: int = Field(10, ge=1, le=50)
    alpha: float = Field(
        0.25, ge=0.0, le=1.0, description="0 = BM25 only, 1 = vector only"
    )

    @field_validator("query")
    @classmethod
    def _strip_query(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("query must not be blank")
        return value


class SearchV2Chunk(BaseModel):
    text: str
    chunk_idx: int


class SearchV2Result(BaseModel):
    judgment_id: str
    signature: str | None = None
    court_name: str | None = None
    decision_date: str | None = None
    thesis: str | None = None
    score: float
    best_chunk: SearchV2Chunk
    source_id: str | None = None
    supabase_id: str | None = Field(
        None, description="judgments.id when the judgment is also in the app database"
    )


class SearchV2Response(BaseModel):
    results: list[SearchV2Result]
    took_ms: int
    engine: str = ENGINE_NAME


_engine: WeaviateV2Engine | None = None
_engine_lock = threading.Lock()


def get_engine() -> WeaviateV2Engine:
    """The shared engine for the current env; 503 when v2 is not configured."""
    global _engine
    settings: WeaviateV2Settings | None = load_settings()
    if settings is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="search v2 not configured",
        )
    with _engine_lock:
        if _engine is None or _engine.settings != settings:
            if _engine is not None:
                _engine.close()
            _engine = WeaviateV2Engine(settings)
        return _engine


def get_supabase_lookup() -> SupabaseLookup:
    return lookup_supabase_ids


def _truncate(text: str | None, limit: int) -> str | None:
    if not text:
        return None
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def _date(value: Any) -> str | None:
    if not value:
        return None
    return value.date().isoformat() if hasattr(value, "date") else str(value)[:10]


@router.post(
    "",
    response_model=SearchV2Response,
    summary="Test search over the Weaviate v2 corpus (hybrid chunks + MaxP)",
)
async def search_v2(
    request: SearchV2Request,
    _user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    engine: Annotated[WeaviateV2Engine, Depends(get_engine)],
    lookup: Annotated[SupabaseLookup, Depends(get_supabase_lookup)],
) -> SearchV2Response:
    started = time.perf_counter()
    try:
        hits = await asyncio.to_thread(
            engine.search, request.query, request.limit, request.alpha
        )
    except (httpx.HTTPError, WeaviateBaseError) as exc:
        logger.warning("search v2 backend unavailable: {}", exc)
        engine.reset()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="search v2 unavailable",
        ) from exc

    supabase_ids = await lookup(
        [(hit.judgment_id, _date(props.get("date_issued"))) for hit, props in hits]
    )
    results = [
        SearchV2Result(
            judgment_id=hit.judgment_id,
            signature=props.get("document_number"),
            court_name=props.get("court_name"),
            decision_date=_date(props.get("date_issued")),
            thesis=_truncate(props.get("thesis"), THESIS_MAX_CHARS),
            score=hit.score,
            best_chunk=SearchV2Chunk(
                text=_truncate(hit.best_chunk.chunk_text, CHUNK_MAX_CHARS) or "",
                chunk_idx=hit.best_chunk.chunk_idx,
            ),
            source_id=props.get("source_id"),
            supabase_id=supabase_ids.get(hit.judgment_id),
        )
        for hit, props in hits
    ]
    return SearchV2Response(
        results=results, took_ms=round((time.perf_counter() - started) * 1000)
    )
