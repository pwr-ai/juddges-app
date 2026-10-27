"""
Unit tests for prepare_retriever's handling of partial search failures.

A failing vector RPC (e.g. a statement timeout) must not discard the results
of the other searches running alongside it.
"""

from unittest.mock import AsyncMock, patch

import pytest
from juddges_search.chains.models import QuestionDict
from juddges_search.models import DocumentChunk
from juddges_search.retrieval.chunks_search import prepare_retriever


def _chunk(document_id: str, chunk_id: int, text: str) -> DocumentChunk:
    return DocumentChunk(document_id=document_id, chunk_id=chunk_id, chunk_text=text)


def _retrieval_input(vector_queries: dict, term_queries: dict) -> dict:
    return {
        "question": QuestionDict(
            vector_queries=vector_queries, term_queries=term_queries
        ),
        "max_documents": 10,
    }


@pytest.mark.unit
class TestPrepareRetrieverPartialFailures:
    """prepare_retriever keeps surviving results when one search fails."""

    @pytest.mark.asyncio
    async def test_vector_failure_keeps_term_results(self):
        term_chunk = _chunk("doc_term", 1, "term hit")

        with (
            patch(
                "juddges_search.retrieval.chunks_search.search_chunks_vector",
                AsyncMock(
                    side_effect=RuntimeError(
                        "canceling statement due to statement timeout"
                    )
                ),
            ),
            patch(
                "juddges_search.retrieval.chunks_search.search_chunks_term",
                AsyncMock(return_value=[term_chunk]),
            ),
        ):
            docs = await prepare_retriever(
                _retrieval_input({"q": "vector query"}, {"q": "term query"})
            )

        assert docs == [term_chunk]

    @pytest.mark.asyncio
    async def test_one_vector_failure_keeps_other_vector_results(self):
        ok_chunk = _chunk("doc_ok", 1, "vector hit")

        async def vector_search(query, *args, **kwargs):
            if query == "broken":
                raise RuntimeError("database unavailable")
            return [ok_chunk]

        with patch(
            "juddges_search.retrieval.chunks_search.search_chunks_vector",
            AsyncMock(side_effect=vector_search),
        ):
            docs = await prepare_retriever(
                _retrieval_input({"a": "broken", "b": "working"}, {})
            )

        assert docs == [ok_chunk]

    @pytest.mark.asyncio
    async def test_all_searches_failing_raises(self):
        """With nothing left to answer from, the failure must stay visible."""
        with (
            patch(
                "juddges_search.retrieval.chunks_search.search_chunks_vector",
                AsyncMock(side_effect=RuntimeError("database unavailable")),
            ),
            patch(
                "juddges_search.retrieval.chunks_search.search_chunks_term",
                AsyncMock(side_effect=RuntimeError("database unavailable")),
            ),
            pytest.raises(RuntimeError, match="database unavailable"),
        ):
            await prepare_retriever(
                _retrieval_input({"q": "vector query"}, {"q": "term query"})
            )
