"""Similar document finding: get_similar_to_document, find_similar_documents_batch."""

from fastapi import HTTPException, Path, Query
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

from app.models import (
    SimilarDocumentResult,
    SimilarDocumentsResponse,
    validate_id_format,
)

from .utils import generate_embedding


async def get_similar_to_document(
    document_id: str = Path(
        ..., description="Document ID to find similar documents for"
    ),
    top_k: int = Query(
        10, ge=1, le=100, description="Maximum number of similar documents"
    ),
) -> SimilarDocumentsResponse:
    """Find documents similar to a specific document using vector similarity."""
    try:
        validate_id_format(document_id, "document_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        db = get_vector_db()

        # Fetch the source row WITH its stored embedding so we don't have to
        # round-trip the text through the TEI service when `judgments.embedding`
        # is already populated (which it is for ~100% of rows).
        doc_data = await db.get_document_by_id(document_id, return_vectors=True)
        if not doc_data:
            raise HTTPException(
                status_code=404, detail=f"Document {document_id} not found"
            )

        embedding = doc_data.get("embedding")
        if isinstance(embedding, str):
            # pgvector sometimes serialises as "[0.1, 0.2, ...]" rather than a list.
            import json
            try:
                embedding = json.loads(embedding)
            except (json.JSONDecodeError, ValueError):
                embedding = None
        if not embedding:
            # Fallback: regenerate from text (e.g. row missing its embedding).
            text = (
                doc_data.get("summary")
                or doc_data.get("title")
                or doc_data.get("full_text", "")[:2000]
            )
            if not text:
                raise HTTPException(
                    status_code=400,
                    detail="Document has no content to generate embedding",
                )
            embedding = await generate_embedding(text)

        # Search for similar documents
        similar_results = await db.search_by_vector(
            query_embedding=embedding,
            match_count=top_k + 1,  # +1 to exclude self
            match_threshold=0.3,
        )

        # Filter out self and convert results
        results = []
        for result in similar_results:
            if result.get("document_id") == document_id:
                continue
            if len(results) >= top_k:
                break

            results.append(
                SimilarDocumentResult(
                    document_id=result.get("document_id", ""),
                    db_id=result.get("supabase_document_id", ""),
                    similarity_score=result.get("similarity", 0.0),
                    title=result.get("title"),
                    document_type=result.get("document_type"),
                    date_issued=result.get("date_issued"),
                    publication_date=result.get("publication_date"),
                    document_number=result.get("document_number"),
                    country=result.get("country"),
                    language=result.get("language"),
                )
            )

        return SimilarDocumentsResponse(
            query_document_id=document_id,
            similar_documents=results,
            total_found=len(results),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding similar documents for {document_id}: {e!s}")
        raise HTTPException(status_code=500, detail="Error finding similar documents.")


async def find_similar_documents_batch(
    document_ids: list[str],
    top_k: int,
) -> list[SimilarDocumentsResponse]:
    """Find similar documents for multiple document IDs."""
    all_responses = []

    for doc_id in document_ids:
        try:
            response = await get_similar_to_document(document_id=doc_id, top_k=top_k)
            all_responses.append(response)
        except HTTPException:
            # If one document fails, add empty response
            all_responses.append(
                SimilarDocumentsResponse(
                    query_document_id=doc_id,
                    similar_documents=[],
                    total_found=0,
                )
            )

    return all_responses
