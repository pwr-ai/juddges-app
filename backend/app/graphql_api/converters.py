"""
Converters between Pydantic models and Strawberry GraphQL types.

These functions transform the data returned by existing REST endpoint logic
into GraphQL-compatible types, avoiding code duplication.
"""

from typing import Any

from app.graphql_api.types import (
    DocumentChunkType,
    ExtractionJobType,
    IssuingBodyType,
    LegalDocumentMetadataType,
    LegalDocumentType,
    PaginationMetadataType,
    SearchChunksResultType,
    SearchDocumentsResultType,
    SimilarDocumentResultType,
    SimilarDocumentsResultType,
)


def convert_legal_document(doc: Any) -> LegalDocumentType:
    """Convert a Pydantic LegalDocument to a Strawberry LegalDocumentType."""
    issuing_body = None
    if hasattr(doc, "issuing_body") and doc.issuing_body:
        ib = doc.issuing_body
        issuing_body = IssuingBodyType(
            name=getattr(ib, "name", None),
            jurisdiction=getattr(ib, "jurisdiction", None),
            type=getattr(ib, "type", None),
        )

    return LegalDocumentType(
        document_id=doc.document_id,
        document_type=doc.document_type.value
        if hasattr(doc.document_type, "value")
        else str(doc.document_type),
        title=getattr(doc, "title", None),
        date_issued=getattr(doc, "date_issued", None),
        issuing_body=issuing_body,
        language=getattr(doc, "language", None),
        victims_count=getattr(doc, "victims_count", None),
        offenders_count=getattr(doc, "offenders_count", None),
        case_type=getattr(doc, "case_type", "criminal"),
        document_number=getattr(doc, "document_number", None),
        country=getattr(doc, "country", None),
        summary=getattr(doc, "summary", None),
        keywords=getattr(doc, "keywords", None),
        thesis=getattr(doc, "thesis", None),
        court_name=getattr(doc, "court_name", None),
        department_name=getattr(doc, "department_name", None),
        presiding_judge=getattr(doc, "presiding_judge", None),
        judges=getattr(doc, "judges", None),
        legal_bases=getattr(doc, "legal_bases", None),
        parties=getattr(doc, "parties", None),
        outcome=getattr(doc, "outcome", None),
        source_url=getattr(doc, "source_url", None),
        publication_date=getattr(doc, "publication_date", None),
        ingestion_date=getattr(doc, "ingestion_date", None),
    )


def convert_legal_document_metadata(doc: Any) -> LegalDocumentMetadataType:
    """Convert a Pydantic LegalDocumentMetadata to Strawberry type."""
    return LegalDocumentMetadataType(
        uuid=doc.uuid,
        document_id=doc.document_id,
        document_type=doc.document_type.value
        if hasattr(doc.document_type, "value")
        else str(doc.document_type),
        language=getattr(doc, "language", None),
        victims_count=getattr(doc, "victims_count", None),
        offenders_count=getattr(doc, "offenders_count", None),
        case_type=getattr(doc, "case_type", "criminal"),
        keywords=getattr(doc, "keywords", None),
        date_issued=getattr(doc, "date_issued", None),
        score=getattr(doc, "score", None),
        title=getattr(doc, "title", None),
        summary=getattr(doc, "summary", None),
        court_name=getattr(doc, "court_name", None),
        document_number=getattr(doc, "document_number", None),
        thesis=getattr(doc, "thesis", None),
    )


def convert_document_chunk(chunk: Any) -> DocumentChunkType:
    """Convert a Pydantic DocumentChunk to Strawberry type."""
    return DocumentChunkType(
        document_id=chunk.document_id,
        document_type=getattr(chunk, "document_type", None),
        language=getattr(chunk, "language", None),
        chunk_id=chunk.chunk_id,
        chunk_text=chunk.chunk_text,
        segment_type=chunk.segment_type.value
        if hasattr(chunk, "segment_type")
        and chunk.segment_type
        and hasattr(chunk.segment_type, "value")
        else getattr(chunk, "segment_type", None),
        position=getattr(chunk, "position", None),
        confidence_score=getattr(chunk, "confidence_score", None),
        cited_references=getattr(chunk, "cited_references", None),
        tags=getattr(chunk, "tags", None),
    )


def convert_search_documents_response(response: Any) -> SearchDocumentsResultType:
    """Convert a REST SearchDocumentsResponse to Strawberry type."""
    return SearchDocumentsResultType(
        documents=[convert_legal_document_metadata(d) for d in response.documents],
        total_count=response.total_count,
        is_capped=response.is_capped,
        query_time_ms=getattr(response, "query_time_ms", None),
    )


def convert_search_chunks_response(response: Any) -> SearchChunksResultType:
    """Convert a REST SearchChunksResponse to Strawberry type."""
    pagination = None
    if hasattr(response, "pagination") and response.pagination:
        p = response.pagination
        pagination = PaginationMetadataType(
            offset=p.offset,
            limit=p.limit,
            loaded_count=p.loaded_count,
            estimated_total=getattr(p, "estimated_total", None),
            has_more=getattr(p, "has_more", False),
            next_offset=getattr(p, "next_offset", None),
        )

    documents = None
    if response.documents:
        documents = [convert_legal_document(d) for d in response.documents]

    return SearchChunksResultType(
        chunks=[convert_document_chunk(c) for c in response.chunks],
        documents=documents,
        total_chunks=response.total_chunks,
        unique_documents=response.unique_documents,
        query_time_ms=getattr(response, "query_time_ms", None),
        pagination=pagination,
    )


def convert_similar_documents_response(response: Any) -> SimilarDocumentsResultType:
    """Convert a REST SimilarDocumentsResponse to Strawberry type."""
    return SimilarDocumentsResultType(
        query_document_id=response.query_document_id,
        similar_documents=[
            SimilarDocumentResultType(
                document_id=sd.document_id,
                db_id=sd.db_id,
                similarity_score=sd.similarity_score,
                title=getattr(sd, "title", None),
                document_type=getattr(sd, "document_type", None),
                date_issued=getattr(sd, "date_issued", None),
                document_number=getattr(sd, "document_number", None),
                country=getattr(sd, "country", None),
                language=getattr(sd, "language", None),
            )
            for sd in response.similar_documents
        ],
        total_found=response.total_found,
    )


def convert_extraction_job(job: Any) -> ExtractionJobType:
    """Convert a REST ExtractionJobSummary to Strawberry type."""
    return ExtractionJobType(
        job_id=getattr(job, "job_id", getattr(job, "task_id", "")),
        collection_id=getattr(job, "collection_id", None),
        status=job.status,
        created_at=job.created_at,
        updated_at=getattr(job, "updated_at", None),
        started_at=getattr(job, "started_at", None),
        completed_at=getattr(job, "completed_at", None),
        total_documents=getattr(job, "total_documents", None),
        completed_documents=getattr(job, "completed_documents", None),
        elapsed_time_seconds=getattr(job, "elapsed_time_seconds", None),
        estimated_time_remaining_seconds=getattr(
            job, "estimated_time_remaining_seconds", None
        ),
    )
