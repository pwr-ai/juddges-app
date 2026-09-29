"""Response models for the PL/UK comparison API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models import Jurisdiction

Tier = Literal["primary", "partial", "unavailable", "empty"]
FieldKind = Literal["enum", "enum_array", "boolean"]

# Why the extension half of a pair view is missing (`PairCompareResponse.extension_reason`).
ExtensionReason = Literal[
    "no_jobs",  # neither collection has a SUCCESS job with an extension schema
    "no_job_pl",  # only the UK side has one
    "no_job_uk",  # only the PL side has one
    "schema_mismatch",  # both have one, but the newest jobs ran different schemas
    "schema_not_found",  # the shared schema_id no longer resolves in extraction_schemas
    "extension_failed",  # reading jobs/schema raised; base fields are still served
]

__all__ = [
    "CompareField",
    "CompareResponse",
    "CompareValue",
    "CoverageStat",
    "ExtensionCompare",
    "ExtensionJobRef",
    "ExtensionReason",
    "FieldKind",
    "Jurisdiction",
    "PairCompareResponse",
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


class ExtensionJobRef(BaseModel):
    """The extraction job whose `results` fed one side of the extension tally."""

    job_id: str = Field(
        description="Celery task id, as used by /extractions/jobs/{job_id}"
    )
    completed_at: str | None = None


class ExtensionCompare(BaseModel):
    """Side-by-side counts for the extension schema both sides were extracted with.

    Present only when the newest SUCCESS job of each collection ran the same
    `schema_id`; `fields` may be empty when that schema has no enum/boolean
    field. Coverage denominators are the job's completed documents, not the
    collection size, so `totals` here can differ from the base `totals`.
    """

    schema_id: str
    schema_name: str | None = None
    source: str = Field(description="'schema:<extraction_schema_id>', as on each field")
    jobs: dict[str, ExtensionJobRef]
    totals: dict[str, int]
    fields: list[CompareField]


class PairCompareResponse(CompareResponse):
    """`CompareResponse` over a saved pair's membership, plus the extension tally.

    `fields` holds the base-schema fields only; extension-schema fields live in
    `extension.fields` (each with `source = 'schema:<id>'`). Exactly one of
    `extension` / `extension_reason` is set.
    """

    pair: PairSummary
    extension: ExtensionCompare | None = None
    extension_reason: ExtensionReason | None = None
