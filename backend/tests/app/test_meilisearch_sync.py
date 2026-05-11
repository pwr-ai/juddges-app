"""Unit tests for Meilisearch sync: transform function and config setup."""

from datetime import UTC, date, datetime
from uuid import uuid4

from app.services.meilisearch_config import (
    MEILISEARCH_INDEX_SETTINGS,
    transform_judgment_for_meilisearch,
)


class TestTransformJudgmentForMeilisearch:
    def _make_row(self, **overrides):
        """Build a minimal judgments row with sensible defaults."""
        row = {
            "id": uuid4(),
            "case_number": "II CSK 123/25",
            "jurisdiction": "PL",
            "court_name": "Supreme Court",
            "court_level": "Supreme",
            "decision_date": date(2025, 6, 15),
            "publication_date": None,
            "title": "Contract dispute ruling",
            "summary": "A case about contracts.",
            "full_text": "Full judgment text...",
            "judges": [
                {"name": "Jan Kowalski", "role": "presiding"},
                {"name": "Anna Nowak", "role": "reporting"},
            ],
            "case_type": "Civil",
            "decision_type": "Judgment",
            "outcome": "Granted",
            "keywords": ["contract", "civil law"],
            "legal_topics": ["obligations"],
            "cited_legislation": ["Art. 471 KC"],
            "embedding": [0.1] * 1536,
            "metadata": {},
            "source_dataset": "HFforLegal/case-law",
            "source_id": "abc123",
            "source_url": "https://example.com/case/123",
            "created_at": datetime(2025, 1, 1, tzinfo=UTC),
            "updated_at": datetime(2025, 6, 15, tzinfo=UTC),
        }
        row.update(overrides)
        return row

    def test_basic_transform(self):
        row = self._make_row()
        doc = transform_judgment_for_meilisearch(row)

        assert doc["id"] == str(row["id"])
        assert doc["case_number"] == "II CSK 123/25"
        assert doc["jurisdiction"] == "PL"
        assert doc["title"] == "Contract dispute ruling"

    def test_embedding_excluded(self):
        row = self._make_row()
        doc = transform_judgment_for_meilisearch(row)
        assert "embedding" not in doc

    def test_judges_flattened(self):
        row = self._make_row()
        doc = transform_judgment_for_meilisearch(row)

        assert "Jan Kowalski (presiding)" in doc["judges_flat"]
        assert "Anna Nowak (reporting)" in doc["judges_flat"]

    def test_judges_string_list(self):
        row = self._make_row(judges=["Smith", "Jones"])
        doc = transform_judgment_for_meilisearch(row)

        assert doc["judges_flat"] == "Smith, Jones"

    def test_judges_none(self):
        row = self._make_row(judges=None)
        doc = transform_judgment_for_meilisearch(row)

        assert doc["judges_flat"] == ""
        assert doc["judges"] is None

    def test_date_fields_as_strings(self):
        row = self._make_row(decision_date=date(2025, 6, 15))
        doc = transform_judgment_for_meilisearch(row)

        assert doc["decision_date"] == "2025-06-15"

    def test_none_date_stays_none(self):
        row = self._make_row(publication_date=None)
        doc = transform_judgment_for_meilisearch(row)

        assert doc["publication_date"] is None

    def test_array_fields_preserved(self):
        row = self._make_row(keywords=["a", "b"])
        doc = transform_judgment_for_meilisearch(row)

        assert doc["keywords"] == ["a", "b"]

    def test_empty_array_fields(self):
        row = self._make_row(keywords=None, legal_topics=[], cited_legislation=None)
        doc = transform_judgment_for_meilisearch(row)

        assert doc["keywords"] == []
        assert doc["legal_topics"] == []
        assert doc["cited_legislation"] == []

    def test_id_is_string(self):
        uid = uuid4()
        row = self._make_row(id=uid)
        doc = transform_judgment_for_meilisearch(row)

        assert isinstance(doc["id"], str)
        assert doc["id"] == str(uid)


class TestIndexSettings:
    def test_searchable_attributes_order(self):
        """title and case_number should rank higher than full_text."""
        attrs = MEILISEARCH_INDEX_SETTINGS["searchableAttributes"]
        assert attrs.index("title") < attrs.index("full_text")
        assert attrs.index("case_number") < attrs.index("full_text")

    def test_full_text_not_in_displayed(self):
        """full_text should not be returned in search results."""
        displayed = MEILISEARCH_INDEX_SETTINGS["displayedAttributes"]
        assert "full_text" not in displayed

    def test_embedding_not_in_displayed(self):
        """embedding vector should not be returned in search results."""
        displayed = MEILISEARCH_INDEX_SETTINGS["displayedAttributes"]
        assert "embedding" not in displayed

    def test_filterable_attributes(self):
        filterable = MEILISEARCH_INDEX_SETTINGS["filterableAttributes"]
        assert "jurisdiction" in filterable
        assert "decision_date" in filterable

    def test_typo_tolerance_disables_roman_numerals(self):
        typo_cfg = MEILISEARCH_INDEX_SETTINGS["typoTolerance"]
        assert "ii" in typo_cfg["disableOnWords"]


class TestEmbedderSettings:
    def test_embedders_block_registers_bge_m3(self):
        embedders = MEILISEARCH_INDEX_SETTINGS["embedders"]
        assert embedders["bge-m3"]["source"] == "userProvided"
        assert embedders["bge-m3"]["dimensions"] == 1024
