"""
Strawberry GraphQL type definitions for the Juddges legal research platform.

These types mirror the Pydantic models in app.models and juddges_search.models,
converted to Strawberry's type system for GraphQL schema generation.
"""

import enum
from datetime import datetime

import strawberry

# ===== Enums =====


@strawberry.enum
class DocumentTypeEnum(enum.Enum):
    JUDGMENT = "judgment"
    TAX_INTERPRETATION = "tax_interpretation"


@strawberry.enum
class DocumentProcessingStatusEnum(enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIALLY_COMPLETED = "partially_completed"


# ===== Embedded Types =====


@strawberry.type
class IssuingBodyType:
    name: str | None = None
    jurisdiction: str | None = None
    type: str | None = None


@strawberry.type
class LegalReferenceType:
    ref_type: str | None = None
    text: str | None = None
    normalized_citation: str | None = None


@strawberry.type
class LegalConceptType:
    concept_name: str | None = None
    concept_type: str | None = None


# ===== Core Document Types =====


@strawberry.type
class LegalDocumentType:
    """Full legal document with comprehensive metadata."""

    document_id: str
    document_type: str
    title: str | None = None
    date_issued: datetime | None = None
    issuing_body: IssuingBodyType | None = None
    language: str | None = None
    victims_count: int | None = None
    offenders_count: int | None = None
    case_type: str = "criminal"
    document_number: str | None = None
    country: str | None = None
    summary: str | None = None
    keywords: list[str] | None = None
    thesis: str | None = None
    court_name: str | None = None
    department_name: str | None = None
    presiding_judge: str | None = None
    judges: list[str] | None = None
    legal_bases: list[str] | None = None
    parties: str | None = None
    outcome: str | None = None
    source_url: str | None = None
    publication_date: datetime | None = None
    ingestion_date: datetime | None = None
    # full_text excluded by default to avoid large payloads — available via dedicated field


@strawberry.type
class LegalDocumentMetadataType:
    """Lightweight document metadata for search results."""

    uuid: str
    document_id: str
    document_type: str
    language: str | None = None
    victims_count: int | None = None
    offenders_count: int | None = None
    case_type: str = "criminal"
    keywords: list[str] | None = None
    date_issued: datetime | None = None
    score: float | None = None
    title: str | None = None
    summary: str | None = None
    court_name: str | None = None
    document_number: str | None = None
    thesis: str | None = None


@strawberry.type
class DocumentChunkType:
    """A chunk or segment of a legal document."""

    document_id: str
    document_type: str | None = None
    language: str | None = None
    chunk_id: int
    chunk_text: str
    segment_type: str | None = None
    position: int | None = None
    confidence_score: float | None = None
    cited_references: list[str] | None = None
    tags: list[str] | None = None


# ===== Search Response Types =====


@strawberry.type
class PaginationMetadataType:
    offset: int
    limit: int
    loaded_count: int
    estimated_total: int | None = None
    has_more: bool = False
    next_offset: int | None = None


@strawberry.type
class SearchDocumentsResultType:
    """Result of a document metadata search."""

    documents: list[LegalDocumentMetadataType]
    total_count: int
    is_capped: bool
    query_time_ms: float | None = None


@strawberry.type
class SearchChunksResultType:
    """Result of a chunk-based search."""

    chunks: list[DocumentChunkType]
    documents: list[LegalDocumentType] | None = None
    total_chunks: int
    unique_documents: int
    query_time_ms: float | None = None
    pagination: PaginationMetadataType | None = None


@strawberry.type
class SimilarDocumentResultType:
    document_id: str
    db_id: str
    similarity_score: float
    title: str | None = None
    document_type: str | None = None
    date_issued: str | None = None
    document_number: str | None = None
    country: str | None = None
    language: str | None = None


@strawberry.type
class SimilarDocumentsResultType:
    query_document_id: str
    similar_documents: list[SimilarDocumentResultType]
    total_found: int


# ===== Extraction Types =====


@strawberry.type
class ExtractionJobType:
    job_id: str
    collection_id: str | None = None
    status: str
    created_at: str
    updated_at: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    total_documents: int | None = None
    completed_documents: int | None = None
    elapsed_time_seconds: int | None = None
    estimated_time_remaining_seconds: int | None = None


@strawberry.type
class ExtractionResultType:
    collection_id: str
    document_id: str
    status: str
    created_at: str
    updated_at: str
    extracted_data: strawberry.scalars.JSON | None = None
    error_message: str | None = None


# ===== Subscription Event Types =====


@strawberry.type
class ExtractionProgressEvent:
    """Real-time event for extraction job progress updates."""

    job_id: str
    status: str
    completed_documents: int
    total_documents: int
    progress_percent: float
    current_document_id: str | None = None
    error_message: str | None = None


@strawberry.type
class DocumentIndexedEvent:
    """Real-time event when a new document is indexed."""

    document_id: str
    document_type: str
    title: str | None = None
    indexed_at: str


@strawberry.type
class SearchNotificationEvent:
    """Real-time notification for saved search matches."""

    search_query: str
    new_matches_count: int
    sample_document_ids: list[str]
    notified_at: str
