"""Unit tests for Meilisearch sync: transform function and config setup."""

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.meilisearch_config import (
    JUDGMENT_SYNC_COLUMNS,
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


class TestSyncColumnProjection:
    def test_includes_curated_embedding_fields(self):
        for col in (
            "base_case_name",
            "base_keywords",
            "structure_case_identification_summary",
            "structure_facts_summary",
            "structure_operative_part_summary",
        ):
            assert col in JUDGMENT_SYNC_COLUMNS, f"missing column: {col}"

    def test_includes_existing_core_fields(self):
        # Regression: don't lose any field already required by the sync path
        for col in ("id", "title", "summary", "full_text", "base_extraction_status"):
            assert col in JUDGMENT_SYNC_COLUMNS


def _run_coro(coro):
    import asyncio

    return asyncio.new_event_loop().run_until_complete(coro)


class TestIncrementalSyncEmbeds:
    def _make_row(self, **overrides):
        row = {
            "id": uuid4(),
            "case_number": "II CSK 1/25",
            "jurisdiction": "PL",
            "court_name": "X",
            "court_level": "S",
            "decision_date": None,
            "publication_date": None,
            "title": "t",
            "summary": "s",
            "full_text": None,
            "judges": None,
            "case_type": None,
            "decision_type": None,
            "outcome": None,
            "keywords": None,
            "legal_topics": None,
            "cited_legislation": None,
            "source_url": None,
            "created_at": None,
            "updated_at": None,
            "base_extraction_status": "completed",
            "base_num_victims": None,
            "base_victim_age_offence": None,
            "base_case_number": None,
            "base_co_def_acc_num": None,
            "base_date_of_appeal_court_judgment": None,
            "base_case_name": "Smith v. Jones",
            "base_keywords": ["contract"],
            "structure_case_identification_summary": None,
            "structure_facts_summary": None,
            "structure_operative_part_summary": None,
        }
        row.update(overrides)
        return row

    def test_upsert_payload_includes_vectors(self):
        from app.tasks.meilisearch_sync import sync_judgment_to_meilisearch

        row = self._make_row()
        row_id = str(row["id"])
        fake_vec = [0.5] * 1024

        sb = MagicMock()
        sb.table().select().eq().execute.return_value = MagicMock(data=[row])

        service = MagicMock()
        service.admin_configured = True
        service.upsert_documents = AsyncMock(return_value={"taskUid": 1})

        with (
            patch("app.tasks.meilisearch_sync.supabase_client", sb),
            patch("app.tasks.meilisearch_sync._get_service", return_value=service),
            patch(
                "app.services.meilisearch_embeddings.embed_texts",
                return_value=fake_vec,
            ),
            patch("asyncio.run", side_effect=lambda c: _run_coro(c)),
        ):
            sync_judgment_to_meilisearch.run(row_id, "upsert")

        sent_docs = service.upsert_documents.call_args.args[0]
        assert len(sent_docs) == 1
        assert sent_docs[0]["_vectors"] == {"bge-m3": fake_vec}


class TestFullSyncEmbeds:
    def test_each_batch_doc_gets_vectors(self):
        from app.tasks.meilisearch_sync import full_sync_judgments_to_meilisearch

        rows = [
            {
                "id": uuid4(),
                "case_number": f"C{i}",
                "jurisdiction": "PL",
                "court_name": None,
                "court_level": None,
                "decision_date": None,
                "publication_date": None,
                "title": "t",
                "summary": "s",
                "full_text": None,
                "judges": None,
                "case_type": None,
                "decision_type": None,
                "outcome": None,
                "keywords": None,
                "legal_topics": None,
                "cited_legislation": None,
                "source_url": None,
                "created_at": None,
                "updated_at": None,
                "base_extraction_status": "completed",
                "base_num_victims": None,
                "base_victim_age_offence": None,
                "base_case_number": None,
                "base_co_def_acc_num": None,
                "base_date_of_appeal_court_judgment": None,
                "base_case_name": f"Case {i}",
                "base_keywords": ["k"],
                "structure_case_identification_summary": None,
                "structure_facts_summary": None,
                "structure_operative_part_summary": None,
            }
            for i in range(3)
        ]
        fake_vec = [0.1] * 1024
        batch_vectors = [fake_vec, fake_vec, fake_vec]

        sb = MagicMock()
        sb.table().select().order().range().execute.side_effect = [
            MagicMock(data=rows),
            MagicMock(data=[]),  # second page empty → loop exits
        ]

        service = MagicMock()
        service.admin_configured = True
        service.upsert_documents = AsyncMock(return_value={"taskUid": 7})
        service.wait_for_task = AsyncMock(return_value={"status": "succeeded"})

        embed_mock = MagicMock(return_value=batch_vectors)

        with (
            patch("app.tasks.meilisearch_sync.supabase_client", sb),
            patch("app.tasks.meilisearch_sync._get_service", return_value=service),
            patch("app.services.meilisearch_embeddings.embed_texts", embed_mock),
            patch("app.tasks.meilisearch_sync.record_sync_completed"),
            patch("asyncio.run", side_effect=lambda c: _run_coro(c)),
            patch.object(full_sync_judgments_to_meilisearch, "update_state"),
        ):
            full_sync_judgments_to_meilisearch.run(batch_size=3)

        # One batched TEI call per page, not one per doc
        embed_mock.assert_called_once()
        sent_docs = service.upsert_documents.call_args.args[0]
        assert len(sent_docs) == 3
        for doc in sent_docs:
            assert doc["_vectors"] == {"bge-m3": fake_vec}
