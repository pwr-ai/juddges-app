"""
Strawberry GraphQL type definitions for the AI-Tax legal research platform.

These types mirror the Pydantic models in app.models and ai_tax_search.models,
converted to Strawberry's type system for GraphQL schema generation.
"""

import enum
from datetime import datetime
from typing import Optional

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
    name: Optional[str] = None
    jurisdiction: Optional[str] = None
    type: Optional[str] = None


@strawberry.type
class LegalReferenceType:
    ref_type: Optional[str] = None
    text: Optional[str] = None
    normalized_citation: Optional[str] = None


@strawberry.type
class LegalConceptType:
    concept_name: Optional[str] = None
    concept_type: Optional[str] = None


# ===== Core Document Types =====


@strawberry.type
class LegalDocumentType:
    """Full legal document with comprehensive metadata."""

    document_id: str
    document_type: str
    title: Optional[str] = None
    date_issued: Optional[datetime] = None
    issuing_body: Optional[IssuingBodyType] = None
    language: Optional[str] = None
    victims_count: Optional[int] = None
    offenders_count: Optional[int] = None
    case_type: str = "criminal"
    document_number: Optional[str] = None
    country: Optional[str] = None
    summary: Optional[str] = None
    keywords: Optional[list[str]] = None
    thesis: Optional[str] = None
    court_name: Optional[str] = None
    department_name: Optional[str] = None
    presiding_judge: Optional[str] = None
    judges: Optional[list[str]] = None
    legal_bases: Optional[list[str]] = None
    parties: Optional[str] = None
    outcome: Optional[str] = None
    source_url: Optional[str] = None
    publication_date: Optional[datetime] = None
    ingestion_date: Optional[datetime] = None
    # full_text excluded by default to avoid large payloads — available via dedicated field


@strawberry.type
class LegalDocumentMetadataType:
    """Lightweight document metadata for search results."""

    uuid: str
    document_id: str
    document_type: str
    language: Optional[str] = None
    victims_count: Optional[int] = None
    offenders_count: Optional[int] = None
    case_type: str = "criminal"
    keywords: Optional[list[str]] = None
    date_issued: Optional[datetime] = None
    score: Optional[float] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    court_name: Optional[str] = None
    document_number: Optional[str] = None
    thesis: Optional[str] = None


@strawberry.type
class DocumentChunkType:
    """A chunk or segment of a legal document."""

    document_id: str
    document_type: Optional[str] = None
    language: Optional[str] = None
    chunk_id: int
    chunk_text: str
    segment_type: Optional[str] = None
    position: Optional[int] = None
    confidence_score: Optional[float] = None
    cited_references: Optional[list[str]] = None
    tags: Optional[list[str]] = None


# ===== Search Response Types =====


@strawberry.type
class PaginationMetadataType:
    offset: int
    limit: int
    loaded_count: int
    estimated_total: Optional[int] = None
    has_more: bool = False
    next_offset: Optional[int] = None


@strawberry.type
class SearchDocumentsResultType:
    """Result of a document metadata search."""

    documents: list[LegalDocumentMetadataType]
    total_count: int
    is_capped: bool
    query_time_ms: Optional[float] = None


@strawberry.type
class SearchChunksResultType:
    """Result of a chunk-based search."""

    chunks: list[DocumentChunkType]
    documents: Optional[list[LegalDocumentType]] = None
    total_chunks: int
    unique_documents: int
    query_time_ms: Optional[float] = None
    pagination: Optional[PaginationMetadataType] = None


@strawberry.type
class SimilarDocumentResultType:
    document_id: str
    db_id: str
    similarity_score: float
    title: Optional[str] = None
    document_type: Optional[str] = None
    date_issued: Optional[str] = None
    document_number: Optional[str] = None
    country: Optional[str] = None
    language: Optional[str] = None


@strawberry.type
class SimilarDocumentsResultType:
    query_document_id: str
    similar_documents: list[SimilarDocumentResultType]
    total_found: int


# ===== Extraction Types =====


@strawberry.type
class ExtractionJobType:
    job_id: str
    collection_id: Optional[str] = None
    status: str
    created_at: str
    updated_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    total_documents: Optional[int] = None
    completed_documents: Optional[int] = None
    elapsed_time_seconds: Optional[int] = None
    estimated_time_remaining_seconds: Optional[int] = None


@strawberry.type
class ExtractionResultType:
    collection_id: str
    document_id: str
    status: str
    created_at: str
    updated_at: str
    extracted_data: Optional[strawberry.scalars.JSON] = None
    error_message: Optional[str] = None


# ===== Subscription Event Types =====


@strawberry.type
class ExtractionProgressEvent:
    """Real-time event for extraction job progress updates."""

    job_id: str
    status: str
    completed_documents: int
    total_documents: int
    progress_percent: float
    current_document_id: Optional[str] = None
    error_message: Optional[str] = None


@strawberry.type
class DocumentIndexedEvent:
    """Real-time event when a new document is indexed."""

    document_id: str
    document_type: str
    title: Optional[str] = None
    indexed_at: str


@strawberry.type
class SearchNotificationEvent:
    """Real-time notification for saved search matches."""

    search_query: str
    new_matches_count: int
    sample_document_ids: list[str]
    notified_at: str
