"""Unit tests for Meilisearch embedding helpers."""

from app.services.meilisearch_embeddings import build_embed_text


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
