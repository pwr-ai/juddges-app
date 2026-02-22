import asyncio

from juddges_search.chains.models import DocumentRetrieval, QuestionDict
from juddges_search.dict_utils import get_leaf_values
from juddges_search.retrieval.supabase_search import (
    search_chunks,
    search_chunks_term,
    search_chunks_vector,
)
from juddges_search.settings import DEFAULT_MAX_RESULTS, MAX_DOCUMENTS_PER_SEARCH
from loguru import logger
from termcolor import colored


async def prepare_retriever(input: "DocumentRetrieval | dict"):
    """Async version of prepare_retriever that uses native async functions."""
    if isinstance(input, dict):
        input = DocumentRetrieval(**input)

    logger.info(colored(f"Preparing retriever for input: {input}", "green"))

    # Extract filter parameters
    languages = input.languages if hasattr(input, "languages") else None
    document_types = input.document_types if hasattr(input, "document_types") else None

    logger.info(colored(f"Applying filters - languages: {languages}, document_types: {document_types}", "cyan"))

    if isinstance(input.question, str):
        docs = await search_chunks(
            input.question, max_chunks=MAX_DOCUMENTS_PER_SEARCH, languages=languages, document_types=document_types
        )
        logger.debug(colored(f"Retrieved documents for single question: {docs}", "blue"))
        return docs

    elif isinstance(input.question, QuestionDict):
        # Safely extract vector queries (handle None or empty dict)
        vector_queries = input.question.vector_queries or {}
        vector_questions = get_leaf_values(vector_queries)
        # Only add ideal_paragraph if it's not empty
        if input.question.ideal_paragraph:
            vector_questions += [input.question.ideal_paragraph]
        # Filter out empty vector questions
        vector_questions = [q for q in vector_questions if q and isinstance(q, str) and q.strip()]

        # Safely extract term queries (handle None or empty dict)
        term_queries = input.question.term_queries or {}
        term_questions = get_leaf_values(term_queries)
        # Filter out empty term questions to avoid searching with empty queries
        term_questions = [q for q in term_questions if q and isinstance(q, str) and q.strip()]

        logger.info(
            colored(
                f"Searching for {len(vector_questions)} vector questions and {len(term_questions)} term questions",
                "green",
            )
        )

        # Create tasks for all searches with language and document_type filters
        # Only create tasks for non-empty queries
        vector_tasks = [
            search_chunks_vector(q, MAX_DOCUMENTS_PER_SEARCH, languages=languages, document_types=document_types)
            for q in vector_questions
        ]

        # Batch term queries into a single BM25 search for better performance
        # Use explicit OR syntax for proper query semantics
        term_tasks = []
        if term_questions:
            if len(term_questions) == 1:
                # Single query - no need for OR syntax
                combined_term_query = term_questions[0]
            else:
                # Multiple queries - combine with explicit OR operator
                # Full-text search supports OR syntax: (query1) OR (query2) OR (query3)
                # This is more explicit and correct than space-separated concatenation
                combined_term_query = " OR ".join(f"({q})" for q in term_questions)

            # Use a higher limit since we're combining multiple queries
            # This ensures we get enough results to cover all term query variations
            batched_term_limit = MAX_DOCUMENTS_PER_SEARCH * len(term_questions)
            term_tasks = [
                search_chunks_term(
                    combined_term_query,
                    max_chunks=batched_term_limit,
                    languages=languages,
                    document_types=document_types,
                )
            ]
            logger.info(
                colored(
                    f"Batched {len(term_questions)} term queries with OR syntax: '{combined_term_query[:100]}...'",
                    "cyan",
                )
            )

        # Run all tasks and collect results
        all_tasks = vector_tasks + term_tasks

        # If no tasks to run (all queries were empty), return empty results
        if not all_tasks:
            logger.warning(
                colored(
                    "No valid queries found in QuestionDict (all queries were empty). Returning empty results.",
                    "yellow",
                )
            )
            return []

        all_results = []

        # Use gather to run all tasks concurrently
        all_results_lists = await asyncio.gather(*all_tasks)

        # Flatten the results
        for results in all_results_lists:
            all_results.extend(results)

        logger.debug(f"All results length: {len(all_results)}")

        logger.debug("Deduplicating results")
        seen_ids = set()
        seen_texts = set()
        unique_docs = []
        for doc in all_results:
            if doc.chunk_id not in seen_ids and doc.chunk_text not in seen_texts:
                seen_ids.add(doc.chunk_id)
                seen_texts.add(doc.chunk_text)
                unique_docs.append(doc)

        docs = unique_docs[: input.max_documents or DEFAULT_MAX_RESULTS]

        logger.info(
            colored(
                f"Retrieved {len(docs)} documents/chunks for all questions",
                "green",
            )
        )
        return docs

    else:
        raise ValueError(f"Invalid question type: {type(input.question)}")
