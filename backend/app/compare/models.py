"""Response models for the PL/UK comparison API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models import Jurisdiction

Tier = Literal["primary", "partial", "unavailable", "empty"]
FieldKind = Literal["enum", "enum_array", "boolean"]

__all__ = [
    "CompareField",
    "CompareResponse",
    "CompareValue",
    "CoverageStat",
    "FieldKind",
    "Jurisdiction",
    "PairSummary",
    "Tier",
]


class CoverageStat(BaseModel):
    """How many matched judgments have the field filled, per jurisdiction."""

    covered: int
    total: int
    ratio: float | None = Field(description="covered / total; null when total is 0")


class CompareValue(BaseModel):
    value: str
    counts: dict[str, int]
    shares: dict[str, float | None] = Field(
        description="count / covered per jurisdiction; null where covered is 0"
    )


class CompareField(BaseModel):
    field: str
    label: str
    source: str = Field(description="'base' or 'schema:<extraction_schema_id>'")
    kind: FieldKind
    coverage: dict[str, CoverageStat]
    tier: Tier
    missing_in: list[str] = []
    values: list[CompareValue]


class PairSummary(BaseModel):
    id: str
    name: str
    pl_collection_id: str
    uk_collection_id: str


class CompareResponse(BaseModel):
    jurisdictions: list[str] = ["PL", "UK"]
    totals: dict[str, int]
    fields: list[CompareField]
    ignored_filter_keys: list[str] = []
    filters: dict[str, Any]
    text_query: str | None = None
    pair: PairSummary | None = None
