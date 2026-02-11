import asyncio
import os
import time
from collections import OrderedDict
from typing import Optional, Any, Union

from loguru import logger
from weaviate.classes.query import Filter, MetadataQuery, HybridFusion
from juddges_search.db.weaviate_db import WeaviateLegalDatabase
from juddges_search.embeddings import VectorName
from juddges_search.models import LegalDocument, LegalDocumentMetadata, DocumentChunk, DocumentType
from juddges_search.chains.rewrite_queries import search_query_generation
from juddges_search.chains.models import QuestionDict
from juddges_search.dict_utils import get_leaf_values
from juddges_search.retrieval.config import (
    MAX_QUERY_LOG_LENGTH,
    PYTHON_GROUPBY_DEFAULT_DOC_LIMIT,
    PYTHON_GROUPBY_CHUNKS_PER_DOC_MULTIPLIER,
    PYTHON_GROUPBY_DEFAULT_ALPHA,
    PYTHON_GROUPBY_RETURN_PROPERTIES,
    SECONDS_TO_MS,
)
from juddges_search.settings import MAX_DOCUMENTS_PER_SEARCH
from juddges_search.retrieval.filters import build_weaviate_filters
from juddges_search.retrieval.utils import (
    convert_weaviate_obj_to_legal_document,
    convert_weaviate_obj_to_legal_document_metadata,
    convert_weaviate_obj_to_document_chunk,
    extract_score_from_obj,
    get_chunk_document_id,
    get_chunk_score,
    validate_search_parameters,
    group_chunks_by_document,
    convert_mixed_chunks_to_document_chunks,
    build_timing_details,
    create_empty_timing_details,
)
from juddges_search.retrieval.aggregation import reciprocal_rank_fusion


async def get_chunks_count_with_filters(
    languages: Optional[list[str]] = None,
    document_types: Optional[list[str]] = None,
    segment_types: Optional[list[str]] = None,
) -> int:
    """Get total count of document chunks matching filters.

    This uses Weaviate's aggregate API to efficiently count matching documents
    without fetching all results. Note: This counts ALL documents matching the
    filters, not just those that would match a search query (BM25/vector search
    aggregates are not supported in Weaviate).

    Use this for estimating total results in paginated searches. The count will
    be displayed as "~X documents" since it's filter-based, not query-specific.

    Args:
        languages: Optional language filter (e.g., ['pl', 'en'])
        document_types: Optional document type filter (e.g., ['judgment'])
        segment_types: Optional segment type filter

    Returns:
        Total count of chunks matching the filters
    """
    try:
        async with WeaviateLegalDatabase(use_pool=True) as db:
            filter_obj, filter_description = build_weaviate_filters(
                languages=languages,
                document_types=document_types,
                segment_types=segment_types,
            )

            logger.debug(f"Getting chunk count with filters: {filter_description}")

            # Use aggregate API for efficient counting
            response = await db.document_chunks_collection.aggregate.over_all(
                filters=filter_obj,
                total_count=True,
            )

            count = response.total_count or 0
            logger.info(f"Total chunks matching filters: {count}")
            return count

    except Exception as e:
        logger.exception(f"Error getting chunk count: {e}")
        # Return 0 on error to not break the search flow
        return 0


async def search_documents(
    query: str,
    max_docs: int = 100,
    document_type: Optional[DocumentType] = None,
    language: Optional[str] = None,
) -> list[LegalDocument]:
    logger.info(f"Searching documents with query: {query}")

    try:
        async with WeaviateLegalDatabase(use_pool=True) as db:
            # Build filters - handle single document_type and language
            document_types = [document_type.value] if document_type else None
            languages = [language] if language else None

            filter_obj, _ = build_weaviate_filters(
                languages=languages,
                document_types=document_types,
            )

            response = await db.legal_documents_collection.query.hybrid(
                query=query,
                target_vector=VectorName.BASE,
                limit=max_docs,
                return_metadata=MetadataQuery(score=True),
                filters=filter_obj,
            )

            logger.info(f"Found {len(response.objects)} matching documents")
            logger.debug(f"First document properties: {response.objects[0].properties if response.objects else 'None'}")

            return [convert_weaviate_obj_to_legal_document(obj, include_vectors=False) for obj in response.objects]
    except Exception as e:
        logger.exception(f"Error searching documents: {e}")
        raise RuntimeError(f"Search failed: {e}") from e


async def search_documents_by_number(
    document_number: str,
    max_docs: int = 100,
) -> list[LegalDocument]:
    logger.info(f"Searching for documents with number: {document_number}")

    try:
        async with WeaviateLegalDatabase(use_pool=True) as db:
            response = await db.legal_documents_collection.query.bm25(
                query=document_number,
                query_properties=["document_number"],
                limit=max_docs,
            )

            logger.info(f"Found {len(response.objects)} matching documents")

            return [
                convert_weaviate_obj_to_legal_document(obj, include_vectors=False, include_scores=True)
                for obj in response.objects
            ]
    except Exception as e:
        logger.exception(f"Error searching documents by number: {e}")
        raise RuntimeError(f"Search by number failed: {e}") from e


async def search_chunks_vector(
    query: str,
    max_chunks: int = 10,
    segment_types: Optional[list[str]] = None,
    languages: Optional[list[str]] = None,
    document_types: Optional[list[str]] = None,
    offset: int = 0,
) -> list[DocumentChunk]:
    logger.info(f"Searching for chunks with vector query: {query}, limit={max_chunks}, offset={offset}")

    try:
        async with WeaviateLegalDatabase(use_pool=True) as db:
            filter_obj, _ = build_weaviate_filters(
                languages=languages,
                document_types=document_types,
                segment_types=segment_types,
            )

            response = await db.document_chunks_collection.query.near_text(
                query=query,
                limit=max_chunks,
                offset=offset,
                return_metadata=MetadataQuery(score=True, certainty=True, distance=True),
                filters=filter_obj,
                target_vector=VectorName.BASE,
            )

            logger.info(f"Found {len(response.objects)} chunks")

            # Convert Weaviate objects to DocumentChunk
            chunks = [
                convert_weaviate_obj_to_document_chunk(obj)
                for obj in response.objects
            ]
            
            return chunks
    except Exception as e:
        logger.exception(f"Error searching chunks with vector query: {e}")
        raise RuntimeError(f"Vector chunk search failed: {e}") from e


async def search_chunks_term(
    query: str,
    max_chunks: int = 10,
    languages: Optional[list[str]] = None,
    document_types: Optional[list[str]] = None,
    segment_types: Optional[list[str]] = None,
    offset: int = 0,
    include_scores: bool = True,
) -> list[DocumentChunk]:
    logger.info(f"Searching for chunks with term query: {query}, limit={max_chunks}, offset={offset}")

    # Validate query is not empty
    if not query or not query.strip():
        logger.warning(f"Empty term query provided, returning empty results")
        return []

    try:
        async with WeaviateLegalDatabase(use_pool=True) as db:
            # Use shared BM25 query function to ensure consistent parameters
            response = await _execute_bm25_query(
                db=db,
                query=query,
                limit=max_chunks,
                languages=languages,
                document_types=document_types,
                segment_types=segment_types,
                offset=offset,
                return_properties=None,  # Return all properties for search_chunks_term
            )

            logger.info(f"Found {len(response.objects)} chunks")

            # Convert Weaviate objects to DocumentChunk
            chunks = [
                convert_weaviate_obj_to_document_chunk(obj, extract_score=include_scores)
                for obj in response.objects
            ]

            return chunks
    except Exception as e:
        logger.exception(f"Error searching chunks with term query: {e}")
        raise RuntimeError(f"Term chunk search failed: {e}") from e


async def _execute_bm25_query(
    db: WeaviateLegalDatabase,
    query: str,
    limit: int,
    languages: Optional[list[str]] = None,
    document_types: Optional[list[str]] = None,
    segment_types: Optional[list[str]] = None,
    offset: int = 0,
    return_properties: Optional[list[str]] = None,
) -> Any:
    """Execute BM25 query with consistent parameters.
    
    This function ensures that all BM25 queries use identical parameters,
    regardless of where they're called from. Used by both search_chunks_term
    and search_documents_with_chunks (rabbit mode) to guarantee consistency.
    
    Args:
        db: Weaviate database connection (must be already opened)
        query: Search query string
        limit: Maximum number of chunks to return
        languages: Optional language filter
        document_types: Optional document type filter
        segment_types: Optional segment type filter
        offset: Offset for pagination
        return_properties: Optional list of properties to return (if None, returns all)
        
    Returns:
        Weaviate query response object with raw objects
    """
    filter_obj, _ = build_weaviate_filters(
        languages=languages,
        document_types=document_types,
        segment_types=segment_types,
    )
    
    # Build BM25 query parameters - these are ALWAYS the same for consistency
    bm25_params = {
        "query": query,
        "query_properties": ["chunk_text"],  # Always search in chunk_text field
        "limit": limit,
        "offset": offset,
        "return_metadata": MetadataQuery(score=True),  # Always return scores
        "filters": filter_obj,
    }
    
    # Only add return_properties if specified (allows different callers to request different fields)
    if return_properties is not None:
        bm25_params["return_properties"] = return_properties
    
    return await db.document_chunks_collection.query.bm25(**bm25_params)


async def _search_chunks_rabbit_mode(
    db: WeaviateLegalDatabase,
    query: str,
    limit_chunks: int,
    languages: Optional[list[str]],
    document_types: Optional[list[str]],
    segment_types: Optional[list[str]],
    query_start: float,
) -> tuple[list[Any], float]:
    """Execute rabbit mode search using BM25 query.
    
    Rabbit mode uses a fast BM25 search with consistent parameters matching
    the legacy endpoint behavior.
    
    Args:
        db: Weaviate database connection (must be already opened)
        query: Search query string
        limit_chunks: Maximum number of chunks to return
        languages: Optional language filter
        document_types: Optional document type filter
        segment_types: Optional segment type filter
        query_start: Start time for query timing (from time.perf_counter())
        
    Returns:
        Tuple of:
        - List of Weaviate objects (raw chunks from database)
        - Query execution time in milliseconds
    """
    # Use shared BM25 query function (same as search_chunks_term) for consistency and performance
    # This ensures identical query parameters and matches legacy endpoint behavior
    response = await _execute_bm25_query(
        db=db,
        query=query,
        limit=limit_chunks,
        languages=languages,
        document_types=document_types,
        segment_types=segment_types,
        offset=0,
        return_properties=PYTHON_GROUPBY_RETURN_PROPERTIES,  # Only return needed fields for grouping
    )
    query_time_ms = (time.perf_counter() - query_start) * SECONDS_TO_MS
    objects_to_process = response.objects
    logger.debug(f"BM25 query (via shared function) returned {len(objects_to_process)} raw chunks in {query_time_ms:.1f}ms")
    
    return objects_to_process, query_time_ms


async def _search_chunks_thinking_mode(
    query: str,
    limit_docs: int,
    languages: Optional[list[str]],
    document_types: Optional[list[str]],
    segment_types: Optional[list[str]],
    query_start: float,
) -> tuple[list[DocumentChunk], float]:
    """Execute thinking mode search with query enhancement and RRF fusion.
    
    Thinking mode enhances the query using LLM, executes multiple searches
    (vector and term), and combines results using Reciprocal Rank Fusion.
    
    Args:
        query: Search query string
        limit_docs: Number of unique documents to return (used for calculating chunks per query)
        languages: Optional language filter
        document_types: Optional document type filter
        segment_types: Optional segment type filter
        query_start: Start time for query timing (from time.perf_counter())
        
    Returns:
        Tuple of:
        - List of DocumentChunk objects (RRF-ranked and fused)
        - Query execution time in milliseconds
    """
    logger.info(f"Thinking mode: enhancing query before chunk search. Original query: '{query}'")
    
    # Generate queries using search_query_generation
    enhanced_queries_result = await search_query_generation.ainvoke({
        "question": query,
        "chat_history": [],
    })
    
    # Log the raw enhanced query result
    logger.info(f"Enhanced query result (raw): {enhanced_queries_result}")

    # search_query_generation returns a dict (from JsonOutputParser), convert to QuestionDict if needed
    if isinstance(enhanced_queries_result, dict):
        # Convert dict to QuestionDict
        question_dict = QuestionDict(**enhanced_queries_result)
    elif isinstance(enhanced_queries_result, QuestionDict):
        question_dict = enhanced_queries_result
    else:
        # Fallback: treat as single query
        logger.warning(f"Unexpected query result type: {type(enhanced_queries_result)}, treating as single query")
        question_dict = QuestionDict(
            vector_queries={"query_1": query},
            term_queries={},
            ideal_paragraph="",
        )

    # Extract vector and term queries from QuestionDict (matching legacy behavior)
    # Extract vector queries
    vector_queries = get_leaf_values(question_dict.vector_queries or {})
    # Only add ideal_paragraph if it's not empty
    if question_dict.ideal_paragraph:
        vector_queries.append(question_dict.ideal_paragraph)
    # Filter out empty vector queries
    vector_queries = [q for q in vector_queries if q and isinstance(q, str) and q.strip()]
    
    # Extract term queries
    term_queries = get_leaf_values(question_dict.term_queries or {})
    # Filter out empty term queries
    term_queries = [q for q in term_queries if q and isinstance(q, str) and q.strip()]
    
    logger.info(
        f"Enhanced query (QuestionDict): {len(vector_queries)} vector queries, "
        f"{len(term_queries)} term queries generated. "
        f"Vector queries: {question_dict.vector_queries}, "
        f"Term queries: {question_dict.term_queries}, "
        f"ideal_paragraph: {question_dict.ideal_paragraph}"
    )

    # Execute separate searches for thinking mode - all queries run in parallel
    # Use 0.5 * limit_docs chunks per query
    # Example: If limit_docs=50, each vector query returns 25 chunks, each term query returns 50 chunks
    # Total: 3 vector queries * 25 + 2 term queries * 50 = 75 + 100 = 175 chunks
    chunks_per_query = int(0.5 * limit_docs)
    
    # Vector queries: use pure vector search - each runs in parallel
    vector_tasks = []
    if vector_queries:
        vector_tasks = [
            search_chunks_vector(
                q,
                max_chunks=chunks_per_query,  # 0.5 * limit_docs per vector query
                languages=languages,
                document_types=document_types,
                segment_types=segment_types,
            )
            for q in vector_queries
        ]
    
    # Term queries: run each separately in parallel (RRF will combine results)
    # This provides better parallelism than combining with OR syntax
    term_tasks = []
    if term_queries:
        term_tasks = [
            search_chunks_term(
                q,
                max_chunks=limit_docs,  # limit_docs per term query
                languages=languages,
                document_types=document_types,
                segment_types=segment_types,
            )
            for q in term_queries
        ]
        logger.info(
            f"Running {len(term_queries)} term queries in parallel (limit={limit_docs} per query)"
        )

    # Run all searches concurrently
    all_tasks = vector_tasks + term_tasks
    if not all_tasks:
        logger.warning("No valid queries found in QuestionDict (all queries were empty). Returning empty results.")
        query_time_ms = (time.perf_counter() - query_start) * SECONDS_TO_MS
        return [], query_time_ms
    
    # Execute all searches
    all_results_lists = await asyncio.gather(*all_tasks)
    query_time_ms = (time.perf_counter() - query_start) * SECONDS_TO_MS
    
    # Apply Reciprocal Rank Fusion (RRF) to combine results from all queries
    # RRF handles deduplication and provides unified ranking based on rank positions
    rrf_fused_chunks = reciprocal_rank_fusion(all_results_lists, k=60)
    logger.info(f"RRF fused: {sum(len(r) for r in all_results_lists)} total chunks → {len(rrf_fused_chunks)} unique chunks")
    
    return rrf_fused_chunks, query_time_ms


async def search_chunks(
    query: str,
    max_chunks: int = 10,
    segment_types: Optional[list[str]] = None,
    languages: Optional[list[str]] = None,
    document_types: Optional[list[str]] = None,
    offset: int = 0,
) -> list[DocumentChunk]:
    """
    Search for document chunks using hybrid search (combines vector and BM25 in a single query).

    This is more efficient than running separate vector and term queries, as it:
    - Makes only 1 database query instead of 2
    - Automatically combines and ranks results
    - Reduces network overhead and latency
    """
    logger.info(f"Searching for chunks with hybrid query: {query}, limit={max_chunks}, offset={offset}")

    try:
        async with WeaviateLegalDatabase(use_pool=True) as db:
            filter_obj, _ = build_weaviate_filters(
                languages=languages,
                document_types=document_types,
                segment_types=segment_types,
            )

            # Use hybrid search to combine vector and BM25 in a single query
            response = await db.document_chunks_collection.query.hybrid(
                query=query,
                target_vector=VectorName.BASE,
                limit=max_chunks,
                offset=offset,
                return_metadata=MetadataQuery(score=True),
                filters=filter_obj,
                query_properties=["chunk_text"],  # BM25 search in chunk_text field
            )

            document_chunks = [convert_weaviate_obj_to_document_chunk(obj) for obj in response.objects]

            logger.info(f"Found {len(document_chunks)} document chunks")
            logger.debug(
                f"Sample chunk: ID={document_chunks[0].chunk_id}, Text={document_chunks[0].chunk_text[:100]}..."
                if document_chunks
                else "No chunks found"
            )

            return document_chunks
    except Exception as e:
        logger.exception(f"Error searching chunks: {e}")
        raise RuntimeError(f"Chunk search failed: {e}") from e


async def search_documents_with_chunks(
    query: str,
    limit_chunks: Optional[int] = None,
    limit_docs: int = PYTHON_GROUPBY_DEFAULT_DOC_LIMIT,
    chunks_per_doc_multiplier: int = PYTHON_GROUPBY_CHUNKS_PER_DOC_MULTIPLIER,
    alpha: float = PYTHON_GROUPBY_DEFAULT_ALPHA,
    languages: Optional[list[str]] = None,
    document_types: Optional[list[str]] = None,
    segment_types: Optional[list[str]] = None,
    max_query_log_length: int = MAX_QUERY_LOG_LENGTH,
    mode: str = "rabbit",
    offset: int = 0,
) -> tuple[list[DocumentChunk], dict[str, float], bool]:
    """
    Search for documents by retrieving their best chunks without relying on Weaviate GroupBy.

    Strategy:
    1. Fetch limit_chunks raw chunks (no GroupBy, just pure search)
    2. Group by document_id in Python
    3. Take best chunk per document
    4. Return top limit_docs unique documents (with offset support for pagination)

    This bypasses potential GroupBy performance issues in Weaviate.

    In thinking mode, uses parallel query execution with RRF fusion:
    - Generates multiple queries via LLM enhancement
    - Executes vector and term queries in parallel using asyncio.gather()
    - Combines results using Reciprocal Rank Fusion (RRF, k=60)

    Args:
        query: Search query string
        limit_chunks: Number of raw chunks to fetch (default: limit_docs * chunks_per_doc_multiplier)
        limit_docs: Number of unique documents to return (default PYTHON_GROUPBY_DEFAULT_DOC_LIMIT)
        chunks_per_doc_multiplier: Multiplier for calculating limit_chunks from limit_docs
            (default PYTHON_GROUPBY_CHUNKS_PER_DOC_MULTIPLIER)
        alpha: Hybrid search balance (0.0=BM25, 1.0=vector, default PYTHON_GROUPBY_DEFAULT_ALPHA)
            Note: Only used in hybrid search modes, not in rabbit mode (pure BM25)
        languages: Optional language filter
        document_types: Optional document type filter
        segment_types: Optional segment type filter
        max_query_log_length: Maximum query length to display in logs (default: MAX_QUERY_LOG_LENGTH)
        mode: Search mode - "rabbit" (fast BM25) or "thinking" (enhanced with parallel queries + RRF)
        offset: Offset for pagination (0-indexed). Skips first N documents. Default 0.

    Returns:
        Tuple of:
        - List of DocumentChunk objects (best chunk per unique document)
        - Timing breakdown in milliseconds (query, grouping, conversion, total, etc.)
        - has_more: Boolean indicating if more results are available beyond this page
    """
    # Calculate effective limit to account for offset when calculating chunk fetch limit
    effective_limit_for_chunks = offset + limit_docs + 1  # +1 to detect has_more

    # Validate parameters and calculate limit_chunks based on effective limit
    limit_chunks = validate_search_parameters(
        limit_docs=effective_limit_for_chunks,  # Use effective limit for chunk calculation
        chunks_per_doc_multiplier=chunks_per_doc_multiplier,
        limit_chunks=limit_chunks,
        alpha=alpha,
        mode=mode,
    )

    overall_start = time.perf_counter()

    # Log at DEBUG level to avoid duplication with endpoint-level logging
    logger.debug(
        f"Python GroupBy: fetching {limit_chunks} chunks, grouping to {limit_docs} docs, "
        f"offset={offset}, alpha={alpha}, mode={mode}"
    )
    
    # Log filter parameters for debugging (before normalization)
    logger.info(
        f"Filter parameters (before normalization): languages={languages}, document_types={document_types}, "
        f"segment_types={segment_types}"
    )
    
    try:
        connection_start = time.perf_counter()
        async with WeaviateLegalDatabase(use_pool=True) as db:
            connection_time_ms = (time.perf_counter() - connection_start) * SECONDS_TO_MS
            if connection_time_ms > 1000:
                logger.warning(
                    f"Weaviate connection took {connection_time_ms:.1f}ms - this is unusually slow. "
                    f"Check network connectivity or verify connection pool is working correctly."
                )
            else:
                logger.debug(f"Weaviate connection established in {connection_time_ms:.1f}ms")
            
            # Build filters
            filter_obj, filter_description = build_weaviate_filters(
                languages=languages,
                document_types=document_types,
                segment_types=segment_types,
            )
            
            # Log the built filter for debugging
            if filter_obj:
                logger.info(f"Applied filters: {filter_description}")
            else:
                logger.debug("No filters applied (filter_obj is None)")
            
            # Execute query with timing - support thinking mode
            query_start = time.perf_counter()
            
            # Log full query details
            logger.info(
                f"Executing query: query='{query}', limit={limit_chunks}, alpha={alpha}, "
                f"has_filter={filter_obj is not None}, filters={filter_description}, mode={mode}"
            )
            
            # Execute mode-specific search logic
            if mode == "rabbit":
                objects_to_process, query_time_ms = await _search_chunks_rabbit_mode(
                    db=db,
                    query=query,
                    limit_chunks=limit_chunks,
                    languages=languages,
                    document_types=document_types,
                    segment_types=segment_types,
                    query_start=query_start,
                )
            elif mode == "thinking":
                objects_to_process, query_time_ms = await _search_chunks_thinking_mode(
                    query=query,
                    limit_docs=limit_docs,
                    languages=languages,
                    document_types=document_types,
                    segment_types=segment_types,
                    query_start=query_start,
                )
            else:
                raise ValueError(f"Invalid mode: {mode}. Must be 'rabbit' or 'thinking'")
            
            # Early return if no results
            if not objects_to_process:
                logger.info("No chunks found")
                total_time_ms = (time.perf_counter() - overall_start) * SECONDS_TO_MS
                timing_details = create_empty_timing_details(query_time_ms, total_time_ms)
                logger.info(f"Python GroupBy timing details: {timing_details}")
                return [], timing_details, False  # has_more=False when no results
            
            logger.info(
                f"Fetched {len(objects_to_process)} chunks in {query_time_ms:.1f}ms "
                f"({'RRF-ranked' if mode == 'thinking' else 'BM25-ranked'})"
            )
            
            # Group by document_id - chunks are already sorted by RRF score (thinking) or Weaviate score (rabbit)
            # Fetch extra docs to cover offset and detect has_more
            grouping_start = time.perf_counter()
            effective_limit = offset + limit_docs + 1  # +1 to detect has_more
            doc_to_chunk = group_chunks_by_document(objects_to_process, effective_limit)
            grouping_time_ms = (time.perf_counter() - grouping_start) * SECONDS_TO_MS

            # Convert all grouped chunks to DocumentChunk objects first
            conversion_start = time.perf_counter()
            all_chunks = convert_mixed_chunks_to_document_chunks(doc_to_chunk)
            conversion_time_ms = (time.perf_counter() - conversion_start) * SECONDS_TO_MS

            # Apply offset and limit, determine has_more
            total_grouped = len(all_chunks)
            has_more = total_grouped > offset + limit_docs

            # Skip offset docs and take limit_docs
            chunks = all_chunks[offset : offset + limit_docs]

            # Build timing details
            total_time_ms = (time.perf_counter() - overall_start) * SECONDS_TO_MS
            timing_details = build_timing_details(
                query_time_ms=query_time_ms,
                grouping_time_ms=grouping_time_ms,
                conversion_time_ms=conversion_time_ms,
                total_time_ms=total_time_ms,
            )

            logger.info(
                f"Python GroupBy: {len(objects_to_process)} chunks → {total_grouped} unique docs → "
                f"offset={offset}, returning {len(chunks)} docs, has_more={has_more}, timings={timing_details}"
            )
            logger.debug(f"Python GroupBy timing details: {timing_details}")

            return chunks, timing_details, has_more
            
    except Exception as e:
        logger.exception(f"Error in Python GroupBy chunk search: {e}")
        raise RuntimeError(f"Python GroupBy chunk search failed: {e}") from e
