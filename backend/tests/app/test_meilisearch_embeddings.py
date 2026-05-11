"""Unit tests for Meilisearch embedding helpers."""

from unittest.mock import patch

import pytest

from app.services.meilisearch_embeddings import attach_embedding, build_embed_text


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
    async def test_skips_vectors_when_no_text(self):
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
        assert "_vectors" not in result

    @pytest.mark.asyncio
    async def test_embed_failure_returns_doc_without_vectors(self):
        """TEI errors must not propagate — doc still gets indexed (keyword-only)."""
        doc = {"id": "abc"}
        row = {"base_case_name": "Smith"}
        with patch(
            "app.services.meilisearch_embeddings.embed_texts",
            side_effect=RuntimeError("TEI down"),
        ):
            result = await attach_embedding(doc, row)

        assert "_vectors" not in result
