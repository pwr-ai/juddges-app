"""Pydantic schema for the LLM query rewriter's structured output."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class NumericRange(BaseModel):
    """Closed numeric range used for base_* range filters."""

    model_config = ConfigDict(extra="forbid")

    min: float | None = Field(default=None)
    max: float | None = Field(default=None)

    @model_validator(mode="after")
    def _check_bounds(self) -> "NumericRange":
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("min must be <= max")
        return self


class DateRange(BaseModel):
    """ISO-8601 date range used for decision_date filters."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: date | None = Field(default=None, alias="from")
    to: date | None = Field(default=None)

    @model_validator(mode="after")
    def _check_order(self) -> "DateRange":
        if self.from_ is not None and self.to is not None and self.from_ > self.to:
            raise ValueError("from must be <= to")
        return self


# Categorical enums — mirror MEILISEARCH_FACET_VOCABULARY in
# backend/app/services/meilisearch_config.py. We re-declare here as
# Literal types because juddges_search is a standalone package and must
# not import from backend.app.
Jurisdiction = Literal["PL", "UK"]
CourtLevel = Literal[
    "supreme",
    "constitutional",
    "appellate",
    "regional",
    "district",
    "local",
    "administrative",
]
CaseType = Literal["criminal", "civil", "administrative", "commercial"]
DecisionType = Literal["judgment", "order", "resolution"]
Outcome = Literal["granted", "dismissed", "partial", "remanded"]
LanguageCode = Literal["pl", "uk"]


MAX_ARRAY_VALUES = 6


def _cap_array(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for v in values:
        v = v.strip()
        if not v or v.lower() in seen:
            continue
        seen.add(v.lower())
        out.append(v)
        if len(out) == MAX_ARRAY_VALUES:
            break
    return out


class QueryRewriteResult(BaseModel):
    """Structured output emitted by the LLM."""

    model_config = ConfigDict(extra="forbid")

    rewritten_query: str = Field(min_length=1, max_length=400)

    jurisdiction: Jurisdiction | None = None
    court_level: CourtLevel | None = None
    case_type: CaseType | None = None
    decision_type: DecisionType | None = None
    outcome: Outcome | None = None

    keywords: list[str] = Field(default_factory=list)
    legal_topics: list[str] = Field(default_factory=list)
    cited_legislation: list[str] = Field(default_factory=list)

    decision_date: DateRange | None = None
    languages: list[LanguageCode] = Field(default_factory=list)

    base_num_victims: NumericRange | None = None
    base_victim_age_offence: NumericRange | None = None
    base_case_number: NumericRange | None = None
    base_co_def_acc_num: NumericRange | None = None
    # base_date_of_appeal_court_judgment_ts: Unix epoch seconds, mirroring
    # the Meilisearch numeric field (see meilisearch_config.transform_judgment_for_meilisearch).
    base_date_of_appeal_court_judgment_ts: NumericRange | None = None

    @field_validator("keywords", "legal_topics", "cited_legislation", mode="after")
    @classmethod
    def _cap(cls, v: list[str]) -> list[str]:
        return _cap_array(v)
