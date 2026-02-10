from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from loguru import logger
from pydantic import ValidationError

from ai_tax_search.db.weaviate_db import WeaviateLegalDatabase
from ai_tax_search.models import LegalDocument, DocumentChunk


async def prepare_document_dict(document: LegalDocument) -> dict:
    """Prepare a document for ingestion into Weaviate.
    
    Args:
        document: The legal document to prepare
        
    Returns:
        A dictionary ready for Weaviate ingestion
    """
    try:
        return {
            "document_id": document.document_id,
            "document_type": document.document_type.value,
            "title": document.title,
            "date_issued": document.date_issued.isoformat() if document.date_issued else None,
            "issuing_body": document.issuing_body,
            "language": document.language,
            "document_number": document.document_number,
            "country": document.country,
            "full_text": document.full_text,
            "summary": document.summary,
            "legal_references": document.legal_references,
            "legal_concepts": document.legal_concepts,
            "keywords": document.keywords,
            "metadata": {
                "source_url": str(document.metadata.get("source_url")) if document.metadata.get("source_url") else None,
                "ingestion_date": datetime.now().isoformat(),
                "last_updated": datetime.now().isoformat(),
            }
        }
    except ValidationError as e:
        logger.error(f"Failed to prepare document {document.document_id} for ingestion: {e}")
        raise


async def prepare_chunk_dict(chunk: DocumentChunk, document_uuid: UUID) -> dict:
    """Prepare a document chunk for ingestion into Weaviate.
    
    Args:
        chunk: The document chunk to prepare
        document_uuid: UUID of the parent document
        
    Returns:
        A dictionary ready for Weaviate ingestion
    """
    try:
        return {
            "document_id": chunk.document_id,
            "chunk_id": chunk.chunk_id,
            "chunk_text": chunk.chunk_text,
            "segment_type": chunk.segment_type.value,
            "position": chunk.position,
            "confidence_score": chunk.confidence_score,
            "cited_references": chunk.cited_references,
            "tags": chunk.tags,
            "parent_segment_id": chunk.parent_segment_id,
            "document_chunks": {
                "beacon": f"weaviate://localhost/{WeaviateLegalDatabase.LEGAL_DOCUMENTS_COLLECTION}/{document_uuid}"
            }
        }
    except ValidationError as e:
        logger.error(f"Failed to prepare chunk {chunk.chunk_id} for ingestion: {e}")
        raise


async def ingest_document(
    db: WeaviateLegalDatabase,
    document: LegalDocument,
    chunks: List[DocumentChunk],
) -> Optional[UUID]:
    """Ingest a legal document and its chunks into Weaviate.
    
    Args:
        db: The Weaviate database instance
        document: The legal document to ingest
        chunks: List of document chunks to ingest
        
    Returns:
        UUID of the ingested document if successful, None otherwise
        
    Raises:
        ValidationError: If document or chunks fail validation
        ValueError: If ingestion fails
    """
    try:
        # Prepare and insert document
        document_dict = await prepare_document_dict(document)
        document_uuid = await db.legal_documents_collection.data.insert(document_dict)
        
        if not document_uuid:
            raise ValueError(f"Failed to insert document {document.document_id}")
            
        logger.info(f"Inserted document {document.document_id} with UUID {document_uuid}")

        # Insert chunks
        for chunk in chunks:
            if chunk.document_id != document.document_id:
                logger.warning(f"Chunk {chunk.chunk_id} has mismatched document_id")
                continue
                
            chunk_dict = await prepare_chunk_dict(chunk, document_uuid)
            chunk_uuid = db.uuid_from_document_chunk_id(chunk.document_id, chunk.chunk_id)
            
            await db.document_chunks_collection.data.insert(chunk_dict, uuid=chunk_uuid)
            logger.debug(f"Inserted chunk {chunk.chunk_id} with UUID {chunk_uuid}")

        return document_uuid

    except Exception as e:
        logger.error(f"Failed to ingest document {document.document_id}: {e}")
        raise


async def batch_ingest_documents(
    db: WeaviateLegalDatabase,
    documents: List[LegalDocument],
    chunks_by_doc: Dict[str, List[DocumentChunk]],
) -> List[UUID]:
    """Batch ingest multiple legal documents and their chunks into Weaviate.
    
    Args:
        db: The Weaviate database instance
        documents: List of legal documents to ingest
        chunks_by_doc: Dictionary mapping document IDs to their chunks
        
    Returns:
        List of UUIDs for successfully ingested documents
        
    Raises:
        ValidationError: If any document or chunk fails validation
    """
    successful_uuids = []
    
    for document in documents:
        try:
            chunks = chunks_by_doc.get(document.document_id, [])
            if document_uuid := await ingest_document(db, document, chunks):
                successful_uuids.append(document_uuid)
        except Exception as e:
            logger.error(f"Failed to ingest document {document.document_id}: {e}")
            continue
            
    logger.info(f"Successfully ingested {len(successful_uuids)} out of {len(documents)} documents")
    return successful_uuids 