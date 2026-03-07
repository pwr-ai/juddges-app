import re
import uuid
from enum import Enum
from typing import Any, ClassVar, Literal

from juddges_search.chains.models import QuestionDict
from juddges_search.info_extraction.extractor import InformationExtractor
from juddges_search.models import DocumentChunk, LegalDocument, LegalDocumentMetadata
from juddges_search.retrieval.config import (
    MAX_CHUNKS_PER_FETCH_REQUEST,
    MAX_INVALID_UUIDS_TO_SHOW,
    OPTIMIZED_CHUNK_ALPHA,
    OPTIMIZED_CHUNK_DOCS_LIMIT,
    OPTIMIZED_CHUNK_FETCH_LIMIT,
)
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from werkzeug.utils import secure_filename

from app.config import settings

# ===== Pagination Models =====


class PaginationMetadata(BaseModel):
    """Pagination metadata for progressive loading search results."""

    offset: int = Field(description="Current offset (0-indexed)")
    limit: int = Field(description="Number of results per page")
    loaded_count: int = Field(description="Total results loaded so far")
    estimated_total: int | None = Field(
        default=None,
        description="Estimated total matching documents (filter-based, approximate)",
    )
    has_more: bool = Field(
        default=False,
        description="True if more results are available beyond current page",
    )
    next_offset: int | None = Field(
        default=None,
        description="Offset for next page, or None if no more results",
    )


def validate_id_format(value: str, field_name: str) -> str:
    """
    Validate ID format to prevent injection attacks.

    Args:
        value: The ID value to validate
        field_name: Name of the field being validated (for error messages)

    Returns:
        The validated ID

    Raises:
        ValueError: If ID format is invalid
    """
    if not value or not value.strip():
        raise ValueError(f"{field_name} cannot be empty")

    # Allow alphanumeric, hyphens, underscores, and dots (common UUID and identifier formats)
    # Restrict length to reasonable bounds
    if not re.match(r"^[a-zA-Z0-9_\-\.]+$", value):
        raise ValueError(
            f"{field_name} contains invalid characters. Only alphanumeric, hyphens, underscores, and dots are allowed"
        )

    if len(value) > 255:
        raise ValueError(f"{field_name} exceeds maximum length of 255 characters")

    return value


class DocumentRetrievalRequest(BaseModel):
    """Request for simplified document search (legacy endpoint - no pagination or filtering)."""

    question: str = Field(
        description="Question text",
        examples=["jakie wagi narkotykow uwazane sa za znaczne"],
    )
    mode: Literal["rabbit", "thinking"] = Field(
        description="Retrieval mode", default="rabbit"
    )
    max_documents: int | None = Field(
        description="Deprecated: Not used in simplified endpoint",
        default=None,
    )
    max_threshold: int | None = Field(
        description="Deprecated: Not used in simplified endpoint",
        default=None,
        ge=10,
        le=1000,
    )


class DocumentRetrievalResponse(BaseModel):
    question: str | QuestionDict = Field(
        description="Question text or structured question input"
    )
    question_rewritten: str | QuestionDict | None = Field(
        default=None,
        description="Rewritten/enhanced question text or structured question input",
    )
    chunks: list[DocumentChunk] = Field(description="Retrieved document chunks")
    documents: list[LegalDocument] = Field(
        description="Source documents for the chunks"
    )
    pagination: dict = Field(
        default=None,
        description="Pagination metadata",
        examples=[{"page": 1, "page_size": 20, "total_results": 100, "total_pages": 5}],
    )


class DocumentProcessingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIALLY_COMPLETED = "partially_completed"


class DocumentExtractionSubmissionResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True
    )  # Allows both task_id and job_id to work

    task_id: str = Field(
        ...,
        description="Job ID (also known as task_id for backward compatibility)",
        alias="job_id",
    )
    status: Literal["accepted", "rejected"]
    message: str | None = None


class SimpleExtractionRequest(BaseModel):
    collection_id: str = Field(
        min_length=1,
        max_length=255,
        description="Collection ID (alphanumeric, hyphens, underscores, dots only)",
    )
    schema_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="Schema ID (alphanumeric, hyphens, underscores, dots only)",
    )
    document_ids: list[str] | None = Field(
        default=None, description="List of document IDs to extract"
    )
    extraction_context: str = Field(
        description="Context of the extraction, e.g. 'The task is to extract information from court judgments related drug abuse'"
    )
    additional_instructions: str | None = Field(
        default=None,
        description="Additional qualitative instructions for the extraction",
    )
    language: str = Field(
        default="pl", description="Language for extraction (e.g., 'pl', 'en')"
    )

    @field_validator("collection_id")
    @classmethod
    def validate_collection_id(cls, v: str) -> str:
        return validate_id_format(v, "collection_id")

    @field_validator("schema_id")
    @classmethod
    def validate_schema_id_format(cls, v: str | None) -> str | None:
        if v is not None:
            return validate_id_format(v, "schema_id")
        return v

    @field_validator("document_ids")
    @classmethod
    def validate_document_ids(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            return [validate_id_format(doc_id, "document_id") for doc_id in v]
        return v


class BulkExtractionRequest(BaseModel):
    """Request for applying multiple schemas to documents simultaneously."""

    collection_id: str = Field(
        min_length=1,
        max_length=255,
        description="Collection ID (alphanumeric, hyphens, underscores, dots only)",
    )
    schema_ids: list[str] = Field(
        min_length=1,
        max_length=10,
        description="List of schema IDs to apply (max 10)",
    )
    document_ids: list[str] | None = Field(
        default=None,
        description="List of document IDs to extract (optional, uses all collection docs if not provided)",
    )
    extraction_context: str = Field(
        default="Extract structured information from legal documents using the provided schema.",
        description="Context for the extraction",
    )
    language: str = Field(
        default="pl", description="Language for extraction (e.g., 'pl', 'en')"
    )
    auto_export: bool = Field(
        default=False,
        description="Automatically export results when all jobs complete",
    )
    scheduled_at: str | None = Field(
        default=None,
        description="ISO 8601 timestamp to schedule the extraction (optional, runs immediately if not set)",
    )

    @field_validator("collection_id")
    @classmethod
    def validate_collection_id(cls, v: str) -> str:
        return validate_id_format(v, "collection_id")

    @field_validator("schema_ids")
    @classmethod
    def validate_schema_ids(cls, v: list[str]) -> list[str]:
        if len(v) > 10:
            raise ValueError("Maximum 10 schemas allowed per bulk extraction request")
        return v

    @field_validator("document_ids")
    @classmethod
    def validate_document_ids(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            return [validate_id_format(doc_id, "document_id") for doc_id in v]
        return v


class BulkExtractionJobInfo(BaseModel):
    """Info about a single job within a bulk extraction."""

    job_id: str
    schema_id: str
    schema_name: str | None = None
    status: str


class BulkExtractionResponse(BaseModel):
    """Response for bulk extraction submission."""

    bulk_id: str = Field(description="Unique ID for this bulk extraction operation")
    status: Literal["accepted", "scheduled", "rejected"]
    jobs: list[BulkExtractionJobInfo] = Field(
        description="Individual extraction jobs created"
    )
    total_schemas: int
    total_documents: int
    auto_export: bool = False
    scheduled_at: str | None = None
    message: str | None = None


class DocumentExtractionRequest(SimpleExtractionRequest):
    SCHEMA_REQUIRED_FIELDS: ClassVar[list[str]] = [
        "type",
        "description",
        "required",
    ]

    user_schema: dict[str, Any] | None = Field(
        None, description="Schema to use for extraction"
    )
    prompt_id: str = Field(description="ID of the prompt to use for extraction")
    llm_name: Literal[
        "gpt-5-nano",
        "gpt-5-mini",
        "gpt-5",
    ] = Field(
        "gpt-5-mini",
        description="Name of the LLM to use for extraction",
    )
    language: Literal["pl"] = Field(  # en language temporaly disabled
        "pl",
        description="Language of the extraction",
    )
    llm_kwargs: dict[str, Any] = Field(
        default_factory=dict,
        description="Keyword arguments to pass to the LLM (to disable thinking in gemini pass llm_kwargs): {'extra_body': {'thinking': {'budget_tokens': 0}}})",
    )

    @field_validator("schema_id")
    @classmethod
    def validate_schema_id(cls, schema_id: str | None):
        if schema_id is not None:
            schema_id = secure_filename(schema_id)
        return schema_id

    @field_validator("prompt_id")
    @classmethod
    def validate_prompt_id(cls, prompt_id: str):
        return secure_filename(prompt_id)

    @field_validator("user_schema")
    @classmethod
    def validate_schema(cls, user_schema: dict[str, Any] | None):
        if user_schema is not None:
            InformationExtractor.prepare_oai_compatible_schema(user_schema)
        return user_schema

    @model_validator(mode="after")
    def validate_consitency_of_schema_with_schema_id(
        self,
    ) -> "DocumentExtractionRequest":
        if self.schema_id and self.user_schema:
            raise ValueError("Only one of schema_id or schema can be provided")
        if not self.schema_id and not self.user_schema:
            raise ValueError("Either schema_id or schema must be provided")
        return self


# ===== Base Schema Extraction Models =====


class BaseSchemaExtractionRequest(BaseModel):
    """Request for extracting data using the universal base legal schema."""

    document_ids: list[str] = Field(
        description="List of document IDs to extract from",
        min_length=1,
    )
    jurisdiction_override: Literal["en_uk", "en_us", "pl"] | None = Field(
        default=None,
        description="Override automatic jurisdiction detection",
    )
    additional_instructions: str | None = Field(
        default=None,
        description="Additional extraction instructions",
    )
    llm_name: Literal["gpt-4o-mini", "gpt-4o", "gpt-4"] = Field(
        default="gpt-4o-mini",
        description="LLM model to use for extraction",
    )


class BaseSchemaExtractionResult(BaseModel):
    """Result of base schema extraction for a single document."""

    document_id: str
    jurisdiction: str
    status: str  # completed, failed
    extracted_data: dict[str, Any] | None = None
    validation_errors: list[str] | None = None
    error_message: str | None = None


class BaseSchemaExtractionResponse(BaseModel):
    """Response for base schema extraction."""

    results: list[BaseSchemaExtractionResult]
    total_documents: int
    successful_extractions: int
    failed_extractions: int


class ExtractedDataFilterRequest(BaseModel):
    """Request for filtering documents by extracted_data fields."""

    filters: dict[str, Any] = Field(
        default_factory=dict,
        description="Filter criteria as field -> value or field -> [values] mapping",
    )
    text_query: str | None = Field(
        default=None,
        description="Full-text search query across text fields",
    )
    limit: int = Field(
        default=50,
        ge=1,
        le=200,
        description="Maximum number of results",
    )
    offset: int = Field(
        default=0,
        ge=0,
        description="Pagination offset",
    )


class FacetCount(BaseModel):
    """Count for a single facet value."""

    value: str
    count: int


class FacetCountsResponse(BaseModel):
    """Response for facet counts query."""

    field: str
    counts: list[FacetCount]
    total: int


class FilterFieldConfig(BaseModel):
    """Configuration for a filter field."""

    field: str
    type: str  # string, number, boolean, array
    filter_type: str  # facet, text_search, range, array_contains
    label: str
    order: int
    description: str
    enum_values: list[str] | None = None


class FilterOptionsResponse(BaseModel):
    """Response for filter options query."""

    fields: list[FilterFieldConfig]


class BaseSchemaDefinitionResponse(BaseModel):
    """Response containing localized base schema definitions for UI display."""

    schema_key: str
    default_locale: Literal["en", "pl"] = "en"
    available_locales: list[Literal["en", "pl"]]
    schemas: dict[str, dict[str, Any]]


class DocumentExtractionResponse(BaseModel):
    collection_id: str
    document_id: str
    status: DocumentProcessingStatus
    created_at: str
    updated_at: str
    started_at: str | None = None
    completed_at: str | None = None
    error_message: str | None = None
    extracted_data: dict | None = None


class BatchExtractionResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True
    )  # Allows both task_id and job_id to work

    task_id: str = Field(
        ...,
        description="Job ID (also known as task_id for backward compatibility)",
        alias="job_id",
    )
    status: str
    results: list[DocumentExtractionResponse] | None = None


class SimilarDocumentsRequest(BaseModel):
    document_ids: list[str] = Field(
        description="One or more document IDs to find similar documents for",
        min_length=1,
    )
    top_k: int = Field(
        default=10,
        description="Maximum number of similar documents to return per input document",
        ge=1,
        le=100,
    )

    @field_validator("document_ids")
    @classmethod
    def validate_document_ids(cls, v: list[str]) -> list[str]:
        return [validate_id_format(doc_id, "document_id") for doc_id in v]


class SimilarDocumentResult(BaseModel):
    document_id: str = Field(description="Document ID (reference ID)")
    db_id: str = Field(description="Internal database UUID")
    similarity_score: float = Field(
        description="Similarity score (0.0 to 1.0, higher is more similar)"
    )
    title: str | None = Field(default=None, description="Document title")
    document_type: str | None = Field(default=None, description="Type of document")
    date_issued: str | None = Field(
        default=None, description="Date when document was issued"
    )
    publication_date: str | None = Field(
        default=None, description="Date when document was published"
    )
    document_number: str | None = Field(default=None, description="Document number")
    country: str | None = Field(default=None, description="Country code")
    language: str | None = Field(default=None, description="Language code")


class SimilarDocumentsResponse(BaseModel):
    query_document_id: str = Field(description="The document ID that was queried")
    similar_documents: list[SimilarDocumentResult] = Field(
        description="List of similar documents"
    )
    total_found: int = Field(description="Total number of similar documents found")


# ===== Prompt Management Models =====


class CreatePromptRequest(BaseModel):
    prompt_id: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"^[a-zA-Z0-9_-]+$",
        description="Unique ID for the prompt (alphanumeric, hyphens, underscores only)",
    )
    description: str = Field(
        min_length=1,
        max_length=500,
        description="Human-readable description of the prompt",
    )
    template: str = Field(
        min_length=10, description="Jinja2 template content for the prompt"
    )
    variables: list[str] = Field(
        default_factory=list, description="Expected variables in the template"
    )


class UpdatePromptRequest(BaseModel):
    description: str | None = Field(
        None, min_length=1, max_length=500, description="Updated description"
    )
    template: str | None = Field(
        None, min_length=10, description="Updated Jinja2 template content"
    )
    variables: list[str] | None = Field(
        None, description="Updated list of expected variables"
    )


class PromptMetadata(BaseModel):
    prompt_id: str
    description: str
    variables: list[str]
    created_at: str
    updated_at: str | None = None
    is_system: bool = Field(
        default=False, description="Whether this is a system prompt (cannot be deleted)"
    )


class PromptResponse(BaseModel):
    prompt_id: str
    description: str
    template: str
    variables: list[str]
    created_at: str
    updated_at: str | None = None
    is_system: bool = False


class DeletePromptResponse(BaseModel):
    prompt_id: str
    status: Literal["deleted", "archived"]
    message: str


# ===== Extraction Job Management Models =====


class ExtractionJobSummary(BaseModel):
    """Summary information for an extraction job."""

    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(
        ...,
        description="Job ID (also known as task_id for backward compatibility)",
        alias="task_id",
    )
    collection_id: str | None = Field(
        default=None, description="Collection ID if available"
    )
    status: str = Field(
        description="Job status (PENDING, STARTED, SUCCESS, FAILURE, RETRY, REVOKED)"
    )
    created_at: str = Field(description="Job creation timestamp (ISO 8601)")
    updated_at: str | None = Field(
        default=None, description="Last update timestamp (ISO 8601)"
    )
    started_at: str | None = Field(
        default=None, description="Job start timestamp (ISO 8601)"
    )
    completed_at: str | None = Field(
        default=None, description="Job completion timestamp (ISO 8601)"
    )
    total_documents: int | None = Field(
        default=None, description="Total number of documents to process"
    )
    completed_documents: int | None = Field(
        default=None, description="Number of completed documents"
    )
    elapsed_time_seconds: int | None = Field(
        default=None, description="Elapsed time in seconds since job started"
    )
    estimated_time_remaining_seconds: int | None = Field(
        default=None,
        description="Estimated time remaining in seconds (for in-progress jobs)",
    )
    avg_time_per_document_seconds: float | None = Field(
        default=None, description="Average processing time per document in seconds"
    )


class ListExtractionJobsResponse(BaseModel):
    """Response model for listing extraction jobs."""

    jobs: list[ExtractionJobSummary] = Field(description="List of extraction jobs")
    total: int = Field(description="Total number of jobs matching the query")
    page: int = Field(description="Current page number")
    page_size: int = Field(description="Number of items per page")


class CancelJobResponse(BaseModel):
    """Response model for job cancellation."""

    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(..., description="Job ID that was cancelled", alias="task_id")
    status: str = Field(
        description="Cancellation status (cancelled, already_completed, not_found)"
    )
    message: str = Field(description="Human-readable status message")


# ===== Document Similarity Graph Models =====


class SimilarityGraphRequest(BaseModel):
    """Request model for document similarity graph visualization."""

    sample_size: int = Field(
        default=50,
        ge=1,
        le=200,
        description="Number of documents to include in the graph",
    )
    similarity_threshold: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Minimum similarity score to create an edge (0.0 to 1.0)",
    )
    document_types: list[str] | None = Field(
        default=None, description="Optional filter by document types"
    )
    include_clusters: bool = Field(
        default=False,
        description="Whether to calculate cluster IDs using community detection",
    )


class GraphNode(BaseModel):
    """Node in the similarity graph representing a document."""

    id: str = Field(description="Document ID")
    title: str = Field(description="Document title")
    document_type: str = Field(description="Type of document")
    year: int | None = Field(None, description="Year of document issuance")
    x: float = Field(description="X coordinate for visualization")
    y: float = Field(description="Y coordinate for visualization")
    cluster_id: int | None = Field(
        None, description="Cluster ID if clustering is enabled"
    )
    metadata: dict = Field(
        default_factory=dict, description="Additional metadata for visualization"
    )


class GraphEdge(BaseModel):
    """Edge in the similarity graph representing similarity between documents."""

    source: str = Field(description="Source document ID")
    target: str = Field(description="Target document ID")
    similarity: float = Field(
        ge=0.0, le=1.0, description="Similarity score between documents"
    )


class GraphStatistics(BaseModel):
    """Statistics about the similarity graph."""

    total_nodes: int = Field(description="Total number of nodes in the graph")
    total_edges: int = Field(description="Total number of edges in the graph")
    avg_similarity: float = Field(
        description="Average similarity score across all edges"
    )
    min_similarity: float = Field(description="Minimum similarity score")
    max_similarity: float = Field(description="Maximum similarity score")
    num_clusters: int | None = Field(
        None, description="Number of clusters if clustering is enabled"
    )


class SimilarityGraphResponse(BaseModel):
    """Response model for document similarity graph."""

    nodes: list[GraphNode] = Field(description="List of document nodes")
    edges: list[GraphEdge] = Field(description="List of similarity edges")
    statistics: GraphStatistics = Field(description="Graph statistics")


# ===== Document UUID and Chunk Models =====


class ChunksByDocumentIdsRequest(BaseModel):
    """Request to get best chunks for document IDs."""

    query: str = Field(description="Search query to find most similar chunks")
    document_ids: list[str] = Field(
        description="List of document_id strings (e.g., ['II FSK 1234/21', 'I SA/Wa 567/22'])",
        min_length=1,
        max_length=100,
    )

    @field_validator("document_ids")
    @classmethod
    def validate_document_ids_field(cls, v: list[str]) -> list[str]:
        """Validate list length."""
        if len(v) > 100:
            raise ValueError("Maximum 100 document_ids allowed per request")
        return v

    return_properties: list[str] | None = Field(
        default=None,
        description="Optional list of property names to return. If None, returns all properties. "
        "Use to speed up queries when only specific fields are needed. "
        "Example: ['document_id', 'chunk_id', 'chunk_text']",
        examples=[["document_id", "chunk_id", "chunk_text"]],
    )


class ChunksByDocumentIdsResponse(BaseModel):
    """Response with best chunks for document IDs."""

    chunks: list[DocumentChunk] = Field(description="Best chunk for each document_id")
    query: str = Field(description="Search query used")


class DocumentsByUuidRequest(BaseModel):
    """Request to get documents by UUIDs."""

    document_uuids: list[str] = Field(
        description="List of document UUIDs", min_length=1, max_length=100
    )
    return_vectors: bool = Field(
        default=False, description="Whether to include vector embeddings"
    )
    include_scores: bool = Field(
        default=False, description="Whether to include scores in metadata"
    )
    return_properties: list[str] | None = Field(
        default=None,
        description="Optional list of property names to return. If None, returns all properties. "
        "Use empty list [] to return only UUIDs (lightweight). "
        "Example: ['document_id', 'title', 'summary'] returns only those fields.",
        examples=[["document_id", "title", "summary"], []],
    )

    @field_validator("document_uuids")
    @classmethod
    def validate_document_uuids_field(cls, v: list[str]) -> list[str]:
        """Validate UUID format and list length."""
        if len(v) > 100:
            raise ValueError("Maximum 100 UUIDs allowed per request")

        invalid_uuids = []
        for uuid_str in v:
            try:
                uuid.UUID(uuid_str)
            except (ValueError, TypeError):
                invalid_uuids.append(uuid_str)
        if invalid_uuids:
            raise ValueError(
                f"Invalid UUID format(s): {invalid_uuids[:MAX_INVALID_UUIDS_TO_SHOW]}"
            )
        return v


class DocumentsByUuidResponse(BaseModel):
    """Response with documents retrieved by UUIDs."""

    documents: list[LegalDocument] = Field(description="Retrieved documents")


# ===== Document Request/Response Models =====


class DocumentRequest(BaseModel):
    """Request model for retrieving a single document by ID."""

    document_id: str = Field(description="Document ID to retrieve")
    return_vectors: bool = Field(
        default=False, description="Whether to include vector embeddings"
    )


class DocumentResponse(BaseModel):
    """Response model for a single document."""

    document: LegalDocument = Field(description="The retrieved document")


class BatchDocumentsRequest(BaseModel):
    """Request model for retrieving multiple documents by IDs."""

    document_ids: list[str] = Field(description="List of document IDs to retrieve")
    return_vectors: bool = Field(
        default=False, description="Whether to include vector embeddings"
    )
    return_properties: list[str] | None = Field(
        None,
        description="Optional list of property names to return. If None, returns all properties. Use to optimize performance by fetching only needed fields.",
        max_length=settings.MAX_RETURN_PROPERTIES,
    )


class BatchDocumentsResponse(BaseModel):
    """Response model for multiple documents."""

    documents: list[LegalDocument] = Field(description="List of retrieved documents")


# ===== Document Search Models =====


class SearchDocumentsRequest(BaseModel):
    """Request for document search with metadata."""

    query: str = Field(description="Search query string")
    mode: str = Field(
        default="rabbit",
        description="Search mode: 'rabbit' (fast hybrid search) or 'thinking' (enhanced with AI query rewriting)",
        examples=["rabbit", "thinking"],
    )
    alpha: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Hybrid search balance: 0.0=pure BM25 (keyword), 1.0=pure vector (semantic). Default 0.5 (balanced).",
        examples=[0.0, 0.5, 0.7, 1.0],
    )
    languages: list[str] | None = Field(
        default=None,
        description="Language codes to filter by. Accepts 'pl', 'en', or 'uk' (normalized to 'en'). Note: 'uk' = United Kingdom (English), not Ukraine.",
        examples=[["pl"], ["en"], ["uk"], ["pl", "en"]],
    )
    document_types: list[str] | None = Field(
        default=None,
        description="Document types to filter by. Accepts 'judgment' or 'tax_interpretation'",
        examples=[
            ["tax_interpretation"],
            ["judgment"],
            ["tax_interpretation", "judgment"],
        ],
    )

    @field_validator("languages")
    @classmethod
    def validate_languages_field(cls, v: list[str] | None) -> list[str] | None:
        from app.utils.validators import validate_languages

        return validate_languages(v)

    @field_validator("document_types")
    @classmethod
    def validate_document_types_field(cls, v: list[str] | None) -> list[str] | None:
        from app.utils.validators import validate_document_types

        return validate_document_types(v)

    @field_validator("mode")
    @classmethod
    def validate_mode_field(cls, v: str) -> str:
        """Validate mode parameter - must be 'rabbit' or 'thinking'."""
        v_lower = v.strip().lower()
        valid_modes = {"rabbit", "thinking"}
        if v_lower not in valid_modes:
            raise ValueError(
                f"Invalid mode: '{v}'. Must be one of: 'rabbit' or 'thinking'"
            )
        return v_lower

    return_properties: list[str] | None = Field(
        default=None,
        description="Optional list of property names to return. If None, returns all properties. "
        "Use to speed up queries when only specific fields are needed. "
        "Example: ['document_id', 'title', 'summary']",
        examples=[["document_id", "title", "summary"]],
    )


class SearchDocumentsResponse(BaseModel):
    """Response for document search with metadata."""

    documents: list[LegalDocumentMetadata] = Field(
        description="Matching documents (lightweight metadata, up to 100)"
    )
    total_count: int = Field(
        description="Total count of matching documents (may be capped at 100)"
    )
    is_capped: bool = Field(
        description="True if total_count reached MAX_DOCUMENT_COUNT_LIMIT, indicating there may be more results"
    )
    query_time_ms: float | None = Field(
        default=None,
        description="Query execution time in milliseconds (core database query only)",
    )


# ===== Chunk Search Models =====


class SearchChunksRequest(BaseModel):
    """Request for chunk-based document search."""

    query: str = Field(
        description="Search query string",
        examples=["podatek VAT", "interpretacja podatkowa"],
    )
    limit_docs: int = Field(
        default=OPTIMIZED_CHUNK_DOCS_LIMIT,
        ge=1,
        le=100,
        description="Number of unique documents to return (via their best chunks). Max 100.",
    )
    alpha: float = Field(
        default=OPTIMIZED_CHUNK_ALPHA,
        ge=0.0,
        le=1.0,
        description="Hybrid search balance: 0.0=pure BM25 (keyword), 0.5=hybrid (balanced), 1.0=pure vector (semantic).",
        examples=[0.0, 0.5, 0.7, 1.0],
    )
    languages: list[str] | None = Field(
        default=None,
        description="Language codes to filter by. Accepts 'pl', 'en', or 'uk' (normalized to 'en'). Note: 'uk' = United Kingdom (English), not Ukraine.",
        examples=[["pl"], ["en"], ["uk"], ["pl", "en"]],
    )
    document_types: list[str] | None = Field(
        default=None,
        description="Document types to filter by. Accepts 'judgment' or 'tax_interpretation'",
        examples=[
            ["tax_interpretation"],
            ["judgment"],
            ["tax_interpretation", "judgment"],
        ],
    )
    segment_types: list[str] | None = Field(
        default=None,
        description="Segment types to filter by (e.g., 'uzasadnienie', 'sentencja').",
        examples=[["uzasadnienie"], ["sentencja", "uzasadnienie"]],
    )
    fetch_full_documents: bool = Field(
        default=False,
        description="Whether to fetch full document objects in addition to chunks",
    )
    limit_chunks: int = Field(
        default=OPTIMIZED_CHUNK_FETCH_LIMIT,
        ge=100,
        le=5000,
        description="Number of raw chunks to fetch for Python GroupBy. Higher=better quality but slower.",
        examples=[150, 500, 1000],
    )
    mode: Literal["rabbit", "thinking"] = Field(
        default="rabbit",
        description="Search mode: 'rabbit' (fast hybrid search) or 'thinking' (enhanced with AI query rewriting)",
        examples=["rabbit", "thinking"],
    )
    api_version: Literal["enhanced", "legacy"] = Field(
        default="enhanced",
        description="Search implementation: 'enhanced' (default, parallel queries + RRF fusion) or 'legacy' (simple sequential search)",
    )
    offset: int = Field(
        default=0,
        ge=0,
        le=10000,
        description="Offset for pagination (0-indexed). Max 10000 to prevent performance issues.",
        examples=[0, 10, 20, 50],
    )
    include_count: bool = Field(
        default=True,
        description="Whether to include estimated total count on first request. Set to False for subsequent load-more requests.",
    )

    # NEW FILTER FIELDS FOR ENHANCED FILTERING
    jurisdictions: list[str] | None = Field(
        default=None,
        description="Filter by jurisdictions (PL, UK)",
        examples=[["PL"], ["UK"], ["PL", "UK"]],
    )
    court_names: list[str] | None = Field(
        default=None, description="Filter by specific court names"
    )
    court_levels: list[str] | None = Field(
        default=None,
        description="Filter by court hierarchy level",
        examples=[["Supreme Court"], ["Appeal Court"]],
    )
    case_types: list[str] | None = Field(
        default=None,
        description="Filter by case type",
        examples=[["Criminal"], ["Civil"]],
    )
    decision_types: list[str] | None = Field(
        default=None,
        description="Filter by decision type",
        examples=[["Judgment"], ["Order"]],
    )
    outcomes: list[str] | None = Field(
        default=None,
        description="Filter by case outcome",
        examples=[["Granted"], ["Dismissed"]],
    )
    keywords: list[str] | None = Field(
        default=None, description="Filter by keywords (OR logic)"
    )
    legal_topics: list[str] | None = Field(
        default=None, description="Filter by legal topics (OR logic)"
    )
    cited_legislation: list[str] | None = Field(
        default=None, description="Filter by cited legislation"
    )
    date_from: str | None = Field(
        default=None,
        description="Filter decisions from this date (inclusive, ISO format YYYY-MM-DD)",
    )
    date_to: str | None = Field(
        default=None,
        description="Filter decisions until this date (inclusive, ISO format YYYY-MM-DD)",
    )

    @field_validator("languages")
    @classmethod
    def validate_languages_field(cls, v: list[str] | None) -> list[str] | None:
        from app.utils.validators import validate_languages

        return validate_languages(v)

    @field_validator("document_types")
    @classmethod
    def validate_document_types_field(cls, v: list[str] | None) -> list[str] | None:
        from app.utils.validators import validate_document_types

        return validate_document_types(v)

    @field_validator("segment_types")
    @classmethod
    def validate_segment_types_field(cls, v: list[str] | None) -> list[str] | None:
        # This assumes a validator exists for segment_types.
        # If not, it should be created in app.utils.validators
        # For now, we will just return the value.
        # from app.utils.validators import validate_segment_types
        # return validate_segment_types(v)
        return v


class SearchChunksResponse(BaseModel):
    """Response for chunk-based document search."""

    chunks: list[DocumentChunk] = Field(
        description="Best matching chunks (one per unique document)"
    )
    documents: list[LegalDocument] | None = Field(
        default=None,
        description="Full document objects (only if fetch_full_documents=True)",
    )
    total_chunks: int = Field(
        description="Number of chunks returned (equals number of unique documents found)"
    )
    unique_documents: int = Field(
        description="Number of unique documents represented by the chunks"
    )
    query_time_ms: float | None = Field(
        default=None,
        description="Query execution time in milliseconds",
    )
    timing_breakdown: dict[str, float] | None = Field(
        default=None,
        description="Detailed timing measurements (ms) for each phase of the chunk search pipeline",
    )
    pagination: PaginationMetadata | None = Field(
        default=None,
        description="Pagination metadata for progressive loading (infinite scroll support)",
    )
    enhanced_query: str | None = Field(
        default=None,
        description="AI-enhanced query text (only present when mode='thinking')",
    )
    query_enhancement_used: bool = Field(
        default=False,
        description="Whether query enhancement was applied (True for mode='thinking')",
    )
    semantic_query: str | None = Field(
        default=None,
        description="Semantic/vector-optimized query used for embedding retrieval.",
    )
    keyword_query: str | None = Field(
        default=None,
        description="Keyword/full-text optimized query used for lexical retrieval.",
    )
    inferred_filters: dict[str, Any] | None = Field(
        default=None,
        description="LLM-inferred filters applied to search when not explicitly provided by the user.",
    )
    query_analysis_source: Literal["llm", "heuristic"] | None = Field(
        default=None,
        description="Source of query analysis for thinking mode.",
    )


# ===== Faceting Models =====


class FacetOption(BaseModel):
    """A single facet option with count."""

    value: str = Field(description="The facet value (e.g., 'Criminal', 'PL')")
    count: int = Field(description="Number of documents with this value")


class FacetsResponse(BaseModel):
    """Response containing facet counts for filters."""

    facets: dict[str, list[FacetOption]] = Field(
        description="Facets grouped by type (e.g., {'case_type': [{'value': 'Criminal', 'count': 234}]})"
    )


# ===== Chunk Fetch Models (Phase 2) =====


class FetchChunksByUuidRequest(BaseModel):
    """Request for fetching full chunk data by UUIDs (Phase 2)."""

    chunk_uuids: list[str] = Field(
        description="List of chunk UUIDs to fetch",
        min_length=1,
        max_length=MAX_CHUNKS_PER_FETCH_REQUEST,
        examples=[["uuid1", "uuid2", "uuid3"]],
    )


class FetchChunksByUuidResponse(BaseModel):
    """Response for chunk fetch by UUIDs."""

    chunks: list[DocumentChunk] = Field(
        description="Full chunk objects with all data including chunk_text"
    )
    total_chunks: int = Field(description="Number of chunks returned")


# ===== Citation Network Models =====


class CitationNetworkRequest(BaseModel):
    """Request model for citation network visualization."""

    sample_size: int = Field(
        default=50,
        ge=1,
        le=200,
        description="Number of documents to include in the network",
    )
    min_shared_refs: int = Field(
        default=1,
        ge=1,
        le=10,
        description="Minimum number of shared legal references to create an edge",
    )
    document_types: list[str] | None = Field(
        default=None, description="Optional filter by document types"
    )


class CitationNode(BaseModel):
    """Node in the citation network representing a document."""

    id: str = Field(description="Document ID")
    title: str = Field(description="Document title")
    document_type: str = Field(description="Type of document")
    year: int | None = Field(None, description="Year of document issuance")
    x: float = Field(description="X coordinate for visualization")
    y: float = Field(description="Y coordinate for visualization")
    citation_count: int = Field(
        description="Number of legal references this document cites"
    )
    authority_score: float = Field(
        description="How often this document's references are shared by others (0-1)"
    )
    references: list[str] = Field(
        default_factory=list, description="Legal references cited"
    )
    metadata: dict = Field(default_factory=dict, description="Additional metadata")


class CitationEdge(BaseModel):
    """Edge in the citation network representing shared legal references."""

    source: str = Field(description="Source document ID")
    target: str = Field(description="Target document ID")
    shared_refs: list[str] = Field(description="Shared legal reference texts")
    weight: float = Field(
        ge=0.0, le=1.0, description="Normalized edge weight based on shared references"
    )


class CitationNetworkStatistics(BaseModel):
    """Statistics about the citation network."""

    total_nodes: int = Field(description="Total number of nodes")
    total_edges: int = Field(description="Total number of edges")
    avg_citations: float = Field(description="Average citations per document")
    max_citations: int = Field(description="Maximum citations for a single document")
    most_cited_refs: list[dict] = Field(
        description="Top referenced legal bases with counts"
    )
    avg_authority_score: float = Field(description="Average authority score")


class CitationNetworkResponse(BaseModel):
    """Response model for citation network."""

    nodes: list[CitationNode] = Field(description="List of document nodes")
    edges: list[CitationEdge] = Field(description="List of citation edges")
    statistics: CitationNetworkStatistics = Field(description="Network statistics")


# ===== OCR Processing Models =====


class OCRJobRequest(BaseModel):
    """Request to submit a document for OCR processing."""

    document_id: str = Field(
        min_length=1,
        max_length=255,
        description="Document ID to associate OCR results with",
    )
    source_type: Literal["pdf", "image"] = Field(
        description="Type of source file (pdf or image)",
    )
    source_filename: str | None = Field(
        default=None,
        max_length=500,
        description="Original filename of the uploaded file",
    )
    language_hint: str | None = Field(
        default=None,
        max_length=10,
        description="Hint for OCR language detection (e.g., 'pl', 'en')",
    )

    @field_validator("document_id")
    @classmethod
    def validate_document_id(cls, v: str) -> str:
        return validate_id_format(v, "document_id")


class OCRQualityMetrics(BaseModel):
    """Quality metrics for OCR output."""

    avg_confidence: float = Field(
        ge=0.0, le=1.0, description="Average character confidence"
    )
    low_confidence_words: int = Field(
        ge=0, description="Number of words with low confidence"
    )
    total_words: int = Field(ge=0, description="Total words detected")
    estimated_accuracy: float = Field(
        ge=0.0, le=1.0, description="Estimated text accuracy"
    )
    needs_review: bool = Field(description="Whether manual review is recommended")
    quality_level: Literal["high", "medium", "low"] = Field(
        description="Overall quality classification",
    )


class OCRPageResult(BaseModel):
    """OCR result for a single page."""

    page_number: int = Field(ge=1, description="Page number (1-indexed)")
    extracted_text: str = Field(description="Text extracted from this page")
    confidence_score: float = Field(ge=0.0, le=1.0, description="Page-level confidence")
    word_count: int = Field(ge=0, description="Number of words on this page")
    quality_metrics: OCRQualityMetrics | None = Field(
        default=None,
        description="Per-page quality metrics",
    )


class OCRJobResponse(BaseModel):
    """Response for an OCR job submission."""

    job_id: str = Field(description="Unique OCR job identifier")
    document_id: str = Field(description="Associated document ID")
    status: Literal["pending", "processing", "completed", "failed"] = Field(
        description="Current job status",
    )
    message: str | None = Field(default=None, description="Status message")


class OCRJobStatus(BaseModel):
    """Full status of an OCR job."""

    job_id: str = Field(description="Unique OCR job identifier")
    document_id: str = Field(description="Associated document ID")
    status: Literal["pending", "processing", "completed", "failed"] = Field(
        description="Current job status",
    )
    source_type: str = Field(description="Source file type")
    source_filename: str | None = Field(default=None, description="Original filename")
    # OCR results
    extracted_text: str | None = Field(default=None, description="Full extracted text")
    confidence_score: float | None = Field(
        default=None, description="Overall confidence"
    )
    page_count: int | None = Field(
        default=None, description="Number of pages processed"
    )
    language_detected: str | None = Field(default=None, description="Detected language")
    quality_metrics: OCRQualityMetrics | None = Field(
        default=None,
        description="Overall quality assessment",
    )
    pages: list[OCRPageResult] | None = Field(
        default=None,
        description="Per-page results",
    )
    # Manual corrections
    corrected_text: str | None = Field(
        default=None, description="Manually corrected text"
    )
    correction_notes: str | None = Field(
        default=None, description="Notes about corrections"
    )
    corrected_at: str | None = Field(
        default=None, description="When corrections were made"
    )
    # Timestamps
    created_at: str = Field(description="Job creation time")
    updated_at: str = Field(description="Last update time")
    completed_at: str | None = Field(default=None, description="Job completion time")
    error_message: str | None = Field(
        default=None, description="Error details if failed"
    )


class OCRCorrectionRequest(BaseModel):
    """Request to submit manual corrections for OCR text."""

    corrected_text: str = Field(
        min_length=1,
        description="The manually corrected full text",
    )
    correction_notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Notes about what was corrected",
    )
    page_corrections: list[dict[str, Any]] | None = Field(
        default=None,
        description="Per-page corrections: [{page_number: int, corrected_text: str}]",
    )


class OCRCorrectionResponse(BaseModel):
    """Response after applying corrections."""

    job_id: str = Field(description="OCR job identifier")
    status: Literal["corrected"] = "corrected"
    corrected_at: str = Field(description="Timestamp of correction")
    message: str = Field(default="Corrections applied successfully")


class OCRJobListResponse(BaseModel):
    """Response for listing OCR jobs."""

    jobs: list[OCRJobStatus] = Field(description="List of OCR jobs")
    total: int = Field(description="Total number of jobs")
    page: int = Field(description="Current page")
    page_size: int = Field(description="Items per page")
