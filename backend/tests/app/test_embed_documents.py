"""Unit tests for app.ingestion.embed_documents — EmbeddingGenerator."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ingestion.embed_documents import (
    DOC_EMBEDDING_MAX_CHARS,
    EmbeddingGenerator,
)


def _make_generator(
    *, batch_size: int = 10, dry_run: bool = False
) -> EmbeddingGenerator:
    """Create an EmbeddingGenerator with mocked dependencies."""
    mock_supabase = MagicMock()
    with patch("app.ingestion.embed_documents.get_embedding_provider") as mock_prov:
        mock_provider = AsyncMock()
        mock_provider.config = MagicMock()
        mock_provider.config.model_name = "test-model"
        mock_provider.config.dimensions = 768
        mock_prov.return_value = mock_provider
        return EmbeddingGenerator(
            supabase_client=mock_supabase,
            batch_size=batch_size,
            dry_run=dry_run,
        )


# ============================================================================
# generate_batch_embeddings
# ============================================================================


@pytest.mark.unit
class TestGenerateBatchEmbeddings:
    @pytest.mark.asyncio
    async def test_empty_input_returns_none_list(self):
        gen = _make_generator()
        result = await gen.generate_batch_embeddings([])
        assert result == []

    @pytest.mark.asyncio
    async def test_all_empty_texts_return_none_values(self):
        gen = _make_generator()
        result = await gen.generate_batch_embeddings(["", "  ", None])
        # None and empty texts should produce [None, None, None]
        assert result == [None, None, None]

    @pytest.mark.asyncio
    async def test_successful_embedding_generation(self):
        gen = _make_generator()
        gen.provider.embed_texts.return_value = [[0.1, 0.2], [0.3, 0.4]]

        result = await gen.generate_batch_embeddings(["text one", "text two"])
        assert result == [[0.1, 0.2], [0.3, 0.4]]

    @pytest.mark.asyncio
    async def test_mixed_empty_and_valid_texts(self):
        gen = _make_generator()
        gen.provider.embed_texts.return_value = [[0.5, 0.6]]

        result = await gen.generate_batch_embeddings(["", "valid text", ""])
        # Only index 1 should have an embedding
        assert result[0] is None
        assert result[1] == [0.5, 0.6]
        assert result[2] is None

    @pytest.mark.asyncio
    async def test_retries_on_transient_failure(self):
        gen = _make_generator()
        gen.provider.embed_texts.side_effect = [
            RuntimeError("timeout"),
            [[0.9, 0.8]],
        ]

        result = await gen.generate_batch_embeddings(["retry text"])
        assert result[0] == [0.9, 0.8]

    @pytest.mark.asyncio
    async def test_returns_none_after_max_retries(self):
        gen = _make_generator()
        gen.provider.embed_texts.side_effect = RuntimeError("persistent failure")

        result = await gen.generate_batch_embeddings(["doomed text"])
        assert result[0] is None


# ============================================================================
# get_judgments_without_embeddings
# ============================================================================


@pytest.mark.unit
class TestGetJudgmentsWithoutEmbeddings:
    def test_returns_data_from_supabase_response(self):
        gen = _make_generator()
        mock_response = MagicMock()
        mock_response.data = [{"id": "j1", "case_number": "C1"}]

        # Chain: table().select().is_().order().range().execute()
        gen.supabase.table.return_value.select.return_value.is_.return_value.order.return_value.range.return_value.execute.return_value = mock_response

        result = gen.get_judgments_without_embeddings(limit=10)
        assert result == [{"id": "j1", "case_number": "C1"}]

    def test_returns_empty_list_when_no_data(self):
        gen = _make_generator()
        mock_response = MagicMock()
        mock_response.data = None

        gen.supabase.table.return_value.select.return_value.is_.return_value.order.return_value.range.return_value.execute.return_value = mock_response

        result = gen.get_judgments_without_embeddings(limit=5)
        assert result == []


# ============================================================================
# get_total_judgments_without_embeddings
# ============================================================================


@pytest.mark.unit
class TestGetTotalJudgmentsWithoutEmbeddings:
    def test_returns_count(self):
        gen = _make_generator()
        mock_response = MagicMock()
        mock_response.count = 42

        gen.supabase.table.return_value.select.return_value.is_.return_value.execute.return_value = mock_response

        result = gen.get_total_judgments_without_embeddings()
        assert result == 42

    def test_returns_zero_when_count_is_none(self):
        gen = _make_generator()
        mock_response = MagicMock()
        mock_response.count = None

        gen.supabase.table.return_value.select.return_value.is_.return_value.execute.return_value = mock_response

        result = gen.get_total_judgments_without_embeddings()
        assert result == 0


# ============================================================================
# update_judgment_embedding
# ============================================================================


@pytest.mark.unit
class TestUpdateJudgmentEmbedding:
    def test_dry_run_returns_true_without_db_call(self):
        gen = _make_generator(dry_run=True)
        result = gen.update_judgment_embedding("j1", [0.1, 0.2])
        assert result is True
        gen.supabase.table.assert_not_called()

    def test_successful_update(self):
        gen = _make_generator()
        gen.supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
        result = gen.update_judgment_embedding("j1", [0.1, 0.2])
        assert result is True
        gen.supabase.table.assert_called_with("judgments")

    def test_handles_exception_and_returns_false(self):
        gen = _make_generator()
        gen.supabase.table.side_effect = RuntimeError("db error")
        result = gen.update_judgment_embedding("j1", [0.1, 0.2])
        assert result is False


# ============================================================================
# process_batch
# ============================================================================


@pytest.mark.unit
class TestProcessBatch:
    @pytest.mark.asyncio
    async def test_empty_batch_returns_zero(self):
        gen = _make_generator()
        result = await gen.process_batch([])
        assert result == 0

    @pytest.mark.asyncio
    async def test_successful_batch_processing(self):
        gen = _make_generator()
        gen.provider.embed_texts.return_value = [[0.1, 0.2]]
        gen.supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

        docs = [{"id": "j1", "case_number": "C1", "full_text": "Some legal text"}]
        result = await gen.process_batch(docs)
        assert result == 1
        assert gen.stats["successful"] == 1

    @pytest.mark.asyncio
    async def test_counts_failed_when_embedding_is_none(self):
        gen = _make_generator()
        gen.provider.embed_texts.side_effect = RuntimeError("always fail")

        docs = [{"id": "j1", "case_number": "C1", "full_text": "text"}]
        result = await gen.process_batch(docs)
        assert result == 0
        assert gen.stats["failed"] == 1

    @pytest.mark.asyncio
    async def test_truncates_text_to_max_chars(self):
        gen = _make_generator()
        long_text = "x" * (DOC_EMBEDDING_MAX_CHARS + 5000)
        gen.provider.embed_texts.return_value = [[0.1]]
        gen.supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

        docs = [{"id": "j1", "full_text": long_text}]
        await gen.process_batch(docs)

        # Verify embed_texts was called with truncated text
        called_texts = gen.provider.embed_texts.call_args[0][0]
        assert len(called_texts[0]) == DOC_EMBEDDING_MAX_CHARS


# ============================================================================
# Constants
# ============================================================================


@pytest.mark.unit
class TestConstants:
    def test_doc_embedding_max_chars_is_reasonable(self):
        assert DOC_EMBEDDING_MAX_CHARS == 8000

    def test_initial_stats(self):
        gen = _make_generator()
        assert gen.stats == {
            "total_processed": 0,
            "successful": 0,
            "failed": 0,
            "skipped": 0,
        }
