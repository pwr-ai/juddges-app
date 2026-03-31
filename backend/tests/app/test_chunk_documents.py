"""Unit tests for app.ingestion.chunk_documents — DocumentChunker."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ingestion.chunk_documents import (
    JURISDICTION_TO_LANGUAGE,
    POLISH_SECTION_PATTERNS,
    UK_SECTION_PATTERNS,
    DocumentChunker,
)


def _make_chunker(*, batch_size: int = 10, dry_run: bool = False) -> DocumentChunker:
    """Create a DocumentChunker with mocked external dependencies."""
    mock_supabase = MagicMock()
    with patch("app.ingestion.chunk_documents.get_embedding_provider") as mock_prov:
        mock_provider = AsyncMock()
        mock_prov.return_value = mock_provider
        return DocumentChunker(
            supabase_client=mock_supabase,
            batch_size=batch_size,
            dry_run=dry_run,
        )


# ============================================================================
# Section Detection
# ============================================================================


@pytest.mark.unit
class TestDetectSection:
    """Tests for section header detection in Polish and UK documents."""

    def test_detects_polish_section_uzasadnienie(self):
        chunker = _make_chunker()
        name, is_key = chunker.detect_section("UZASADNIENIE", language="pl")
        assert name == "Uzasadnienie"
        assert is_key is True

    def test_detects_polish_section_sentencja(self):
        chunker = _make_chunker()
        name, is_key = chunker.detect_section("Sentencja", language="pl")
        assert name == "Sentencja"
        assert is_key is True

    def test_detects_uk_section_judgment(self):
        chunker = _make_chunker()
        name, is_key = chunker.detect_section("JUDGMENT", language="en")
        assert name == "Judgment"
        assert is_key is True

    def test_detects_uk_section_conclusion(self):
        chunker = _make_chunker()
        name, is_key = chunker.detect_section("Conclusion", language="en")
        assert name == "Conclusion"
        assert is_key is True

    def test_returns_none_for_regular_line(self):
        chunker = _make_chunker()
        name, is_key = chunker.detect_section("This is regular text.", language="pl")
        assert name is None
        assert is_key is False

    def test_strips_whitespace_before_matching(self):
        chunker = _make_chunker()
        name, is_key = chunker.detect_section("  UZASADNIENIE  ", language="pl")
        assert name == "Uzasadnienie"

    def test_uses_uk_patterns_for_en_language(self):
        chunker = _make_chunker()
        # Polish pattern should not match when language is "en"
        name, _ = chunker.detect_section("UZASADNIENIE", language="en")
        assert name is None

    def test_uses_polish_patterns_for_pl_language(self):
        chunker = _make_chunker()
        # UK pattern should not match when language is "pl"
        name, _ = chunker.detect_section("JUDGMENT", language="pl")
        assert name is None


# ============================================================================
# Token Counting
# ============================================================================


@pytest.mark.unit
class TestCountTokens:
    """Tests for token counting with tiktoken."""

    def test_counts_tokens_for_simple_text(self):
        chunker = _make_chunker()
        count = chunker.count_tokens("Hello world")
        assert count > 0
        assert isinstance(count, int)

    def test_empty_string_returns_zero(self):
        chunker = _make_chunker()
        assert chunker.count_tokens("") == 0

    def test_longer_text_has_more_tokens(self):
        chunker = _make_chunker()
        short = chunker.count_tokens("Hello")
        long = chunker.count_tokens("Hello world, this is a much longer sentence.")
        assert long > short


# ============================================================================
# Document Chunking
# ============================================================================


@pytest.mark.unit
class TestChunkDocument:
    """Tests for the core chunking logic."""

    def test_empty_text_returns_empty_list(self):
        chunker = _make_chunker()
        assert chunker.chunk_document("", "doc-1") == []

    def test_whitespace_only_returns_empty_list(self):
        chunker = _make_chunker()
        assert chunker.chunk_document("   \n\n  ", "doc-1") == []

    def test_short_text_below_min_chunk_size_returns_empty(self):
        chunker = _make_chunker()
        # Very short text below MIN_CHUNK_SIZE tokens
        result = chunker.chunk_document("Hi", "doc-1")
        assert result == []

    def test_single_chunk_for_moderate_text(self):
        chunker = _make_chunker()
        # Generate enough text to exceed MIN_CHUNK_SIZE but stay under TARGET_CHUNK_SIZE
        text = "To jest przykładowy tekst prawniczy. " * 30
        chunks = chunker.chunk_document(text, "doc-1", language="pl")
        assert len(chunks) >= 1
        assert chunks[0]["document_id"] == "doc-1"
        assert chunks[0]["language"] == "pl"
        assert chunks[0]["chunk_index"] == 0

    def test_chunk_has_required_fields(self):
        chunker = _make_chunker()
        text = "Lorem ipsum dolor sit amet. " * 30
        chunks = chunker.chunk_document(text, "doc-42", language="en")
        assert len(chunks) >= 1
        chunk = chunks[0]
        required_keys = {
            "document_id",
            "chunk_index",
            "chunk_text",
            "chunk_type",
            "section_title",
            "is_key_section",
            "token_count",
            "relevance_weight",
            "language",
        }
        assert required_keys.issubset(set(chunk.keys()))

    def test_large_text_produces_multiple_chunks(self):
        chunker = _make_chunker()
        # Generate text that should exceed TARGET_CHUNK_SIZE.
        # The chunker splits on newlines, so each sentence must be on its own line.
        text = "\n".join(
            ["Sąd Okręgowy rozpatrzył sprawę dotyczącą naruszenia praw autorskich."]
            * 200
        )
        chunks = chunker.chunk_document(text, "doc-big")
        assert len(chunks) > 1

    def test_chunk_indices_are_sequential(self):
        chunker = _make_chunker()
        text = "Legal text about contract dispute and damages. " * 200
        chunks = chunker.chunk_document(text, "doc-seq", language="en")
        indices = [c["chunk_index"] for c in chunks]
        assert indices == list(range(len(chunks)))

    def test_section_header_starts_new_chunk(self):
        chunker = _make_chunker()
        # Build text with a section header in the middle
        before = "Treść wyroku sądowego i uzasadnienie decyzji. " * 30
        after = "Dalsze rozważania sądu na temat sprawy. " * 30
        text = before + "\nUZASADNIENIE\n" + after
        chunks = chunker.chunk_document(text, "doc-section", language="pl")

        # At least one chunk should reference the section
        section_chunks = [c for c in chunks if c["section_title"] == "Uzasadnienie"]
        assert len(section_chunks) > 0

    def test_key_sections_get_higher_relevance_weight(self):
        chunker = _make_chunker()
        text = "Wprowadzenie do sprawy sądowej. " * 20
        text += "\nUZASADNIENIE\n"
        text += "Sąd uzasadnia swoją decyzję następującymi argumentami. " * 30
        chunks = chunker.chunk_document(text, "doc-weight", language="pl")

        key_chunks = [c for c in chunks if c["is_key_section"]]
        non_key_chunks = [c for c in chunks if not c["is_key_section"]]

        if key_chunks and non_key_chunks:
            assert key_chunks[0]["relevance_weight"] == 1.5
            assert non_key_chunks[0]["relevance_weight"] == 1.0

    def test_blank_lines_are_skipped(self):
        chunker = _make_chunker()
        text = "\n\n\nLegal text content here.\n\n\nMore content follows.\n\n\n" * 20
        chunks = chunker.chunk_document(text, "doc-blank")
        # Blank lines should be skipped, not create empty chunks
        for chunk in chunks:
            assert len(chunk["chunk_text"].strip()) > 0


# ============================================================================
# Jurisdiction to Language Mapping
# ============================================================================


@pytest.mark.unit
class TestJurisdictionMapping:
    def test_polish_jurisdiction_maps_to_pl(self):
        assert JURISDICTION_TO_LANGUAGE["PL"] == "pl"

    def test_uk_jurisdiction_maps_to_en(self):
        assert JURISDICTION_TO_LANGUAGE["UK"] == "en"


# ============================================================================
# Save Chunks
# ============================================================================


@pytest.mark.unit
class TestSaveChunks:
    def test_dry_run_returns_count_without_inserting(self):
        chunker = _make_chunker(dry_run=True)
        chunks = [{"document_id": "d1", "chunk_index": 0, "chunk_text": "text"}]
        result = chunker.save_chunks(chunks)
        assert result == 1
        # Supabase insert should NOT have been called
        chunker.supabase.table.assert_not_called()

    def test_empty_chunks_returns_zero(self):
        chunker = _make_chunker()
        assert chunker.save_chunks([]) == 0

    def test_save_chunks_calls_supabase_insert(self):
        chunker = _make_chunker()
        chunks = [
            {
                "document_id": "d1",
                "chunk_index": 0,
                "chunk_text": "text",
                "chunk_type": "paragraph_block",
                "section_title": None,
                "is_key_section": False,
                "token_count": 5,
                "relevance_weight": 1.0,
                "language": "pl",
            }
        ]
        mock_table = MagicMock()
        chunker.supabase.table.return_value = mock_table
        mock_table.insert.return_value.execute.return_value = MagicMock()

        result = chunker.save_chunks(chunks)
        assert result == 1
        chunker.supabase.table.assert_called_with("document_chunks")

    def test_save_chunks_handles_exception(self):
        chunker = _make_chunker()
        chunks = [
            {
                "document_id": "d1",
                "chunk_index": 0,
                "chunk_text": "text",
                "chunk_type": "paragraph_block",
            }
        ]
        chunker.supabase.table.side_effect = RuntimeError("db error")
        result = chunker.save_chunks(chunks)
        assert result == 0

    def test_save_chunks_includes_embedding_when_present(self):
        chunker = _make_chunker()
        chunks = [
            {
                "document_id": "d1",
                "chunk_index": 0,
                "chunk_text": "text",
                "chunk_type": "section",
                "embedding": [0.1, 0.2, 0.3],
            }
        ]
        mock_table = MagicMock()
        chunker.supabase.table.return_value = mock_table
        mock_table.insert.return_value.execute.return_value = MagicMock()

        chunker.save_chunks(chunks)
        insert_args = mock_table.insert.call_args[0][0]
        assert insert_args[0]["embedding"] == [0.1, 0.2, 0.3]


# ============================================================================
# Embedding Generation
# ============================================================================


@pytest.mark.unit
class TestGenerateChunkEmbeddings:
    @pytest.mark.asyncio
    async def test_empty_chunks_returns_empty_list(self):
        chunker = _make_chunker()
        result = await chunker.generate_chunk_embeddings([])
        assert result == []

    @pytest.mark.asyncio
    async def test_generates_embeddings_for_chunks(self):
        chunker = _make_chunker()
        chunker.provider = AsyncMock()
        chunker.provider.embed_texts.return_value = [[0.1, 0.2], [0.3, 0.4]]

        chunks = [
            {"chunk_text": "first chunk"},
            {"chunk_text": "second chunk"},
        ]
        result = await chunker.generate_chunk_embeddings(chunks)
        assert len(result) == 2
        assert result[0] == [0.1, 0.2]
        assert result[1] == [0.3, 0.4]

    @pytest.mark.asyncio
    async def test_retries_on_failure(self):
        chunker = _make_chunker()
        chunker.provider = AsyncMock()
        # Fail twice, then succeed
        chunker.provider.embed_texts.side_effect = [
            RuntimeError("timeout"),
            RuntimeError("timeout"),
            [[0.5, 0.6]],
        ]

        chunks = [{"chunk_text": "retry test"}]
        result = await chunker.generate_chunk_embeddings(chunks)
        assert result[0] == [0.5, 0.6]


# ============================================================================
# Process Document
# ============================================================================


@pytest.mark.unit
class TestProcessDocument:
    @pytest.mark.asyncio
    async def test_empty_full_text_returns_zero(self):
        chunker = _make_chunker()
        result = await chunker.process_document(
            {"id": "d1", "full_text": "", "jurisdiction": "PL"}
        )
        assert result == 0

    @pytest.mark.asyncio
    async def test_missing_full_text_returns_zero(self):
        chunker = _make_chunker()
        result = await chunker.process_document({"id": "d1", "jurisdiction": "PL"})
        assert result == 0


# ============================================================================
# Section Pattern Coverage
# ============================================================================


@pytest.mark.unit
class TestSectionPatterns:
    def test_all_polish_patterns_are_tuples_of_three(self):
        for pattern in POLISH_SECTION_PATTERNS:
            assert len(pattern) == 3
            assert isinstance(pattern[0], str)
            assert isinstance(pattern[1], str)
            assert isinstance(pattern[2], bool)

    def test_all_uk_patterns_are_tuples_of_three(self):
        for pattern in UK_SECTION_PATTERNS:
            assert len(pattern) == 3
            assert isinstance(pattern[0], str)
            assert isinstance(pattern[1], str)
            assert isinstance(pattern[2], bool)
