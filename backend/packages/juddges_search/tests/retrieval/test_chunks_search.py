"""Unit tests for juddges_search.retrieval.chunks_search.prepare_retriever (#223).

prepare_retriever is the orchestration seam on every chat/search request: it
fans queries out to the vector/term searches, deduplicates, and truncates. The
search functions are patched at the chunks_search namespace so these tests stay
pure (no Supabase, no embeddings) and assert the orchestration invariants only.
"""

from unittest.mock import AsyncMock, patch

import pytest

from juddges_search.chains.models import DocumentRetrieval, QuestionDict
from juddges_search.models import DocumentChunk
from juddges_search.retrieval import chunks_search

pytestmark = pytest.mark.unit


def _chunk(chunk_id: int, text: str, document_id: str = "doc-1") -> DocumentChunk:
    return DocumentChunk(document_id=document_id, chunk_id=chunk_id, chunk_text=text)


class TestStringQuestion:
    async def test_delegates_to_search_chunks(self):
        expected = [_chunk(1, "a"), _chunk(2, "b")]
        with patch.object(chunks_search, "search_chunks", AsyncMock(return_value=expected)) as mock_search:
            docs = await prepare(question="what is the ruling?")

        assert docs == expected
        mock_search.assert_awaited_once()
        # filters are forwarded through
        assert mock_search.await_args.kwargs["languages"] is None
        assert mock_search.await_args.kwargs["document_types"] is None

    async def test_accepts_plain_dict_input(self):
        with patch.object(chunks_search, "search_chunks", AsyncMock(return_value=[])) as mock_search:
            docs = await chunks_search.prepare_retriever({"question": "hi"})

        assert docs == []
        mock_search.assert_awaited_once()


class TestQuestionDict:
    async def test_merges_vector_and_term_then_dedupes_and_truncates(self):
        # vector returns c1, c2; term returns a duplicate of c2 plus c3
        vector_results = [_chunk(1, "alpha"), _chunk(2, "beta")]
        term_results = [_chunk(2, "beta"), _chunk(3, "gamma")]

        with (
            patch.object(chunks_search, "search_chunks_vector", AsyncMock(return_value=vector_results)),
            patch.object(chunks_search, "search_chunks_term", AsyncMock(return_value=term_results)),
        ):
            docs = await prepare(
                question=QuestionDict(vector_queries={"q": "v"}, term_queries={"q": "t"}),
                max_documents=10,
            )

        # duplicate (chunk_id=2, "beta") collapses to one; order preserved
        assert [c.chunk_id for c in docs] == [1, 2, 3]

    async def test_truncates_to_max_documents(self):
        vector_results = [_chunk(i, f"text-{i}") for i in range(1, 6)]

        with (
            patch.object(chunks_search, "search_chunks_vector", AsyncMock(return_value=vector_results)),
            patch.object(chunks_search, "search_chunks_term", AsyncMock(return_value=[])),
        ):
            docs = await prepare(
                question=QuestionDict(vector_queries={"q": "v"}),
                max_documents=2,
            )

        assert len(docs) == 2
        assert [c.chunk_id for c in docs] == [1, 2]

    async def test_all_empty_queries_returns_empty_without_searching(self):
        with (
            patch.object(chunks_search, "search_chunks_vector", AsyncMock()) as mv,
            patch.object(chunks_search, "search_chunks_term", AsyncMock()) as mt,
        ):
            docs = await prepare(question=QuestionDict())

        assert docs == []
        mv.assert_not_awaited()
        mt.assert_not_awaited()

    async def test_blank_string_queries_are_filtered_out(self):
        with (
            patch.object(chunks_search, "search_chunks_vector", AsyncMock(return_value=[])) as mv,
            patch.object(chunks_search, "search_chunks_term", AsyncMock(return_value=[])) as mt,
        ):
            docs = await prepare(
                question=QuestionDict(vector_queries={"q": "   "}, term_queries={"q": ""}),
            )

        # every query was whitespace/empty -> treated as no queries
        assert docs == []
        mv.assert_not_awaited()
        mt.assert_not_awaited()


class TestInvalidInput:
    async def test_non_str_non_questiondict_raises_value_error(self):
        # bypass pydantic validation to exercise the defensive else-branch
        bad = DocumentRetrieval.model_construct(question=123)
        with pytest.raises(ValueError, match="Invalid question type"):
            await chunks_search.prepare_retriever(bad)


async def prepare(*, question, max_documents=None, languages=None, document_types=None):
    """Build a DocumentRetrieval and run prepare_retriever."""
    input_ = DocumentRetrieval(
        question=question,
        max_documents=max_documents,
        languages=languages,
        document_types=document_types,
    )
    return await chunks_search.prepare_retriever(input_)
