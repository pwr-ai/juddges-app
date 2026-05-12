"""Unit tests for Meilisearch embedding helpers."""

from unittest.mock import patch

import pytest

from app.services.meilisearch_embeddings import (
    attach_embedding,
    attach_embeddings_batch,
    build_embed_text,
)


class TestBuildEmbedText:
    def test_all_fields_populated(self):
        row = {
            "base_case_name": "Smith v. Jones",
            "base_keywords": ["contract", "breach"],
            "structure_case_identification_summary": "Civil appeal.",
            "structure_facts_summary": "Defendant failed to deliver.",
            "structure_operative_part_summary": "Appeal dismissed.",
        }
        result = build_embed_text(row)
        assert result == (
            "Smith v. Jones\n\n"
            "contract, breach\n\n"
            "Civil appeal.\n\n"
            "Defendant failed to deliver.\n\n"
            "Appeal dismissed."
        )

    def test_partial_fields(self):
        row = {
            "base_case_name": "Smith v. Jones",
            "base_keywords": None,
            "structure_case_identification_summary": None,
            "structure_facts_summary": "Defendant failed to deliver.",
            "structure_operative_part_summary": "",
        }
        result = build_embed_text(row)
        assert result == "Smith v. Jones\n\nDefendant failed to deliver."

    def test_empty_keywords_list_treated_as_none(self):
        row = {
            "base_case_name": "X",
            "base_keywords": [],
            "structure_case_identification_summary": None,
            "structure_facts_summary": None,
            "structure_operative_part_summary": None,
        }
        result = build_embed_text(row)
        assert result == "X"

    def test_whitespace_only_fields_skipped(self):
        row = {
            "base_case_name": "   ",
            "base_keywords": ["k1"],
            "structure_case_identification_summary": "\n\t ",
            "structure_facts_summary": "Real content.",
            "structure_operative_part_summary": None,
        }
        result = build_embed_text(row)
        assert result == "k1\n\nReal content."

    def test_all_empty_returns_none(self):
        row = {
            "base_case_name": None,
            "base_keywords": None,
            "structure_case_identification_summary": None,
            "structure_facts_summary": None,
            "structure_operative_part_summary": None,
        }
        assert build_embed_text(row) is None

    def test_missing_keys_treated_as_none(self):
        assert build_embed_text({}) is None


class TestAttachEmbedding:
    @pytest.mark.asyncio
    async def test_attaches_vectors_when_text_present(self):
        doc = {"id": "abc", "title": "x"}
        row = {
            "base_case_name": "Smith",
            "base_keywords": ["contract"],
            "structure_case_identification_summary": None,
            "structure_facts_summary": None,
            "structure_operative_part_summary": None,
        }
        fake_vec = [0.1] * 1024
        with patch(
            "app.services.meilisearch_embeddings.embed_texts",
            return_value=fake_vec,
        ) as mock_embed:
            result = await attach_embedding(doc, row)

        mock_embed.assert_called_once_with("Smith\n\ncontract")
        assert result is doc
        assert result["_vectors"] == {"bge-m3": fake_vec}

    @pytest.mark.asyncio
    async def test_opts_out_when_no_text(self):
        """No curated text → explicit ``_vectors.bge-m3: null`` opt-out.

        The index registers bge-m3 as ``userProvided``, so docs MUST send
        either a vector or null — omitting the key triggers ``vector_embedding_error``.
        """
        doc = {"id": "abc", "title": "x"}
        row = {
            "base_case_name": None,
            "base_keywords": None,
            "structure_case_identification_summary": None,
            "structure_facts_summary": None,
            "structure_operative_part_summary": None,
        }
        with patch("app.services.meilisearch_embeddings.embed_texts") as mock_embed:
            result = await attach_embedding(doc, row)

        mock_embed.assert_not_called()
        assert result["_vectors"] == {"bge-m3": None}

    @pytest.mark.asyncio
    async def test_embed_failure_opts_doc_out(self):
        """TEI errors must not propagate — doc opts out so keyword search works."""
        doc = {"id": "abc"}
        row = {"base_case_name": "Smith"}
        with patch(
            "app.services.meilisearch_embeddings.embed_texts",
            side_effect=RuntimeError("TEI down"),
        ):
            result = await attach_embedding(doc, row)

        assert result["_vectors"] == {"bge-m3": None}


class TestAttachEmbeddingsBatch:
    @pytest.mark.asyncio
    async def test_single_batch_call_for_all_rows(self):
        docs = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
        rows = [
            {"base_case_name": "A"},
            {"base_case_name": "B"},
            {"base_case_name": "C"},
        ]
        vectors = [[0.1] * 1024, [0.2] * 1024, [0.3] * 1024]
        with patch(
            "app.services.meilisearch_embeddings.embed_texts",
            return_value=vectors,
        ) as mock_embed:
            result = await attach_embeddings_batch(docs, rows)

        mock_embed.assert_called_once_with(["A", "B", "C"])
        assert result[0]["_vectors"] == {"bge-m3": vectors[0]}
        assert result[1]["_vectors"] == {"bge-m3": vectors[1]}
        assert result[2]["_vectors"] == {"bge-m3": vectors[2]}

    @pytest.mark.asyncio
    async def test_mixed_rows_some_opt_out(self):
        docs = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
        rows = [
            {"base_case_name": "A"},
            {"base_case_name": None},
            {"base_case_name": "C"},
        ]
        vectors = [[0.1] * 1024, [0.3] * 1024]
        with patch(
            "app.services.meilisearch_embeddings.embed_texts",
            return_value=vectors,
        ) as mock_embed:
            result = await attach_embeddings_batch(docs, rows)

        mock_embed.assert_called_once_with(["A", "C"])
        assert result[0]["_vectors"] == {"bge-m3": vectors[0]}
        assert result[1]["_vectors"] == {"bge-m3": None}
        assert result[2]["_vectors"] == {"bge-m3": vectors[1]}

    @pytest.mark.asyncio
    async def test_all_rows_empty_no_tei_call(self):
        docs = [{"id": "a"}, {"id": "b"}]
        rows = [{"base_case_name": None}, {"base_case_name": None}]
        with patch("app.services.meilisearch_embeddings.embed_texts") as mock_embed:
            result = await attach_embeddings_batch(docs, rows)

        mock_embed.assert_not_called()
        assert all(d["_vectors"] == {"bge-m3": None} for d in result)

    @pytest.mark.asyncio
    async def test_tei_failure_opts_all_out(self):
        docs = [{"id": "a"}, {"id": "b"}]
        rows = [{"base_case_name": "A"}, {"base_case_name": "B"}]
        with patch(
            "app.services.meilisearch_embeddings.embed_texts",
            side_effect=RuntimeError("TEI down"),
        ):
            result = await attach_embeddings_batch(docs, rows)

        assert all(d["_vectors"] == {"bge-m3": None} for d in result)

    @pytest.mark.asyncio
    async def test_length_mismatch_raises(self):
        with pytest.raises(ValueError, match="same length"):
            await attach_embeddings_batch([{"id": "a"}], [])

    @pytest.mark.asyncio
    async def test_sub_batches_split_large_input(self, monkeypatch):
        # Force a tiny chunk size so we can observe splitting on a small fixture.
        monkeypatch.setattr(
            "app.services.meilisearch_embeddings._TEI_SUB_BATCH_SIZE", 2
        )
        docs = [{"id": "a"}, {"id": "b"}, {"id": "c"}, {"id": "d"}, {"id": "e"}]
        rows = [
            {"base_case_name": "A"},
            {"base_case_name": "B"},
            {"base_case_name": "C"},
            {"base_case_name": "D"},
            {"base_case_name": "E"},
        ]
        calls: list[list[str]] = []

        def fake_embed(payload):
            assert isinstance(payload, list)
            calls.append(list(payload))
            return [[float(len(t))] * 1024 for t in payload]

        with patch(
            "app.services.meilisearch_embeddings.embed_texts",
            side_effect=fake_embed,
        ):
            result = await attach_embeddings_batch(docs, rows)

        assert calls == [["A", "B"], ["C", "D"], ["E"]]
        for d in result:
            assert d["_vectors"]["bge-m3"][0] == 1.0
            assert len(d["_vectors"]["bge-m3"]) == 1024

    @pytest.mark.asyncio
    async def test_sub_batch_failure_isolated_to_slice(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.meilisearch_embeddings._TEI_SUB_BATCH_SIZE", 2
        )
        docs = [{"id": "a"}, {"id": "b"}, {"id": "c"}, {"id": "d"}]
        rows = [
            {"base_case_name": "A"},
            {"base_case_name": "B"},
            {"base_case_name": "C"},
            {"base_case_name": "D"},
        ]

        def fake_embed(payload):
            if payload == ["A", "B"]:
                raise RuntimeError("413")
            return [[0.5] * 1024 for _ in payload]

        with patch(
            "app.services.meilisearch_embeddings.embed_texts",
            side_effect=fake_embed,
        ):
            result = await attach_embeddings_batch(docs, rows)

        assert result[0]["_vectors"] == {"bge-m3": None}
        assert result[1]["_vectors"] == {"bge-m3": None}
        assert result[2]["_vectors"]["bge-m3"] == [0.5] * 1024
        assert result[3]["_vectors"]["bge-m3"] == [0.5] * 1024
