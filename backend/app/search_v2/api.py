"""Full-corpus search over the Weaviate v2 corpus (~2.7M Polish judgments).

- ``POST /search/v2``: hybrid chunk search aggregated to judgments (MaxP).
- ``GET /search/v2/judgments/{judgment_id}``: one judgment with its full text,
  for rulings that have no row in the app database.

Registered in ``API_KEY_PROTECTED_ROUTERS`` (``BACKEND_API_KEY``) and, unlike
the guest-reachable ``/api/search/documents``, both also require a signed-in
Supabase user, so the full corpus never spends guest allowance. The curated
set (judgments with LLM extractions) stays on the Supabase/Meilisearch path.
"""

from __future__ import annotations

import asyncio
import threading
import time
from collections.abc import Awaitable, Callable, Sequence
from datetime import date  # noqa: TC003 -- pydantic resolves it at runtime
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, status
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from weaviate.exceptions import WeaviateBaseError

from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.search_v2.config import WeaviateV2Settings, load_settings
from app.search_v2.engine import ChunkFilters, WeaviateV2Engine
from app.search_v2.supabase_ids import lookup_supabase_ids

ENGINE_NAME = "weaviate-v2"
THESIS_MAX_CHARS = 600
CHUNK_MAX_CHARS = 800
# A long judgment is ~100k characters; the response is gzipped (GZipMiddleware).
# The cap only guards against a pathological record.
FULL_TEXT_MAX_CHARS = 1_000_000
# pl-court ids are ``<court>_<dept>_..._<seq>``; NSA ids are paths such as
# ``/doc/39FBE5DB09``, hence the slash and the ``:path`` route converter.
JUDGMENT_ID_PATTERN = r"^[A-Za-z0-9_.\-/]{1,255}$"

router = APIRouter(prefix="/search/v2", tags=["Search v2 (full corpus)"])

SupabaseLookup = Callable[
    [Sequence[tuple[str, str | None]]], Awaitable[dict[str, str | None]]
]


class SearchV2Request(BaseModel):
    # Unknown fields are refused, so a filter the engine cannot serve (e.g.
    # ``source``, which is not on the chunk collection) fails loudly.
    model_config = ConfigDict(extra="forbid")

    query: str = Field(..., min_length=1, max_length=1000)
    limit: int = Field(10, ge=1, le=50)
    alpha: float = Field(
        0.25, ge=0.0, le=1.0, description="0 = BM25 only, 1 = vector only"
    )
    court_type: list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(
        default_factory=list,
        max_length=10,
        description="Exact court_type values, e.g. ordinary_court, administrative_court",
    )
    date_from: date | None = Field(None, description="First decision day (inclusive)")
    date_to: date | None = Field(None, description="Last decision day (inclusive)")

    @field_validator("query")
    @classmethod
    def _strip_query(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("query must not be blank")
        return value

    @model_validator(mode="after")
    def _check_date_range(self) -> SearchV2Request:
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must not be after date_to")
        return self

    def chunk_filters(self) -> ChunkFilters | None:
        filters = ChunkFilters(
            court_type=list(self.court_type),
            date_from=self.date_from,
            date_to=self.date_to,
        )
        return filters or None


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


class SearchV2Judgment(BaseModel):
    judgment_id: str
    signature: str | None = None
    court_name: str | None = None
    court_type: str | None = None
    department_name: str | None = None
    judgment_type: str | None = None
    decision_date: str | None = None
    thesis: str | None = None
    full_text: str | None = None
    full_text_truncated: bool = False
    keywords: list[str] = Field(default_factory=list)
    judges: list[str] = Field(default_factory=list)
    presiding_judge: str | None = None
    legal_bases: list[str] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)
    source: str | None = None
    source_id: str | None = None
    source_url: str | None = None
    language: str | None = None
    supabase_id: str | None = Field(
        None, description="judgments.id when the judgment is also in the app database"
    )
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


def _unavailable(engine: WeaviateV2Engine, exc: Exception) -> HTTPException:
    logger.warning("search v2 backend unavailable: {}", exc)
    engine.reset()
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="search v2 unavailable",
    )


@router.post(
    "",
    response_model=SearchV2Response,
    summary="Full-corpus search over the Weaviate v2 corpus (hybrid chunks + MaxP)",
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
            engine.search,
            request.query,
            request.limit,
            request.alpha,
            filters=request.chunk_filters(),
        )
    except (httpx.HTTPError, WeaviateBaseError) as exc:
        raise _unavailable(engine, exc) from exc

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


def _strings(value: Any) -> list[str]:
    return [str(v) for v in value if v] if isinstance(value, list) else []


@router.get(
    "/judgments/{judgment_id:path}",
    response_model=SearchV2Judgment,
    summary="One judgment of the Weaviate v2 corpus, full text included",
    responses={404: {"description": "Not in the v2 corpus"}},
)
async def get_judgment_v2(
    judgment_id: Annotated[
        str, Path(pattern=JUDGMENT_ID_PATTERN, description="Weaviate judgment_id")
    ],
    _user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    engine: Annotated[WeaviateV2Engine, Depends(get_engine)],
    lookup: Annotated[SupabaseLookup, Depends(get_supabase_lookup)],
) -> SearchV2Judgment:
    try:
        props = await asyncio.to_thread(engine.get_judgment, judgment_id)
    except (httpx.HTTPError, WeaviateBaseError) as exc:
        raise _unavailable(engine, exc) from exc
    if props is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="judgment not found"
        )

    decision_date = _date(props.get("date_issued"))
    supabase_ids = await lookup([(judgment_id, decision_date)])
    full_text = props.get("full_text") or None
    truncated = bool(full_text and len(full_text) > FULL_TEXT_MAX_CHARS)
    return SearchV2Judgment(
        judgment_id=props.get("judgment_id") or judgment_id,
        signature=props.get("document_number"),
        court_name=props.get("court_name"),
        court_type=props.get("court_type"),
        department_name=props.get("department_name"),
        judgment_type=props.get("judgment_type"),
        decision_date=decision_date,
        thesis=props.get("thesis") or None,
        full_text=full_text[:FULL_TEXT_MAX_CHARS] if truncated else full_text,
        full_text_truncated=truncated,
        keywords=_strings(props.get("keywords")),
        judges=_strings(props.get("judges")),
        presiding_judge=props.get("presiding_judge"),
        legal_bases=_strings(props.get("legal_bases")),
        references=_strings(props.get("references")),
        source=props.get("source"),
        source_id=props.get("source_id"),
        source_url=props.get("source_url"),
        language=props.get("language"),
        supabase_id=supabase_ids.get(judgment_id),
    )
