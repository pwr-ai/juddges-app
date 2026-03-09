"""Unit tests for app.reranker module."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.reranker import (
    CohereReranker,
    _build_reranker,
    _extract_document_text,
    rerank_results,
)

# ---------------------------------------------------------------------------
# _extract_document_text
# ---------------------------------------------------------------------------


class TestExtractDocumentText:
    def test_prefers_summary(self):
        result = {"summary": "Summary text", "chunk_text": "Chunk", "title": "Title"}
        assert _extract_document_text(result) == "Summary text"

    def test_falls_back_to_chunk_text(self):
        result = {"chunk_text": "Chunk text", "title": "Title"}
        assert _extract_document_text(result) == "Chunk text"

    def test_falls_back_to_title(self):
        result = {"title": "Title text"}
        assert _extract_document_text(result) == "Title text"

    def test_returns_empty_for_no_fields(self):
        assert _extract_document_text({}) == ""

    def test_returns_empty_for_none_values(self):
        result = {"summary": None, "chunk_text": None, "title": None}
        assert _extract_document_text(result) == ""

    def test_truncates_at_4000_chars(self):
        result = {"summary": "x" * 5000}
        assert len(_extract_document_text(result)) == 4000

    def test_does_not_truncate_short_text(self):
        result = {"summary": "short"}
        assert _extract_document_text(result) == "short"

    def test_skips_empty_summary(self):
        result = {"summary": "", "chunk_text": "Chunk text"}
        assert _extract_document_text(result) == "Chunk text"


# ---------------------------------------------------------------------------
# _build_reranker
# ---------------------------------------------------------------------------


class TestBuildReranker:
    def test_returns_cohere_when_api_key_set(self):
        with patch.dict("os.environ", {"COHERE_API_KEY": "test-key"}):
            reranker = _build_reranker()
            assert isinstance(reranker, CohereReranker)

    def test_returns_none_when_no_api_key(self):
        with patch.dict("os.environ", {}, clear=True):
            reranker = _build_reranker()
            assert reranker is None


# ---------------------------------------------------------------------------
# CohereReranker
# ---------------------------------------------------------------------------


class TestCohereReranker:
    @pytest.fixture
    def reranker(self):
        return CohereReranker(api_key="test-key", model="rerank-v3.5")

    @pytest.fixture
    def sample_results(self):
        return [
            {"title": "Doc A", "summary": "First document about law"},
            {"title": "Doc B", "summary": "Second document about contracts"},
            {"title": "Doc C", "summary": "Third document about torts"},
        ]

    @pytest.fixture
    def mock_cohere_response(self):
        return {
            "results": [
                {"index": 2, "relevance_score": 0.95},
                {"index": 0, "relevance_score": 0.80},
                {"index": 1, "relevance_score": 0.60},
            ]
        }

    async def test_reranks_and_reorders(
        self, reranker, sample_results, mock_cohere_response
    ):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = mock_cohere_response

        reranker._client = AsyncMock()
        reranker._client.post = AsyncMock(return_value=mock_response)

        reranked = await reranker.rerank("legal query", sample_results, top_k=3)

        assert len(reranked) == 3
        assert reranked[0]["title"] == "Doc C"
        assert reranked[0]["rerank_score"] == 0.95
        assert reranked[1]["title"] == "Doc A"
        assert reranked[1]["rerank_score"] == 0.80
        assert reranked[2]["title"] == "Doc B"
        assert reranked[2]["rerank_score"] == 0.60

    async def test_sends_correct_payload(
        self, reranker, sample_results, mock_cohere_response
    ):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = mock_cohere_response

        reranker._client = AsyncMock()
        reranker._client.post = AsyncMock(return_value=mock_response)

        await reranker.rerank("test query", sample_results, top_k=2)

        call_kwargs = reranker._client.post.call_args
        payload = call_kwargs.kwargs["json"]
        assert payload["query"] == "test query"
        assert payload["model"] == "rerank-v3.5"
        assert payload["top_n"] == 2
        assert len(payload["documents"]) == 3

    async def test_preserves_original_fields(self, reranker):
        results = [{"title": "Doc", "summary": "Sum", "extra_field": "preserved"}]
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "results": [{"index": 0, "relevance_score": 0.9}]
        }
        reranker._client = AsyncMock()
        reranker._client.post = AsyncMock(return_value=mock_response)

        reranked = await reranker.rerank("query", results, top_k=1)

        assert reranked[0]["extra_field"] == "preserved"
        assert reranked[0]["rerank_score"] == 0.9

    async def test_does_not_mutate_original(self, reranker):
        results = [{"title": "Doc", "summary": "Sum"}]
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "results": [{"index": 0, "relevance_score": 0.9}]
        }
        reranker._client = AsyncMock()
        reranker._client.post = AsyncMock(return_value=mock_response)

        await reranker.rerank("query", results, top_k=1)

        assert "rerank_score" not in results[0]

    async def test_raises_on_http_error(self, reranker):
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "rate limited", request=MagicMock(), response=MagicMock()
        )
        reranker._client = AsyncMock()
        reranker._client.post = AsyncMock(return_value=mock_response)

        with pytest.raises(httpx.HTTPStatusError):
            await reranker.rerank("query", [{"title": "doc"}], top_k=1)


# ---------------------------------------------------------------------------
# rerank_results (public API)
# ---------------------------------------------------------------------------


class TestRerankResults:
    async def test_returns_empty_for_empty_results(self):
        result = await rerank_results("query", [])
        assert result == []

    async def test_returns_original_when_no_backend(self):
        results = [{"title": "doc1"}, {"title": "doc2"}]
        with patch("app.reranker._get_reranker", return_value=None):
            reranked = await rerank_results("query", results)
        assert reranked is results

    async def test_returns_original_on_reranker_failure(self):
        mock_reranker = AsyncMock()
        mock_reranker.rerank.side_effect = Exception("API down")

        results = [{"title": "doc1"}, {"title": "doc2"}]
        with patch("app.reranker._get_reranker", return_value=mock_reranker):
            reranked = await rerank_results("query", results)
        assert reranked is results

    async def test_calls_reranker_with_correct_args(self):
        mock_reranker = AsyncMock()
        mock_reranker.rerank.return_value = [{"title": "reranked"}]

        results = [{"title": "doc1"}]
        with patch("app.reranker._get_reranker", return_value=mock_reranker):
            await rerank_results("my query", results, top_k=10)

        mock_reranker.rerank.assert_called_once_with(
            query="my query", results=results, top_k=10
        )

    async def test_default_top_k_is_20(self):
        mock_reranker = AsyncMock()
        mock_reranker.rerank.return_value = []

        with patch("app.reranker._get_reranker", return_value=mock_reranker):
            await rerank_results("query", [{"title": "doc"}])

        call_kwargs = mock_reranker.rerank.call_args.kwargs
        assert call_kwargs["top_k"] == 20
