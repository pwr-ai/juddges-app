"""POST /documents/search/rewrite — LLM query rewriter + facet validation."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Request
from juddges_search.chains.query_rewrite import build_query_rewrite_chain
from loguru import logger
from pydantic import BaseModel, Field, field_validator

from app.services.facet_validation import (
    FacetValidator,
    RewrittenQueryEnvelope,
)
from app.services.search import MeiliSearchService

if TYPE_CHECKING:
    from juddges_search.chains.query_rewrite_models import QueryRewriteResult


# ── request model ────────────────────────────────────────────────────────


class QueryRewriteRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    languages_hint: list[str] | None = None
    today: date | None = None  # injected for deterministic tests

    @field_validator("query")
    @classmethod
    def _non_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("query must not be blank")
        return v.strip()


# ── lazy singletons (so tests can patch them) ────────────────────────────


_CHAIN: Any | None = None
_VALIDATOR: FacetValidator | None = None


def _get_chain():
    global _CHAIN
    if _CHAIN is None:
        _CHAIN = build_query_rewrite_chain()
    return _CHAIN


def _get_validator() -> FacetValidator:
    global _VALIDATOR
    if _VALIDATOR is None:
        # Numeric bounds populated from the index aggregates is a future
        # task; an empty map still produces correct behaviour (no clamp).
        _VALIDATOR = FacetValidator(meili=MeiliSearchService.from_env())
    return _VALIDATOR


# ── router ───────────────────────────────────────────────────────────────


router = APIRouter(tags=["search"])


@router.post(
    "/search/rewrite",
    response_model=RewrittenQueryEnvelope,
    summary="LLM query rewrite + structured filter extraction (thinking mode)",
)
async def rewrite_query(
    request: Request, body: QueryRewriteRequest
) -> RewrittenQueryEnvelope:
    chain = _get_chain()
    validator = _get_validator()

    chain_inputs = {
        "query": body.query,
        "today": (body.today or date.today()).isoformat(),
        "languages_hint": body.languages_hint or ["pl", "uk"],
    }

    try:
        rewrite_result: QueryRewriteResult = await chain.ainvoke(chain_inputs)
    except Exception as exc:  # we explicitly degrade on any failure
        logger.warning(
            "query_rewrite_chain failed — degrading: {}: {}",
            type(exc).__name__,
            exc,
        )
        return RewrittenQueryEnvelope(rewritten_query=body.query, degraded=True)

    return await validator.validate(rewrite_result)
