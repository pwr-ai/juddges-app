"""LangChain tool wrappers for the Research Agent.

Each tool delegates to existing Juddges functionality. All imports are lazy
(inside the function body) to avoid circular imports and missing-env errors
at module level.
"""

from __future__ import annotations

from langchain_core.tools import tool
from loguru import logger


@tool
async def semantic_search(
    query: str,
    max_results: int = 10,
    languages: list[str] | None = None,
    document_types: list[str] | None = None,
) -> list[dict]:
    """Search legal documents by conceptual meaning using vector similarity.

    Use this tool when the query is conceptual or describes a legal situation,
    doctrine, or principle. It finds documents whose meaning is similar to the
    query, even when exact keywords differ.
    """
    try:
        from juddges_search.retrieval.supabase_search import search_chunks

        chunks = await search_chunks(
            query=query,
            max_chunks=max_results,
            languages=languages,
            document_types=document_types,
        )

        return [
            {
                "document_id": chunk.document_id,
                "title": getattr(chunk, "title", None) or f"Chunk {chunk.chunk_id}",
                "content_preview": chunk.chunk_text[:500],
                "score": chunk.confidence_score,
                "metadata": {
                    "language": chunk.language,
                    "document_type": chunk.document_type,
                    "segment_type": str(chunk.segment_type) if chunk.segment_type else None,
                    "tags": chunk.tags,
                },
            }
            for chunk in chunks
        ]
    except Exception as e:
        logger.error(f"semantic_search failed: {e}")
        return [{"error": str(e)}]


@tool
async def keyword_search(
    query: str,
    max_results: int = 10,
    filters: dict | None = None,
) -> list[dict]:
    """Search legal documents by exact keywords, case numbers, or statute references.

    Use this tool for precise term matching such as case numbers like
    'II FSK 1234/20', statute references like 'art. 286 k.k.', court names,
    or other exact identifiers. Returns results from the Meilisearch full-text index.
    """
    try:
        from app.services.search import MeiliSearchService

        meili = MeiliSearchService.from_env()
        if not meili.configured:
            return [{"error": "Meilisearch is not configured"}]

        # Build filter string from dict if provided
        filter_str: str | None = None
        if filters:
            parts = [f'{k} = "{v}"' for k, v in filters.items()]
            filter_str = " AND ".join(parts)

        data = await meili.autocomplete(query=query, limit=max_results, filters=filter_str)

        hits = data.get("hits", [])
        return [
            {
                "document_id": hit.get("id", ""),
                "title": hit.get("title", ""),
                "content_preview": (hit.get("summary") or "")[:500],
                "court_name": hit.get("court_name", ""),
                "date": hit.get("decision_date", ""),
            }
            for hit in hits
        ]
    except Exception as e:
        logger.error(f"keyword_search failed: {e}")
        return [{"error": str(e)}]


@tool
async def find_precedents(
    fact_pattern: str,
    limit: int = 10,
    document_types: list[str] | None = None,
) -> list[dict]:
    """Find precedent court decisions similar to a given fact pattern.

    Use this tool when you need to find prior court rulings that dealt with
    similar factual circumstances. It generates a vector embedding for the
    fact pattern and searches for the most similar judgments in the database.
    """
    try:
        from app.judgments_pkg.utils import generate_embedding
        from juddges_search.db.supabase_db import get_vector_db

        embedding = await generate_embedding(fact_pattern)
        db = get_vector_db()
        results = await db.search_by_vector(
            query_embedding=embedding,
            match_count=limit,
            match_threshold=0.3,
        )

        return [
            {
                "document_id": doc.get("document_id", ""),
                "title": doc.get("title", ""),
                "similarity": doc.get("similarity", 0.0),
                "court_name": doc.get("court_name", ""),
                "date": doc.get("decision_date", ""),
                "summary_preview": (doc.get("summary") or "")[:300],
            }
            for doc in results
        ]
    except Exception as e:
        logger.error(f"find_precedents failed: {e}")
        return [{"error": str(e)}]


@tool
async def summarize_documents(
    document_ids: list[str],
    summary_type: str = "executive",
    focus_areas: list[str] | None = None,
) -> dict:
    """Summarize one or more legal documents using an LLM.

    Supports summary types: 'executive' (concise overview), 'key_findings'
    (structured findings extraction), and 'synthesis' (cross-document comparison).
    Optionally focus on specific legal areas or topics.
    """
    try:
        from juddges_search.db.supabase_db import get_vector_db
        from juddges_search.llms import get_default_llm
        from juddges_search.prompts.summarization import (
            SUMMARIZATION_SYSTEM_PROMPT,
            SUMMARY_LENGTH_MAP,
            SUMMARY_TYPE_PROMPTS,
        )

        db = get_vector_db()

        # Fetch all documents
        documents = []
        for doc_id in document_ids:
            doc = await db.get_document_by_id(doc_id)
            if doc:
                documents.append(doc)

        if not documents:
            return {"error": "No documents found for the given IDs"}

        # Build document content block
        doc_contents = []
        for doc in documents:
            title = doc.get("title", "Untitled")
            content = doc.get("content") or doc.get("summary") or ""
            doc_contents.append(
                f"--- Document: {title} (ID: {doc.get('document_id', '')}) ---\n{content}"
            )
        document_content = "\n\n".join(doc_contents)

        # Select prompt template
        prompt_template = SUMMARY_TYPE_PROMPTS.get(summary_type, SUMMARY_TYPE_PROMPTS["executive"])
        target_length = SUMMARY_LENGTH_MAP.get("medium", 300)

        focus_areas_instruction = ""
        if focus_areas:
            areas_str = ", ".join(focus_areas)
            focus_areas_instruction = f"- Pay special attention to these areas: {areas_str}"

        user_prompt = prompt_template.format(
            target_length=target_length,
            focus_areas_instruction=focus_areas_instruction,
            document_content=document_content,
        )

        llm = get_default_llm(use_mini_model=False)
        messages = [
            {"role": "system", "content": SUMMARIZATION_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
        response = await llm.ainvoke(messages)

        return {
            "summary": response.content,
            "document_ids": document_ids,
            "summary_type": summary_type,
        }
    except Exception as e:
        logger.error(f"summarize_documents failed: {e}")
        return {"error": str(e)}


@tool
async def analyze_argumentation(
    document_ids: list[str],
    focus_areas: list[str] | None = None,
) -> dict:
    """Analyze the legal argumentation structure in one or more court decisions.

    Extracts arguments made by each party, court holdings, and legal principles
    cited or established. Useful for understanding the reasoning behind decisions
    and identifying persuasive argumentation patterns.
    """
    try:
        from juddges_search.db.supabase_db import get_vector_db
        from juddges_search.llms import get_default_llm
        from juddges_search.prompts.summarization import (
            KEY_POINTS_EXTRACTION_PROMPT,
            KEY_POINTS_EXTRACTION_SYSTEM_PROMPT,
        )

        db = get_vector_db()

        documents = []
        for doc_id in document_ids:
            doc = await db.get_document_by_id(doc_id)
            if doc:
                documents.append(doc)

        if not documents:
            return {"error": "No documents found for the given IDs"}

        # Build document content
        doc_contents = []
        for doc in documents:
            title = doc.get("title", "Untitled")
            content = doc.get("content") or doc.get("summary") or ""
            doc_contents.append(
                f"--- Document: {title} (ID: {doc.get('document_id', '')}) ---\n{content}"
            )
        document_content = "\n\n".join(doc_contents)

        focus_areas_instruction = ""
        if focus_areas:
            areas_str = ", ".join(focus_areas)
            focus_areas_instruction = f"- Pay special attention to these areas: {areas_str}"

        user_prompt = KEY_POINTS_EXTRACTION_PROMPT.format(
            focus_areas_instruction=focus_areas_instruction,
            document_content=document_content,
        )

        llm = get_default_llm(use_mini_model=False)
        messages = [
            {"role": "system", "content": KEY_POINTS_EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
        response = await llm.ainvoke(messages)

        return {
            "analysis": response.content,
            "document_ids": document_ids,
        }
    except Exception as e:
        logger.error(f"analyze_argumentation failed: {e}")
        return {"error": str(e)}


ALL_TOOLS = [
    semantic_search,
    keyword_search,
    find_precedents,
    summarize_documents,
    analyze_argumentation,
]
