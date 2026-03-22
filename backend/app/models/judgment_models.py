"""
Pydantic models for Judgment data structures.

These models match the database schema in supabase/schema_updated.sql
and support the legal coding scheme for detailed case analysis.
"""

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

# =============================================================================
# CODING SCHEME MODELS
# =============================================================================


# Section 2: Court Hearings Information
class CourtHearingData(BaseModel):
    """Court hearing information (Section 2 of coding scheme)."""

    neutral_citation_number: str | None = Field(
        None,
        description="Neutral citation number including year, e.g., '[2023] EWCA Crim 123'",
        examples=["[2023] EWCA Crim 123"],
    )
    case_number_hearing: str | None = Field(
        None, description="Case number at hearing", alias="caseNumber"
    )
    appeal_date: date | None = Field(None, description="Date of appeal court judgment")
    appeal_judges: list[str] | None = Field(
        None,
        description="Names of appeal court judges",
        examples=[["Lord Justice Smith", "Mr Justice Jones"]],
    )
    case_name: str | None = Field(
        None,
        description="Case name, e.g., 'Regina v. Casim Scott'",
        examples=["Regina v. Casim Scott"],
    )
    offender_representative: str | None = Field(
        None, description="Name of offender's legal representative"
    )
    crown_representative: str | None = Field(
        None, description="Name of Crown/Attorney General representative"
    )

    class Config:
        populate_by_name = True


# Section 3: Offence/Trial/Sentence Information
class PleaInformation(BaseModel):
    """Plea information for the offender."""

    confessed: bool | None = Field(
        None, description="Did offender confess/plead guilty?"
    )
    plea_point: (
        Literal[
            "police_presence",
            "first_court_appearance",
            "before_trial",
            "first_day_trial",
            "after_first_day_trial",
            "dont_know",
        ]
        | None
    ) = Field(
        None, description="At what point during proceedings did offender plead guilty?"
    )


class OffenderInformation(BaseModel):
    """Offender demographic and status information."""

    gender: (
        Literal["male", "female", "all_male", "all_female", "male_and_female"] | None
    ) = Field(None, description="Offender(s) gender")
    age_at_offence: int | None = Field(
        None, description="Offender(s) age at time of offence", ge=0, le=150
    )
    employment_status: (
        Literal[
            "employed",
            "self_employed",
            "unemployed",
            "student",
            "retired",
            "other",
            "dont_know",
        ]
        | None
    ) = Field(None, description="Employment status at time of offence")

    accommodation_status: (
        Literal["fixed_address", "homeless", "temporary_accommodation", "dont_know"]
        | None
    ) = Field(None, description="Accommodation status at time of offence")

    mental_health: str | None = Field(
        None,
        description="Mental health status, e.g., 'had_mental_health_problems', 'learning_difficulties'",
    )
    intoxicated: (
        Literal[
            "yes_drinking", "yes_drugs", "yes_drinking_and_drugs", "no", "dont_know"
        ]
        | None
    ) = Field(None, description="Was offender intoxicated at time of offence?")

    victim_relationship: (
        Literal["stranger", "relative", "acquaintance", "dont_know"] | None
    ) = Field(None, description="Offender-victim relationship")


class VictimInformation(BaseModel):
    """Victim demographic and status information."""

    victim_type: Literal["individual", "organisation"] | None = Field(
        None, description="Type of victim"
    )
    count: int | None = Field(None, description="Number of victims", ge=0)
    gender: (
        Literal["male", "female", "all_male", "all_female", "male_and_female"] | None
    ) = Field(None, description="Victim(s) gender")
    age_at_offence: int | None = Field(
        None, description="Victim(s) age at time of offence", ge=0, le=150
    )
    employment_status: (
        Literal[
            "employed",
            "self_employed",
            "unemployed",
            "student",
            "retired",
            "other",
            "dont_know",
        ]
        | None
    ) = None

    accommodation_status: (
        Literal["fixed_address", "homeless", "temporary_accommodation", "dont_know"]
        | None
    ) = None

    mental_health: str | None = None
    intoxicated: (
        Literal[
            "yes_drinking", "yes_drugs", "yes_drinking_and_drugs", "no", "dont_know"
        ]
        | None
    ) = None


class OffenceTrialData(BaseModel):
    """Offence, trial, and sentence information (Section 3 of coding scheme)."""

    # Conviction details
    conviction_courts: list[str] | None = Field(
        None, description="Court name(s) where offender convicted/pled guilty"
    )
    conviction_dates: list[str] | None = Field(
        None, description="Conviction/guilty plea date(s) in ISO format"
    )
    convicted_offences: list[str] | None = Field(
        None, description="Offence(s) offender was convicted of"
    )
    acquitted_offences: list[str] | None = Field(
        None, description="Offence(s) offender was acquitted of"
    )

    # Plea information
    plea: PleaInformation | None = None

    # Remand information
    remand_decision: (
        Literal[
            "unconditional_bail", "conditional_bail", "remanded_custody", "dont_know"
        ]
        | None
    ) = None
    remand_custody_duration: str | None = Field(
        None, description="Duration of custody remand"
    )

    # Sentencing details
    sentence_court: str | None = Field(
        None, description="Court where offender sentenced"
    )
    sentences: list[str] | None = Field(None, description="Sentence(s) received")
    sentence_serve_type: (
        Literal["all_concurrent", "all_consecutive", "combination", "dont_know"] | None
    ) = Field(None, description="How multiple sentences are to be served")

    ancillary_orders: list[str] | None = Field(
        None,
        description="Ancillary orders applied (e.g., restraining orders, compensation orders)",
    )

    # Offender and victim information
    offender: OffenderInformation | None = None
    victim: VictimInformation | None = None

    # Evidence presented
    prosecution_evidence: list[str] | None = Field(
        None,
        description="Types of evidence prosecution presented at trial",
        examples=[["CCTV", "victim_testimony", "DNA_match"]],
    )
    defence_evidence: list[str] | None = Field(
        None, description="Types of evidence defence presented at trial"
    )

    # Sentencing factors
    pre_sentence_report: Literal["low", "medium", "high", "dont_know"] | None = Field(
        None, description="Pre-sentence report risk assessment"
    )
    aggravating_factors: list[str] | None = Field(
        None, description="Aggravating factors mentioned by court"
    )
    mitigating_factors: list[str] | None = Field(
        None, description="Mitigating factors mentioned by court"
    )
    victim_impact_statement: bool | None = Field(
        None, description="Was victim impact statement given at sentencing?"
    )


# Section 4: Appeal Information
class CoDefendantInfo(BaseModel):
    """Co-defendant information."""

    present: bool | None = Field(None, description="Were there co-defendants?")
    count: int | None = Field(None, description="Number of co-defendants", ge=0)


class AppealReasons(BaseModel):
    """Reasons given by appeal court for various decisions."""

    quash_conviction: list[str] | None = Field(
        None, description="Reasons why conviction is unsafe/quashed"
    )
    sentence_excessive: list[str] | None = Field(
        None, description="Reasons why sentence is unduly excessive"
    )
    sentence_lenient: list[str] | None = Field(
        None, description="Reasons why sentence is unduly lenient"
    )
    dismissed: list[str] | None = Field(
        None, description="Reasons why appeal was dismissed/failed"
    )


class AppealData(BaseModel):
    """Appeal information (Section 4 of coding scheme)."""

    appellant: Literal["offender", "attorney_general", "other"] | None = Field(
        None, description="Who is the appellant?"
    )
    co_defendants: CoDefendantInfo | None = None

    appeal_against: (
        Literal[
            "conviction_unsafe",
            "sentence_excessive",
            "sentence_lenient",
            "both_conviction_and_sentence",
            "other",
        ]
        | None
    ) = Field(None, description="What is the appeal against?")

    appeal_grounds: list[str] | None = Field(
        None,
        description="Ground(s) for appeal",
        examples=[["trial_judge_summing_up", "evidence_admissibility"]],
    )
    sentencing_guidelines: list[str] | None = Field(
        None, description="Sentencing guidelines/laws/acts mentioned by appeal court"
    )

    appeal_outcome: (
        Literal[
            "dismissed",
            "allowed_conviction_quashed",
            "allowed_sentence_more_excessive",
            "allowed_sentence_more_lenient",
            "mixed_decision",
            "other",
        ]
        | None
    ) = Field(None, description="Outcome of appeal")

    reasons: AppealReasons | None = Field(
        None, description="Appeal court's reasoning for the decision"
    )


# =============================================================================
# MAIN JUDGMENT MODEL
# =============================================================================


class Judgment(BaseModel):
    """Complete judgment/court decision model matching database schema."""

    # Primary identification
    id: UUID = Field(description="Unique judgment identifier")

    # Core metadata
    case_number: str = Field(description="Case number/reference")
    jurisdiction: Literal["PL", "UK"] = Field(description="Jurisdiction code")
    language: str | None = Field(
        None, description="Language code (ISO 639-1): pl, en, uk"
    )
    country: str | None = Field(None, description="Country name or code")

    court_name: str | None = Field(None, description="Name of the court")
    court_level: str | None = Field(
        None,
        description="Court hierarchy level",
        examples=["Supreme Court", "Court of Appeal", "District Court"],
    )
    decision_date: date | None = Field(None, description="Date of decision")
    publication_date: date | None = Field(None, description="Date of publication")

    # Content
    title: str | None = Field(None, description="Judgment title")
    summary: str | None = Field(None, description="Summary/abstract")
    full_text: str = Field(description="Full text of judgment")

    # Legal details
    judges: dict[str, Any] | None = Field(
        None, description="Judge information (names, roles)"
    )
    case_type: str | None = Field(
        None,
        description="Type of case",
        examples=["Criminal", "Civil", "Administrative"],
    )
    decision_type: str | None = Field(
        None, description="Type of decision", examples=["Judgment", "Order", "Ruling"]
    )
    outcome: str | None = Field(
        None, description="Case outcome", examples=["Granted", "Dismissed", "Remanded"]
    )

    # Classification
    keywords: list[str] | None = Field(default_factory=list, description="Keywords")
    legal_topics: list[str] | None = Field(
        default_factory=list, description="Legal topics"
    )
    cited_legislation: list[str] | None = Field(
        default_factory=list, description="Cited legislation/acts"
    )

    # Vector embedding
    embedding: list[float] | None = Field(
        None, description="1024-dimensional embedding vector for semantic search"
    )

    # Coding scheme data (flexible JSONB fields)
    court_hearing_data: CourtHearingData | None = Field(
        None, description="Court hearing details (Section 2)"
    )
    offence_trial_data: OffenceTrialData | None = Field(
        None, description="Offence/trial/sentence details (Section 3)"
    )
    appeal_data: AppealData | None = Field(
        None, description="Appeal information (Section 4)"
    )

    # Flexible metadata
    metadata: dict[str, Any] | None = Field(
        default_factory=dict, description="Additional metadata"
    )

    # Source information
    source_dataset: str | None = Field(None, description="Source dataset name")
    source_id: str | None = Field(None, description="Original source ID")
    source_url: str | None = Field(None, description="URL to original judgment")

    # Timestamps
    created_at: datetime | None = Field(None, description="Creation timestamp")
    updated_at: datetime | None = Field(None, description="Last update timestamp")

    class Config:
        from_attributes = True
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "case_number": "2023/EWCA/Crim/123",
                "jurisdiction": "UK",
                "language": "en",
                "country": "UK",
                "court_name": "Court of Appeal (Criminal Division)",
                "court_level": "Appeal Court",
                "decision_date": "2023-06-15",
                "title": "Regina v. John Smith",
                "summary": "Appeal against conviction for theft...",
                "full_text": "Full judgment text...",
                "case_type": "Criminal",
                "decision_type": "Judgment",
                "outcome": "Dismissed",
                "keywords": ["theft", "appeal", "conviction"],
                "legal_topics": ["criminal law", "theft"],
                "cited_legislation": ["Theft Act 1968"],
                "court_hearing_data": {
                    "neutral_citation_number": "[2023] EWCA Crim 123",
                    "appeal_judges": ["Lord Justice Smith", "Mr Justice Jones"],
                    "case_name": "Regina v. John Smith",
                },
                "appeal_data": {
                    "appellant": "offender",
                    "appeal_against": "conviction_unsafe",
                    "appeal_outcome": "dismissed",
                },
            }
        }


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


class JudgmentCreateRequest(BaseModel):
    """Request model for creating a new judgment."""

    case_number: str
    jurisdiction: Literal["PL", "UK"]
    language: str | None = None
    country: str | None = None
    court_name: str | None = None
    court_level: str | None = None
    decision_date: date | None = None
    publication_date: date | None = None
    title: str | None = None
    summary: str | None = None
    full_text: str
    judges: dict[str, Any] | None = None
    case_type: str | None = None
    decision_type: str | None = None
    outcome: str | None = None
    keywords: list[str] | None = None
    legal_topics: list[str] | None = None
    cited_legislation: list[str] | None = None
    court_hearing_data: CourtHearingData | None = None
    offence_trial_data: OffenceTrialData | None = None
    appeal_data: AppealData | None = None
    metadata: dict[str, Any] | None = None
    source_dataset: str | None = None
    source_id: str | None = None
    source_url: str | None = None


class JudgmentUpdateRequest(BaseModel):
    """Request model for updating an existing judgment."""

    case_number: str | None = None
    language: str | None = None
    country: str | None = None
    court_name: str | None = None
    court_level: str | None = None
    decision_date: date | None = None
    publication_date: date | None = None
    title: str | None = None
    summary: str | None = None
    full_text: str | None = None
    judges: dict[str, Any] | None = None
    case_type: str | None = None
    decision_type: str | None = None
    outcome: str | None = None
    keywords: list[str] | None = None
    legal_topics: list[str] | None = None
    cited_legislation: list[str] | None = None
    court_hearing_data: CourtHearingData | None = None
    offence_trial_data: OffenceTrialData | None = None
    appeal_data: AppealData | None = None
    metadata: dict[str, Any] | None = None
    source_url: str | None = None


class JudgmentResponse(Judgment):
    """Response model for judgment API endpoints."""

    pass


class JudgmentListResponse(BaseModel):
    """Response model for listing judgments."""

    judgments: list[Judgment]
    total: int
    offset: int
    limit: int
    has_more: bool


# =============================================================================
# SEARCH RESULT MODELS
# =============================================================================


class HybridSearchResult(Judgment):
    """Search result with scoring information."""

    vector_score: float | None = Field(
        None, description="Vector similarity score (0-1)"
    )
    text_score: float | None = Field(None, description="Full-text search score")
    combined_score: float | None = Field(None, description="Combined hybrid score")


class HybridSearchResponse(BaseModel):
    """Response model for hybrid search results."""

    results: list[HybridSearchResult]
    total: int
    query_time_ms: float
    search_params: dict[str, Any] = Field(
        description="Parameters used for search (for debugging)"
    )
