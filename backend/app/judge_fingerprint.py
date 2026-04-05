"""
Judge Reasoning Fingerprint endpoint.

Analyzes a judge's reasoning style across their cases using keyword-based
heuristics. Identifies dominant reasoning patterns (textual, deductive,
analogical, policy, teleological) to build a reasoning profile.

This is the MVP implementation using keyword frequency analysis.
A future iteration can plug in the full LLM-based argumentation analysis
from app.argumentation for higher-fidelity results.
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from loguru import logger
from pydantic import BaseModel, Field

from app.core.supabase import get_async_supabase_client
from app.rate_limiter import limiter

router = APIRouter(prefix="/judge-fingerprint", tags=["judge-fingerprint"])

# Rate limits per the issue specification
PROFILE_RATE_LIMIT = "30/hour"
COMPARE_RATE_LIMIT = "10/hour"
SEARCH_RATE_LIMIT = "60/hour"

# Maximum number of judgments to analyze per judge (guards against extremely
# prolific judges overwhelming the heuristic scan).
MAX_JUDGMENTS_PER_JUDGE = 200


# ===== Reasoning-style keyword dictionaries =====
# Each list contains Polish and English keywords / phrases that signal
# a particular style of legal reasoning.

REASONING_KEYWORDS: dict[str, list[str]] = {
    "textual": [
        "literalne brzmienie",
        "wykładnia językowa",
        "plain meaning",
        "literal interpretation",
        "according to the wording",
        "wykładnia literalna",
        "dosłowne znaczenie",
        "gramatyczna wykładnia",
    ],
    "deductive": [
        "wynika z",
        "na podstawie art.",
        "pursuant to",
        "it follows from",
        "in accordance with",
        "stosownie do",
        "zgodnie z art.",
        "w myśl przepisu",
        "z przepisu wynika",
    ],
    "analogical": [
        "analogicznie",
        "podobnie jak w",
        "by analogy",
        "similarly to",
        "as in the case of",
        "per analogiam",
        "na zasadzie analogii",
        "porównywalny przypadek",
    ],
    "policy": [
        "cel regulacji",
        "ratio legis",
        "legislative intent",
        "public interest",
        "policy objective",
        "interes publiczny",
        "zamiar ustawodawcy",
        "cel ustawy",
        "dobro publiczne",
    ],
    "teleological": [
        "celowościowa",
        "w świetle celu",
        "purposive interpretation",
        "spirit of the law",
        "wykładnia celowościowa",
        "wykładnia funkcjonalna",
        "cel przepisu",
        "duch ustawy",
    ],
}

# Pre-compile patterns for performance (case-insensitive)
_COMPILED_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    style: [re.compile(re.escape(kw), re.IGNORECASE) for kw in keywords]
    for style, keywords in REASONING_KEYWORDS.items()
}

REASONING_STYLES = list(REASONING_KEYWORDS.keys())


# ===== Pydantic response models =====


class CasePeriod(BaseModel):
    """Time range covered by analyzed cases."""

    first_case: str | None = Field(
        default=None, description="Date of the earliest case (ISO format)"
    )
    last_case: str | None = Field(
        default=None, description="Date of the most recent case (ISO format)"
    )


class SampleCase(BaseModel):
    """A single case reference with its dominant reasoning pattern."""

    case_id: str = Field(description="Judgment ID")
    case_number: str | None = Field(
        default=None, description="Case number / reference"
    )
    date: str | None = Field(default=None, description="Date of the judgment")
    dominant_pattern: str = Field(description="Dominant reasoning pattern in this case")
    court_name: str | None = Field(default=None, description="Name of the court")


class JudgeProfile(BaseModel):
    """Aggregated reasoning profile for a single judge."""

    judge_name: str = Field(description="Full name of the judge")
    total_cases: int = Field(description="Total number of cases found for this judge")
    style_scores: dict[str, float] = Field(
        description="Reasoning style scores (0-100) for textual, deductive, analogical, policy, teleological"
    )
    dominant_style: str = Field(description="The highest-scoring reasoning style")
    cases_analyzed: int = Field(
        description="Number of cases that were actually analyzed (may be less than total_cases)"
    )
    period: CasePeriod = Field(description="Time range of analyzed cases")
    sample_cases: list[SampleCase] = Field(
        default_factory=list,
        description="Up to 5 representative case references with their dominant pattern",
    )


class JudgeSearchResult(BaseModel):
    """A single result from judge name search."""

    judge_name: str = Field(description="Full name of the judge")
    case_count: int = Field(description="Number of cases associated with this judge")


# ===== Helper functions =====


async def _fetch_judgments_for_judge(judge_name: str) -> list[dict[str, Any]]:
    """Fetch judgments where the given judge participated.

    Searches the ``judges`` array column in the ``judgments`` table.
    """
    client = await get_async_supabase_client()
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="Database client is not available. Please try again later.",
        )

    try:
        # Query judgments where the judge appears in the judges JSONB array.
        # PostgREST `cs` (contains) for JSONB arrays uses JSON array format.
        response_judges = (
            await client.table("judgments")
            .select("id,case_number,decision_date,court_name,full_text,judges")
            .filter("judges", "cs", json.dumps([judge_name]))
            .limit(MAX_JUDGMENTS_PER_JUDGE)
            .execute()
        )

        judgments = list(response_judges.data or [])
        logger.info(f"Found {len(judgments)} judgments for judge '{judge_name}'")
        return judgments

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching judgments for judge '{judge_name}': {e}")
        raise HTTPException(
            status_code=503,
            detail="Failed to query judgments database. Please try again later.",
        )


def _count_style_hits(text: str) -> dict[str, int]:
    """Count keyword hits for each reasoning style in the given text."""
    counts: dict[str, int] = {}
    for style, patterns in _COMPILED_PATTERNS.items():
        total = 0
        for pattern in patterns:
            total += len(pattern.findall(text))
        counts[style] = total
    return counts


def _normalize_scores(raw_counts: dict[str, int]) -> dict[str, float]:
    """Normalize raw keyword counts to 0-100 scores.

    Uses max-normalization: the style with the highest count gets 100,
    others are scaled proportionally. If all counts are zero every style
    gets 0.
    """
    max_count = max(raw_counts.values()) if raw_counts else 0
    if max_count == 0:
        return dict.fromkeys(REASONING_STYLES, 0.0)
    return {
        style: round((count / max_count) * 100, 1)
        for style, count in raw_counts.items()
    }


def _dominant_style_for_text(text: str) -> str:
    """Return the dominant reasoning style for a single text."""
    counts = _count_style_hits(text)
    if not any(counts.values()):
        return "deductive"  # default when no keywords found
    return max(counts, key=lambda s: counts[s])


def _build_judge_profile(
    judge_name: str,
    judgments: list[dict[str, Any]],
) -> JudgeProfile:
    """Aggregate keyword-based reasoning scores across all judgments."""
    aggregated_counts: dict[str, int] = dict.fromkeys(REASONING_STYLES, 0)
    dates: list[str] = []
    sample_cases: list[SampleCase] = []
    cases_analyzed = 0

    for judgment in judgments:
        text = judgment.get("full_text") or ""
        if not text:
            continue

        cases_analyzed += 1
        counts = _count_style_hits(text)
        for style in REASONING_STYLES:
            aggregated_counts[style] += counts[style]

        # Collect date for period calculation
        date_val = judgment.get("decision_date")
        if date_val:
            dates.append(str(date_val))

        # Collect sample cases (up to 5)
        if len(sample_cases) < 5:
            dominant = (
                max(counts, key=lambda s: counts[s])
                if any(counts.values())
                else "deductive"
            )
            sample_cases.append(
                SampleCase(
                    case_id=str(judgment.get("id", "")),
                    case_number=judgment.get("case_number"),
                    date=str(date_val) if date_val else None,
                    dominant_pattern=dominant,
                    court_name=judgment.get("court_name"),
                )
            )

    style_scores = _normalize_scores(aggregated_counts)
    dominant_style = (
        max(style_scores, key=lambda s: style_scores[s])
        if any(v > 0 for v in style_scores.values())
        else "deductive"
    )

    sorted_dates = sorted(dates) if dates else []
    period = CasePeriod(
        first_case=sorted_dates[0] if sorted_dates else None,
        last_case=sorted_dates[-1] if sorted_dates else None,
    )

    return JudgeProfile(
        judge_name=judge_name,
        total_cases=len(judgments),
        style_scores=style_scores,
        dominant_style=dominant_style,
        cases_analyzed=cases_analyzed,
        period=period,
        sample_cases=sample_cases,
    )


# ===== Endpoints =====


@router.get(
    "/profile/{judge_name}",
    response_model=JudgeProfile,
    summary="Get reasoning fingerprint for a judge",
    description=(
        "Analyze a judge's reasoning style across their cases. Returns "
        "aggregated scores for textual, deductive, analogical, policy, "
        "and teleological reasoning based on keyword heuristics."
    ),
)
@limiter.limit(PROFILE_RATE_LIMIT)
async def get_judge_profile(
    request: Request,
    judge_name: str,
) -> JudgeProfile:
    """Build a reasoning fingerprint profile for the specified judge."""
    judge_name = judge_name.strip()
    if not judge_name:
        raise HTTPException(status_code=400, detail="Judge name must not be empty.")

    logger.info(f"Judge fingerprint request for: '{judge_name}'")

    judgments = await _fetch_judgments_for_judge(judge_name)
    if not judgments:
        raise HTTPException(
            status_code=404,
            detail=f"No judgments found for judge '{judge_name}'. "
            "Please verify the spelling or try the search endpoint first.",
        )

    profile = _build_judge_profile(judge_name, judgments)
    logger.info(
        f"Judge profile built for '{judge_name}': "
        f"{profile.cases_analyzed} cases analyzed, dominant={profile.dominant_style}"
    )
    return profile


@router.get(
    "/compare",
    response_model=list[JudgeProfile],
    summary="Compare reasoning styles of multiple judges",
    description=(
        "Compare the reasoning fingerprints of 2-3 judges side by side. "
        "Returns a list of JudgeProfile objects, one per judge."
    ),
)
@limiter.limit(COMPARE_RATE_LIMIT)
async def compare_judges(
    request: Request,
    judges: str = Query(
        description="Comma-separated list of 2-3 judge names to compare",
        examples=["Jan Kowalski,Anna Nowak"],
    ),
) -> list[JudgeProfile]:
    """Compare reasoning fingerprints for multiple judges."""
    judge_names = [name.strip() for name in judges.split(",") if name.strip()]

    if len(judge_names) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 judge names are required for comparison.",
        )
    if len(judge_names) > 3:
        raise HTTPException(
            status_code=400,
            detail="At most 3 judge names can be compared at once.",
        )

    logger.info(f"Judge comparison request for: {judge_names}")

    profiles: list[JudgeProfile] = []
    not_found: list[str] = []

    for name in judge_names:
        judgments = await _fetch_judgments_for_judge(name)
        if not judgments:
            not_found.append(name)
            continue
        profiles.append(_build_judge_profile(name, judgments))

    if not profiles:
        raise HTTPException(
            status_code=404,
            detail=f"No judgments found for any of the specified judges: {not_found}",
        )

    if not_found:
        logger.warning(f"Judges not found during comparison: {not_found}")

    return profiles


@router.get(
    "/search",
    response_model=list[JudgeSearchResult],
    summary="Search for judge names (autocomplete)",
    description=(
        "Search for judge names matching a query string. Returns matching "
        "judge names with their case counts, useful for autocomplete."
    ),
)
@limiter.limit(SEARCH_RATE_LIMIT)
async def search_judges(
    request: Request,
    q: str = Query(
        description="Search string for judge name autocomplete",
        min_length=2,
    ),
    limit: int = Query(
        default=10,
        ge=1,
        le=50,
        description="Maximum number of results to return",
    ),
) -> list[JudgeSearchResult]:
    """Search for judge names matching the query string."""
    q = q.strip()
    if not q:
        raise HTTPException(status_code=400, detail="Search query must not be empty.")

    logger.info(f"Judge search request: q='{q}', limit={limit}")

    client = await get_async_supabase_client()
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="Database client is not available. Please try again later.",
        )

    try:
        # Fetch judgments that have judges data.
        # The `judges` column is a TEXT[] array — we fetch all entries and
        # filter/aggregate in Python since PostgREST has limited array search.
        response = (
            await client.table("judgments")
            .select("judges")
            .not_.is_("judges", "null")
            .limit(2000)
            .execute()
        )

        # Aggregate counts per judge name, filtering by query match
        q_lower = q.lower()
        judge_counts: dict[str, int] = {}
        for row in response.data or []:
            judges_list = row.get("judges")
            if not isinstance(judges_list, list):
                continue
            for name in judges_list:
                if name and q_lower in name.lower():
                    judge_counts[name] = judge_counts.get(name, 0) + 1

        # Sort by case count descending, then alphabetically
        sorted_judges = sorted(
            judge_counts.items(),
            key=lambda item: (-item[1], item[0]),
        )[:limit]

        results = [
            JudgeSearchResult(judge_name=name, case_count=count)
            for name, count in sorted_judges
        ]

        logger.info(f"Judge search for '{q}' returned {len(results)} results")
        return results

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching for judges: {e}")
        raise HTTPException(
            status_code=503,
            detail="Failed to search judges. Please try again later.",
        )
