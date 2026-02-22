"""
Pydantic models for Judgment data structures.

These models match the database schema in supabase/schema_updated.sql
and support the legal coding scheme for detailed case analysis.
"""

from datetime import date, datetime
from typing import Optional, List, Dict, Any, Literal
from uuid import UUID
from pydantic import BaseModel, Field


# =============================================================================
# CODING SCHEME MODELS
# =============================================================================


# Section 2: Court Hearings Information
class CourtHearingData(BaseModel):
    """Court hearing information (Section 2 of coding scheme)."""

    neutral_citation_number: Optional[str] = Field(
        None,
        description="Neutral citation number including year, e.g., '[2023] EWCA Crim 123'",
        examples=["[2023] EWCA Crim 123"],
    )
    case_number_hearing: Optional[str] = Field(
        None, description="Case number at hearing", alias="caseNumber"
    )
    appeal_date: Optional[date] = Field(
        None, description="Date of appeal court judgment"
    )
    appeal_judges: Optional[List[str]] = Field(
        None,
        description="Names of appeal court judges",
        examples=[["Lord Justice Smith", "Mr Justice Jones"]],
    )
    case_name: Optional[str] = Field(
        None,
        description="Case name, e.g., 'Regina v. Casim Scott'",
        examples=["Regina v. Casim Scott"],
    )
    offender_representative: Optional[str] = Field(
        None, description="Name of offender's legal representative"
    )
    crown_representative: Optional[str] = Field(
        None, description="Name of Crown/Attorney General representative"
    )

    class Config:
        populate_by_name = True


# Section 3: Offence/Trial/Sentence Information
class PleaInformation(BaseModel):
    """Plea information for the offender."""

    confessed: Optional[bool] = Field(
        None, description="Did offender confess/plead guilty?"
    )
    plea_point: Optional[
        Literal[
            "police_presence",
            "first_court_appearance",
            "before_trial",
            "first_day_trial",
            "after_first_day_trial",
            "dont_know",
        ]
    ] = Field(
        None, description="At what point during proceedings did offender plead guilty?"
    )


class OffenderInformation(BaseModel):
    """Offender demographic and status information."""

    gender: Optional[
        Literal["male", "female", "all_male", "all_female", "male_and_female"]
    ] = Field(None, description="Offender(s) gender")
    age_at_offence: Optional[int] = Field(
        None, description="Offender(s) age at time of offence", ge=0, le=150
    )
    employment_status: Optional[
        Literal[
            "employed",
            "self_employed",
            "unemployed",
            "student",
            "retired",
            "other",
            "dont_know",
        ]
    ] = Field(None, description="Employment status at time of offence")

    accommodation_status: Optional[
        Literal["fixed_address", "homeless", "temporary_accommodation", "dont_know"]
    ] = Field(None, description="Accommodation status at time of offence")

    mental_health: Optional[str] = Field(
        None,
        description="Mental health status, e.g., 'had_mental_health_problems', 'learning_difficulties'",
    )
    intoxicated: Optional[
        Literal[
            "yes_drinking", "yes_drugs", "yes_drinking_and_drugs", "no", "dont_know"
        ]
    ] = Field(None, description="Was offender intoxicated at time of offence?")

    victim_relationship: Optional[
        Literal["stranger", "relative", "acquaintance", "dont_know"]
    ] = Field(None, description="Offender-victim relationship")


class VictimInformation(BaseModel):
    """Victim demographic and status information."""

    victim_type: Optional[Literal["individual", "organisation"]] = Field(
        None, description="Type of victim"
    )
    count: Optional[int] = Field(None, description="Number of victims", ge=0)
    gender: Optional[
        Literal["male", "female", "all_male", "all_female", "male_and_female"]
    ] = Field(None, description="Victim(s) gender")
    age_at_offence: Optional[int] = Field(
        None, description="Victim(s) age at time of offence", ge=0, le=150
    )
    employment_status: Optional[
        Literal[
            "employed",
            "self_employed",
            "unemployed",
            "student",
            "retired",
            "other",
            "dont_know",
        ]
    ] = None

    accommodation_status: Optional[
        Literal["fixed_address", "homeless", "temporary_accommodation", "dont_know"]
    ] = None

    mental_health: Optional[str] = None
    intoxicated: Optional[
        Literal[
            "yes_drinking", "yes_drugs", "yes_drinking_and_drugs", "no", "dont_know"
        ]
    ] = None


class OffenceTrialData(BaseModel):
    """Offence, trial, and sentence information (Section 3 of coding scheme)."""

    # Conviction details
    conviction_courts: Optional[List[str]] = Field(
        None, description="Court name(s) where offender convicted/pled guilty"
    )
    conviction_dates: Optional[List[str]] = Field(
        None, description="Conviction/guilty plea date(s) in ISO format"
    )
    convicted_offences: Optional[List[str]] = Field(
        None, description="Offence(s) offender was convicted of"
    )
    acquitted_offences: Optional[List[str]] = Field(
        None, description="Offence(s) offender was acquitted of"
    )

    # Plea information
    plea: Optional[PleaInformation] = None

    # Remand information
    remand_decision: Optional[
        Literal[
            "unconditional_bail", "conditional_bail", "remanded_custody", "dont_know"
        ]
    ] = None
    remand_custody_duration: Optional[str] = Field(
        None, description="Duration of custody remand"
    )

    # Sentencing details
    sentence_court: Optional[str] = Field(
        None, description="Court where offender sentenced"
    )
    sentences: Optional[List[str]] = Field(None, description="Sentence(s) received")
    sentence_serve_type: Optional[
        Literal["all_concurrent", "all_consecutive", "combination", "dont_know"]
    ] = Field(None, description="How multiple sentences are to be served")

    ancillary_orders: Optional[List[str]] = Field(
        None,
        description="Ancillary orders applied (e.g., restraining orders, compensation orders)",
    )

    # Offender and victim information
    offender: Optional[OffenderInformation] = None
    victim: Optional[VictimInformation] = None

    # Evidence presented
    prosecution_evidence: Optional[List[str]] = Field(
        None,
        description="Types of evidence prosecution presented at trial",
        examples=[["CCTV", "victim_testimony", "DNA_match"]],
    )
    defence_evidence: Optional[List[str]] = Field(
        None, description="Types of evidence defence presented at trial"
    )

    # Sentencing factors
    pre_sentence_report: Optional[Literal["low", "medium", "high", "dont_know"]] = (
        Field(None, description="Pre-sentence report risk assessment")
    )
    aggravating_factors: Optional[List[str]] = Field(
        None, description="Aggravating factors mentioned by court"
    )
    mitigating_factors: Optional[List[str]] = Field(
        None, description="Mitigating factors mentioned by court"
    )
    victim_impact_statement: Optional[bool] = Field(
        None, description="Was victim impact statement given at sentencing?"
    )


# Section 4: Appeal Information
class CoDefendantInfo(BaseModel):
    """Co-defendant information."""

    present: Optional[bool] = Field(None, description="Were there co-defendants?")
    count: Optional[int] = Field(None, description="Number of co-defendants", ge=0)


class AppealReasons(BaseModel):
    """Reasons given by appeal court for various decisions."""

    quash_conviction: Optional[List[str]] = Field(
        None, description="Reasons why conviction is unsafe/quashed"
    )
    sentence_excessive: Optional[List[str]] = Field(
        None, description="Reasons why sentence is unduly excessive"
    )
    sentence_lenient: Optional[List[str]] = Field(
        None, description="Reasons why sentence is unduly lenient"
    )
    dismissed: Optional[List[str]] = Field(
        None, description="Reasons why appeal was dismissed/failed"
    )


class AppealData(BaseModel):
    """Appeal information (Section 4 of coding scheme)."""

    appellant: Optional[Literal["offender", "attorney_general", "other"]] = Field(
        None, description="Who is the appellant?"
    )
    co_defendants: Optional[CoDefendantInfo] = None

    appeal_against: Optional[
        Literal[
            "conviction_unsafe",
            "sentence_excessive",
            "sentence_lenient",
            "both_conviction_and_sentence",
            "other",
        ]
    ] = Field(None, description="What is the appeal against?")

    appeal_grounds: Optional[List[str]] = Field(
        None,
        description="Ground(s) for appeal",
        examples=[["trial_judge_summing_up", "evidence_admissibility"]],
    )
    sentencing_guidelines: Optional[List[str]] = Field(
        None, description="Sentencing guidelines/laws/acts mentioned by appeal court"
    )

    appeal_outcome: Optional[
        Literal[
            "dismissed",
            "allowed_conviction_quashed",
            "allowed_sentence_more_excessive",
            "allowed_sentence_more_lenient",
            "mixed_decision",
            "other",
        ]
    ] = Field(None, description="Outcome of appeal")

    reasons: Optional[AppealReasons] = Field(
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
    language: Optional[str] = Field(
        None, description="Language code (ISO 639-1): pl, en, uk"
    )
    country: Optional[str] = Field(None, description="Country name or code")

    court_name: Optional[str] = Field(None, description="Name of the court")
    court_level: Optional[str] = Field(
        None,
        description="Court hierarchy level",
        examples=["Supreme Court", "Court of Appeal", "District Court"],
    )
    decision_date: Optional[date] = Field(None, description="Date of decision")
    publication_date: Optional[date] = Field(None, description="Date of publication")

    # Content
    title: Optional[str] = Field(None, description="Judgment title")
    summary: Optional[str] = Field(None, description="Summary/abstract")
    full_text: str = Field(description="Full text of judgment")

    # Legal details
    judges: Optional[Dict[str, Any]] = Field(
        None, description="Judge information (names, roles)"
    )
    case_type: Optional[str] = Field(
        None,
        description="Type of case",
        examples=["Criminal", "Civil", "Administrative"],
    )
    decision_type: Optional[str] = Field(
        None, description="Type of decision", examples=["Judgment", "Order", "Ruling"]
    )
    outcome: Optional[str] = Field(
        None, description="Case outcome", examples=["Granted", "Dismissed", "Remanded"]
    )

    # Classification
    keywords: Optional[List[str]] = Field(default_factory=list, description="Keywords")
    legal_topics: Optional[List[str]] = Field(
        default_factory=list, description="Legal topics"
    )
    cited_legislation: Optional[List[str]] = Field(
        default_factory=list, description="Cited legislation/acts"
    )

    # Vector embedding
    embedding: Optional[List[float]] = Field(
        None, description="1536-dimensional embedding vector for semantic search"
    )

    # Coding scheme data (flexible JSONB fields)
    court_hearing_data: Optional[CourtHearingData] = Field(
        None, description="Court hearing details (Section 2)"
    )
    offence_trial_data: Optional[OffenceTrialData] = Field(
        None, description="Offence/trial/sentence details (Section 3)"
    )
    appeal_data: Optional[AppealData] = Field(
        None, description="Appeal information (Section 4)"
    )

    # Flexible metadata
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict, description="Additional metadata"
    )

    # Source information
    source_dataset: Optional[str] = Field(None, description="Source dataset name")
    source_id: Optional[str] = Field(None, description="Original source ID")
    source_url: Optional[str] = Field(None, description="URL to original judgment")

    # Timestamps
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")

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
    language: Optional[str] = None
    country: Optional[str] = None
    court_name: Optional[str] = None
    court_level: Optional[str] = None
    decision_date: Optional[date] = None
    publication_date: Optional[date] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    full_text: str
    judges: Optional[Dict[str, Any]] = None
    case_type: Optional[str] = None
    decision_type: Optional[str] = None
    outcome: Optional[str] = None
    keywords: Optional[List[str]] = None
    legal_topics: Optional[List[str]] = None
    cited_legislation: Optional[List[str]] = None
    court_hearing_data: Optional[CourtHearingData] = None
    offence_trial_data: Optional[OffenceTrialData] = None
    appeal_data: Optional[AppealData] = None
    metadata: Optional[Dict[str, Any]] = None
    source_dataset: Optional[str] = None
    source_id: Optional[str] = None
    source_url: Optional[str] = None


class JudgmentUpdateRequest(BaseModel):
    """Request model for updating an existing judgment."""

    case_number: Optional[str] = None
    language: Optional[str] = None
    country: Optional[str] = None
    court_name: Optional[str] = None
    court_level: Optional[str] = None
    decision_date: Optional[date] = None
    publication_date: Optional[date] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    full_text: Optional[str] = None
    judges: Optional[Dict[str, Any]] = None
    case_type: Optional[str] = None
    decision_type: Optional[str] = None
    outcome: Optional[str] = None
    keywords: Optional[List[str]] = None
    legal_topics: Optional[List[str]] = None
    cited_legislation: Optional[List[str]] = None
    court_hearing_data: Optional[CourtHearingData] = None
    offence_trial_data: Optional[OffenceTrialData] = None
    appeal_data: Optional[AppealData] = None
    metadata: Optional[Dict[str, Any]] = None
    source_url: Optional[str] = None


class JudgmentResponse(Judgment):
    """Response model for judgment API endpoints."""

    pass


class JudgmentListResponse(BaseModel):
    """Response model for listing judgments."""

    judgments: List[Judgment]
    total: int
    offset: int
    limit: int
    has_more: bool


# =============================================================================
# SEARCH RESULT MODELS
# =============================================================================


class HybridSearchResult(Judgment):
    """Search result with scoring information."""

    vector_score: Optional[float] = Field(
        None, description="Vector similarity score (0-1)"
    )
    text_score: Optional[float] = Field(None, description="Full-text search score")
    combined_score: Optional[float] = Field(None, description="Combined hybrid score")


class HybridSearchResponse(BaseModel):
    """Response model for hybrid search results."""

    results: List[HybridSearchResult]
    total: int
    query_time_ms: float
    search_params: Dict[str, Any] = Field(
        description="Parameters used for search (for debugging)"
    )
