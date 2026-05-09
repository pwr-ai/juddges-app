"""
Strawberry GraphQL schema definition with Query, Mutation, and Subscription roots.

The resolvers delegate to existing service logic used by the REST endpoints,
ensuring consistent behavior between GraphQL and REST interfaces.
"""

import asyncio
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

import strawberry
from loguru import logger

from app.graphql_api.converters import (
    convert_extraction_job,
    convert_legal_document,
    convert_search_chunks_response,
    convert_similar_documents_response,
)
from app.graphql_api.types import (
    DocumentIndexedEvent,
    ExtractionJobType,
    ExtractionProgressEvent,
    LegalDocumentMetadataType,
    LegalDocumentType,
    SearchChunksResultType,
    SearchDocumentsResultType,
    SimilarDocumentsResultType,
)

# Module-level event bus for subscriptions (in-memory, single-process)
_extraction_events: dict[str, asyncio.Queue] = {}
_document_indexed_events: asyncio.Queue = asyncio.Queue(maxsize=1000)


def publish_extraction_progress(event: ExtractionProgressEvent) -> None:
    """Publish an extraction progress event (called from extraction workers)."""
    queue = _extraction_events.get(event.job_id)
    if queue:
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning(f"Extraction event queue full for job {event.job_id}")


def publish_document_indexed(event: DocumentIndexedEvent) -> None:
    """Publish a document indexed event."""
    try:
        _document_indexed_events.put_nowait(event)
    except asyncio.QueueFull:
        logger.warning("Document indexed event queue full, dropping oldest event")
        try:
            _document_indexed_events.get_nowait()
            _document_indexed_events.put_nowait(event)
        except asyncio.QueueEmpty:
            pass


# ===== Input Types =====


@strawberry.input
class SearchDocumentsInput:
    """Input for searching documents by metadata."""

    query: str
    mode: str = "rabbit"
    alpha: float = 0.5
    languages: list[str] | None = None
    document_types: list[str] | None = None
    return_properties: list[str] | None = None


@strawberry.input
class SearchChunksInput:
    """Input for chunk-based document search."""

    query: str
    limit_docs: int = 20
    alpha: float = 0.7
    languages: list[str] | None = None
    document_types: list[str] | None = None
    segment_types: list[str] | None = None
    fetch_full_documents: bool = False
    mode: str = "rabbit"
    offset: int = 0


@strawberry.input
class SimilarDocumentsInput:
    """Input for finding similar documents."""

    document_ids: list[str]
    top_k: int = 10


@strawberry.input
class ExtractionInput:
    """Input for submitting an extraction job."""

    collection_id: str
    schema_id: str | None = None
    document_ids: list[str] | None = None
    extraction_context: str = "Extract structured information from legal documents."
    language: str = "pl"


# ===== Query Root =====


@strawberry.type
class Query:
    @strawberry.field(description="Get a single document by its ID")
    async def document(self, document_id: str) -> LegalDocumentType | None:
        from juddges_search.db.supabase_db import get_vector_db

        from app.judgments_pkg import _convert_supabase_to_legal_document
        from app.models import validate_id_format

        try:
            validate_id_format(document_id, "document_id")
        except ValueError:
            return None

        db = get_vector_db()
        doc_data = await db.get_document_by_id(document_id)
        if not doc_data:
            return None

        pydantic_doc = _convert_supabase_to_legal_document(doc_data)
        return convert_legal_document(pydantic_doc)

    @strawberry.field(
        description="Get the full text of a document (separate query to avoid large default payloads)"
    )
    async def document_full_text(self, document_id: str) -> str | None:
        from juddges_search.db.supabase_db import get_vector_db

        from app.models import validate_id_format

        try:
            validate_id_format(document_id, "document_id")
        except ValueError:
            return None

        db = get_vector_db()
        doc_data = await db.get_document_by_id(document_id)
        if not doc_data:
            return None

        return doc_data.get("full_text") or doc_data.get("content", "")

    @strawberry.field(description="Get multiple documents by their IDs")
    async def documents(self, document_ids: list[str]) -> list[LegalDocumentType]:
        from juddges_search.db.supabase_db import get_vector_db

        from app.judgments_pkg import _convert_supabase_to_legal_document

        if not document_ids or len(document_ids) > 100:
            return []

        db = get_vector_db()
        docs_data = await db.get_documents_by_ids(document_ids)

        return [
            convert_legal_document(_convert_supabase_to_legal_document(d))
            for d in docs_data
        ]

    @strawberry.field(description="Search documents by metadata with hybrid search")
    async def search_documents(
        self, input: SearchDocumentsInput
    ) -> SearchDocumentsResultType:
        from app.judgments_pkg import search_documents as rest_search
        from app.models import SearchChunksRequest

        request = SearchChunksRequest(
            query=input.query,
            mode=input.mode,
            alpha=input.alpha,
            languages=input.languages,
            document_types=input.document_types,
            limit_docs=input.limit_docs if hasattr(input, "limit_docs") else 20,
            offset=0,
        )

        response = await rest_search(request)

        # Convert SearchChunksResponse to SearchDocumentsResultType
        docs = []
        if response.documents:
            for doc in response.documents:
                docs.append(
                    LegalDocumentMetadataType(
                        uuid="",
                        document_id=doc.document_id,
                        document_type=doc.document_type.value
                        if hasattr(doc.document_type, "value")
                        else str(doc.document_type),
                        language=getattr(doc, "language", None),
                        title=getattr(doc, "title", None),
                        summary=getattr(doc, "summary", None),
                        court_name=getattr(doc, "court_name", None),
                        document_number=getattr(doc, "document_number", None),
                        keywords=getattr(doc, "keywords", None),
                        date_issued=getattr(doc, "date_issued", None),
                        score=None,
                    )
                )

        return SearchDocumentsResultType(
            documents=docs,
            total_count=response.unique_documents,
            is_capped=False,
            query_time_ms=response.query_time_ms,
        )

    @strawberry.field(
        description="Search document chunks with hybrid search and pagination"
    )
    async def search_chunks(self, input: SearchChunksInput) -> SearchChunksResultType:
        from app.judgments_pkg import search_documents as rest_search
        from app.models import SearchChunksRequest

        request = SearchChunksRequest(
            query=input.query,
            limit_docs=input.limit_docs,
            alpha=input.alpha,
            languages=input.languages,
            document_types=input.document_types,
            segment_types=input.segment_types,
            fetch_full_documents=input.fetch_full_documents,
            mode=input.mode,
            offset=input.offset,
        )

        response = await rest_search(request)
        return convert_search_chunks_response(response)

    @strawberry.field(description="Find documents similar to the given document IDs")
    async def similar_documents(
        self, document_ids: list[str], top_k: int = 10
    ) -> list[SimilarDocumentsResultType]:
        from app.judgments_pkg import find_similar_documents_batch
        from app.models import SimilarDocumentsRequest

        request = SimilarDocumentsRequest(document_ids=document_ids, top_k=top_k)
        response = await find_similar_documents_batch(request)

        if hasattr(response, "__iter__"):
            return [convert_similar_documents_response(r) for r in response]
        return [convert_similar_documents_response(response)]

    @strawberry.field(description="List extraction jobs with optional filters")
    async def extraction_jobs(
        self,
        status: str | None = None,
        collection_id: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> list[ExtractionJobType]:
        from app.extraction import list_extraction_jobs

        response = await list_extraction_jobs(
            page=page,
            page_size=page_size,
            status=status,
            collection_id=collection_id,
        )

        return [convert_extraction_job(job) for job in response.jobs]

    @strawberry.field(description="Get a single extraction job by its ID")
    async def extraction_job(self, job_id: str) -> ExtractionJobType | None:
        from app.extraction import get_extraction_job

        try:
            response = await get_extraction_job(job_id)
            return convert_extraction_job(response)
        except Exception:
            return None


# ===== Mutation Root =====


@strawberry.type
class Mutation:
    @strawberry.mutation(description="Submit a new document extraction job")
    async def submit_extraction(self, input: ExtractionInput) -> ExtractionJobType:
        from app.extraction import create_extraction_job
        from app.models import SimpleExtractionRequest

        request = SimpleExtractionRequest(
            collection_id=input.collection_id,
            schema_id=input.schema_id,
            document_ids=input.document_ids,
            extraction_context=input.extraction_context,
            language=input.language,
        )

        response = await create_extraction_job(request)

        return ExtractionJobType(
            job_id=response.task_id,
            status=response.status,
            created_at=datetime.now(UTC).isoformat(),
        )


# ===== Subscription Root =====


@strawberry.type
class Subscription:
    @strawberry.subscription(description="Subscribe to extraction job progress updates")
    async def extraction_progress(
        self, job_id: str
    ) -> AsyncGenerator[ExtractionProgressEvent, None]:
        """Stream real-time progress updates for an extraction job."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        _extraction_events[job_id] = queue

        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield event
                    if event.status in ("completed", "failed"):
                        break
                except TimeoutError:
                    # Send heartbeat to keep the connection alive
                    yield ExtractionProgressEvent(
                        job_id=job_id,
                        status="heartbeat",
                        completed_documents=0,
                        total_documents=0,
                        progress_percent=0.0,
                    )
        finally:
            _extraction_events.pop(job_id, None)

    @strawberry.subscription(description="Subscribe to newly indexed documents")
    async def document_indexed(self) -> AsyncGenerator[DocumentIndexedEvent, None]:
        """Stream real-time notifications when new documents are indexed."""
        while True:
            try:
                event = await asyncio.wait_for(
                    _document_indexed_events.get(), timeout=30.0
                )
                yield event
            except TimeoutError:
                # Send heartbeat
                yield DocumentIndexedEvent(
                    document_id="heartbeat",
                    document_type="heartbeat",
                    title=None,
                    indexed_at=datetime.now(UTC).isoformat(),
                )


# ===== Schema Construction =====

schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    subscription=Subscription,
)
