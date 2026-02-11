from loguru import logger
from juddges_search.models import DocumentChunk


def format_documents_with_metadata(documents: list[DocumentChunk]) -> str:
    logger.info(f"Formatting {len(documents)} documents")
    formatted_docs = []
    for doc in documents:
        formatted_doc = f"Document ID: {doc.document_id} Chunk ID: {doc.chunk_id}\n"
        formatted_doc += f"Type: {doc.segment_type}\n"
        formatted_doc += f"Content: {doc.chunk_text}\n"
        if doc.cited_references:
            formatted_doc += f"References: {', '.join(doc.cited_references)}\n"
        if doc.tags:
            formatted_doc += f"Tags: {', '.join(doc.tags)}\n"
        formatted_docs.append(formatted_doc)
    return "\n\n".join(formatted_docs)
