"""Validator that turns an LLM `QueryRewriteResult` into a frontend
envelope, dropping or canonicalising values against the live Meili index.

This module owns NO LLM logic — it only validates what the LLM produced.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

# NumericRange is referenced in Pydantic model bodies below, so Pydantic
# resolves it via get_type_hints at class-creation time — it must remain a
# runtime import even though ruff's TC rules would suggest otherwise.
from juddges_search.chains.query_rewrite_models import NumericRange  # noqa: TC002
from loguru import logger
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from juddges_search.chains.query_rewrite_models import QueryRewriteResult

    from app.services.search import MeiliSearchService

# ── Envelope models ──────────────────────────────────────────────────────


class EnvelopeBaseFilters(BaseModel):
    base_num_victims: NumericRange | None = None
    base_victim_age_offence: NumericRange | None = None
    base_case_number: NumericRange | None = None
    base_co_def_acc_num: NumericRange | None = None
    base_date_of_appeal_court_judgment_ts: NumericRange | None = None


class EnvelopeFacets(BaseModel):
    jurisdiction: str | None = None
    court_level: str | None = None
    case_type: str | None = None
    decision_type: str | None = None
    outcome: str | None = None


class EnvelopeArrays(BaseModel):
    keywords: list[str] = Field(default_factory=list)
    legal_topics: list[str] = Field(default_factory=list)
    cited_legislation: list[str] = Field(default_factory=list)


class EnvelopeDateRange(BaseModel):
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None

    model_config = {"populate_by_name": True}


class EnvelopeFilters(BaseModel):
    base: EnvelopeBaseFilters = Field(default_factory=EnvelopeBaseFilters)
    facets: EnvelopeFacets = Field(default_factory=EnvelopeFacets)
    arrays: EnvelopeArrays = Field(default_factory=EnvelopeArrays)
    decision_date: EnvelopeDateRange | None = None
    languages: list[str] = Field(default_factory=list)


class EnvelopeDiagnostics(BaseModel):
    dropped_terms: list[str] = Field(default_factory=list)
    latency_ms: int = 0
    model: str = "gpt-5-mini"


class RewrittenQueryEnvelope(BaseModel):
    rewritten_query: str
    filters: EnvelopeFilters = Field(default_factory=EnvelopeFilters)
    diagnostics: EnvelopeDiagnostics = Field(default_factory=EnvelopeDiagnostics)
    degraded: bool = False


# ── Validator ────────────────────────────────────────────────────────────


_ARRAY_FIELDS = ("keywords", "legal_topics", "cited_legislation")


@dataclass
class FacetValidator:
    meili: MeiliSearchService
    per_field_timeout_s: float = 0.25
    total_timeout_s: float = 1.0

    async def validate(
        self, result: QueryRewriteResult, model_name: str = "gpt-5-mini"
    ) -> RewrittenQueryEnvelope:
        started = time.monotonic()

        diagnostics = EnvelopeDiagnostics(model=model_name)

        arrays = await self._canonicalise_arrays(result, diagnostics)

        envelope = RewrittenQueryEnvelope(
            rewritten_query=result.rewritten_query,
            filters=EnvelopeFilters(
                facets=EnvelopeFacets(
                    jurisdiction=result.jurisdiction,
                    court_level=result.court_level,
                    case_type=result.case_type,
                    decision_type=result.decision_type,
                    outcome=result.outcome,
                ),
                arrays=arrays,
            ),
            diagnostics=diagnostics,
        )
        envelope.diagnostics.latency_ms = int((time.monotonic() - started) * 1000)
        return envelope

    async def _canonicalise_arrays(
        self,
        result: QueryRewriteResult,
        diagnostics: EnvelopeDiagnostics,
    ) -> EnvelopeArrays:
        out = EnvelopeArrays()

        async def _resolve_one(field: str, value: str) -> str | None:
            try:
                hits = await asyncio.wait_for(
                    self.meili.facet_search(field, value, limit=3),
                    timeout=self.per_field_timeout_s,
                )
            except Exception:
                logger.opt(exception=True).debug(
                    "facet_search failed for {}={}", field, value
                )
                return None
            for h in hits:
                if h.lower() == value.lower():
                    return h
            return hits[0] if hits else None

        # Dispatch every (field, value) lookup concurrently per spec §5.
        # asyncio.gather preserves submission order so we keep the LLM's
        # original ordering.
        tasks: list[tuple[str, str, asyncio.Task[str | None]]] = []
        for field_name in _ARRAY_FIELDS:
            values: list[str] = getattr(result, field_name)
            for v in values:
                tasks.append(
                    (
                        field_name,
                        v,
                        asyncio.create_task(_resolve_one(field_name, v)),
                    )
                )

        if tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*(t for _, _, t in tasks), return_exceptions=True),
                    timeout=self.total_timeout_s,
                )
            except TimeoutError:
                for _, _, t in tasks:
                    if not t.done():
                        t.cancel()

        for field_name, original, task in tasks:
            canonical = task.result() if task.done() and not task.cancelled() else None
            if canonical is None:
                diagnostics.dropped_terms.append(f"{field_name}:{original}")
                continue
            getattr(out, field_name).append(canonical)

        return out
