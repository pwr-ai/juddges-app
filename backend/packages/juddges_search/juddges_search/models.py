from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DocumentType(str, Enum):
    """Enumeration of supported legal document types.

    Search is judgment-only as of 2026-05-09; the enum is retained as a
    one-value placeholder so existing imports keep compiling. See
    ``docs/superpowers/specs/2026-05-09-search-judgment-only-blazing-fast.md``
    for the migration that collapsed the enum.
    """

    JUDGMENT = "judgment"


class SegmentType(str, Enum):
    """Enumeration of supported document segment types."""

    PARAGRAPH = "paragraph"
    SECTION = "section"
    HEADING = "heading"
    FOOTNOTE = "footnote"
    CITATION = "citation"


class IssuingBody(BaseModel):
    """Model for issuing body metadata."""

    name: str | None = Field(None, description="Name of the issuing body")
    jurisdiction: str | None = Field(None, description="Jurisdiction of the issuing body")
    type: str | None = Field(None, description="Type of the issuing body")


class LegalReference(BaseModel):
    """Model for legal reference metadata."""

    ref_type: str | None = Field(None, description="Type of legal reference")
    text: str | None = Field(None, description="Text of the reference")
    normalized_citation: str | None = Field(None, description="Normalized citation format")


class LegalConcept(BaseModel):
    """Model for legal concept metadata."""

    concept_name: str | None = Field(None, description="Name of the legal concept")
    concept_type: str | None = Field(None, description="Type of the legal concept")


class DocumentMetadata(BaseModel):
    """Model for document metadata (e.g., scores, additional properties)."""

    score: float | None = Field(None, description="Relevance or similarity score")


class LegalDocumentMetadata(BaseModel):
    """Lightweight model with only required fields for document listing/search results.

    This model reduces response payload size by including only essential fields
    needed for document identification and basic metadata display.
    """

    uuid: str = Field(..., description="UUID of the document")
    document_id: str = Field(..., description="Document identifier (e.g., case number, statute reference)")
    document_type: DocumentType = Field(..., description="Type of legal document")
    language: str | None = Field(None, description="ISO 639-1 language code")
    victims_count: int | None = Field(None, description="Number of victims involved")
    offenders_count: int | None = Field(None, description="Number of offenders involved")
    case_type: str = Field(default="criminal", description="Type of case (e.g., criminal, civil)")
    keywords: list[str] = Field(default_factory=list, description="Keywords or tags")
    date_issued: datetime | None = Field(None, description="Date when the document was issued")
    score: float | None = Field(None, description="Relevance or similarity score from the search")

    # Extended fields for DocumentCard display
    title: str | None = Field(None, description="Title or name of the document")
    summary: str | None = Field(None, description="Brief summary or abstract")
    court_name: str | None = Field(None, description="Name of the court")
    document_number: str | None = Field(None, description="Official document number or reference")
    thesis: str | None = Field(None, description="Thesis or main argument of the document")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "uuid": "550e8400-e29b-41d4-a716-446655440000",
                "document_id": "II FSK 1234/21",
                "document_type": "judgment",
                "language": "en",
                "keywords": ["contract law", "damages"],
                "date_issued": "2024-03-15T00:00:00Z",
                "score": 0.85,
                "title": "Smith v. Jones",
                "summary": "A case about contract law and damages",
                "court_name": "Supreme Court",
                "document_number": "1234/21",
                "thesis": "Main argument of the case",
            }
        }
    )


class LegalDocument(BaseModel):
    """Model representing a legal document with comprehensive metadata."""

    document_id: str = Field(..., description="Unique identifier for the document")
    document_type: DocumentType = Field(..., description="Type of legal document")
    title: str | None = Field(None, description="Title or name of the document")
    date_issued: datetime | None = Field(None, description="Date when the document was issued")
    issuing_body: IssuingBody | None = Field(None, description="Authority or body that issued the document")
    language: str | None = Field(None, description="ISO 639-1 language code")
    victims_count: int | None = Field(None, description="Number of victims involved")
    offenders_count: int | None = Field(None, description="Number of offenders involved")
    case_type: str = Field(default="criminal", description="Type of case (e.g., criminal, civil)")
    document_number: str | None = Field(None, description="Official document number or reference")
    country: str = Field(..., description="ISO 3166-1 alpha-2/3 country code")
    full_text: str = Field(..., description="Complete text of the document")
    summary: str | None = Field(None, description="Brief summary or abstract")
    legal_references: list[LegalReference] | None = Field(
        default_factory=list, description="References to other legal documents"
    )
    legal_concepts: list[LegalConcept] | None = Field(default_factory=list, description="Key legal concepts discussed")
    keywords: list[str] | None = Field(default_factory=list, description="Keywords or tags")
    metadata: dict[str, Any] | None = Field(default_factory=dict, description="Additional metadata")
    vectors: dict[str, Any] | None = Field(default_factory=dict, description="Documents vectors")
    x: float | None = Field(None, description="X coordinate for visualization (e.g., UMAP)")
    y: float | None = Field(None, description="Y coordinate for visualization (e.g., UMAP)")

    # Additional fields used in search operations
    thesis: str | None = Field(None, description="Thesis or main argument of the document")
    ingestion_date: datetime | None = Field(None, description="Date when document was ingested")
    last_updated: datetime | None = Field(None, description="Date when document was last updated")
    processing_status: str | None = Field(None, description="Processing status of the document")
    source_url: str | None = Field(None, description="Source URL of the document")
    parties: str | None = Field(None, description="Parties involved in the case")
    outcome: str | None = Field(None, description="Outcome or decision of the case")
    publication_date: datetime | None = Field(None, description="Date when document was published")
    raw_content: str | None = Field(None, description="Raw content of the document")
    presiding_judge: str | None = Field(None, description="Name of the presiding judge")
    judges: list[str] | None = Field(default_factory=list, description="List of judges")
    legal_bases: list[str] | None = Field(default_factory=list, description="Legal bases referenced")
    court_name: str | None = Field(None, description="Name of the court")
    department_name: str | None = Field(None, description="Name of the department")
    extracted_legal_bases: str | None = Field(None, description="Extracted legal bases from the document")
    references: list[str] | None = Field(default_factory=list, description="References to other documents")
    base_fields: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Extracted base-schema columns (base_appellant, base_appeal_outcome, "
            "base_num_victims, …). Populated only when include_base_fields=true is "
            "requested; otherwise None to keep search/list responses lean."
        ),
    )
    extraction_fields: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Structural-segmentation (structure_*_summary, structure_confidence, …) "
            "and deep-analysis (deep_complexity_score, deep_reasoning_quality_score, "
            "deep_legal_domains, deep_precedential_value, …) typed extraction "
            "columns. Raw JSONB blobs are excluded. Populated only when "
            "include_base_fields=true is requested; otherwise None."
        ),
    )

    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "document_id": "2024-SC-123",
                "document_type": "judgment",
                "title": "Smith v. Jones",
                "date_issued": "2024-03-15T00:00:00Z",
                "issuing_body": {"name": "Supreme Court", "jurisdiction": "Federal", "type": "court"},
                "language": "en",
                "country": "USA",
                "document_number": "123/2024",
                "keywords": ["contract law", "damages"],
            }
        },
    )


class DocumentChunk(BaseModel):
    """Model representing a chunk or segment of a legal document with semantic structure."""

    document_id: str = Field(..., description="ID of the parent document")
    document_type: str | None = Field(None, description="Type of the parent document")
    language: str | None = Field(None, description="Language of the document chunk")
    chunk_id: int = Field(..., description="Unique identifier for the chunk within the document")
    chunk_text: str = Field(..., description="Text content of the chunk")
    segment_type: SegmentType | None = Field(None, description="Type of segment")
    position: int | None = Field(None, ge=0, description="Position/order of the chunk in the document")
    confidence_score: float | None = Field(default=None, description="Confidence score for the chunk extraction")
    cited_references: list[str] | None = Field(default_factory=list, description="References cited in this chunk")
    tags: list[str] | None = Field(default_factory=list, description="Tags or labels for the chunk")
    parent_segment_id: str | None = Field(None, description="ID of the parent segment if hierarchical")

    # Enhanced metadata fields for search results
    chunk_type: str | None = Field(default="summary", description="Type of chunk content (summary, excerpt, full_text)")
    chunk_start_pos: int | None = Field(default=0, description="Start position of chunk in source document")
    chunk_end_pos: int | None = Field(default=0, description="End position of chunk in source document")
    metadata: dict[str, Any] | None = Field(
        default_factory=dict, description="Additional metadata (court info, scores, etc.)"
    )

    # Search scoring fields
    similarity: float | None = Field(default=None, description="Overall similarity/relevance score")
    vector_score: float | None = Field(default=None, description="Vector similarity score component")
    text_score: float | None = Field(default=None, description="Text search score component")
    combined_score: float | None = Field(default=None, description="Combined hybrid search score")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "document_id": "2024-SC-123",
                "chunk_id": 1,
                "chunk_text": "The court finds that...",
                "segment_type": "paragraph",
                "position": 1,
                "confidence_score": 0.95,
                "tags": ["finding", "reasoning"],
            }
        }
    )


test = {
    "y": None,
    "start_char_index": None,
    "tags": None,
    "parent_segment_id": None,
    "document_id": "7a31aa7c649ae8135f2591944adcb8cca58ef395b9c503739d773efbe1fc62dc",
    "section_heading": None,
    "segment_type": None,
    "entities": None,
    "chunk_id": 8,
    "x": None,
    "chunk_text": "16.\nHis wife, the second appellant, was allegedly implicated in the concealment, movement and laundering of these funds. She too had massive and unexplained wealth. It was believed these funds and assets, discovered in both of their names in Kuwait and Switzerland, may have derived from their criminal conduct.\n17.\nBetween 2011 and December 2014 the appellants fought a protracted, but ultimately unsuccessful legal battle in Switzerland against attempts made by the Kuwaiti authorities to restrain their assets in that jurisdiction, and to obtain orders for relevant disclosure. The appellants lost their final appeal to the Swiss Supreme Court on 8 December 2014.\n18.\nIn its judgment of that date, the Swiss Supreme Court said this:\n“A. By final ruling of February 28, the Office of the Public Prosecutor of the Confederation (MPC) ordered the submission to the Public Prosecutor of the State of Kuwait of banking documents regarding nine accounts with Banque K.____ SA, and six accounts with L.____ SA. This submission is in execution of a request for mutual legal assistance submitted as part of an investigation of F.____ for embezzlements committed against the State pension institution [institution de proveyance], of which he was director general. The amounts embezzled are reportedly US$ 390 million. At the same time, the MPC maintained the freeze on the funds that it had ordered previously.",
    "document_type": "judgment",
    "position": None,
    "cited_references": None,
    "end_char_index": None,
    "confidence_score": None,
}
