"""Unit tests for Meilisearch sync: transform function and config setup."""

from datetime import UTC, date, datetime
from decimal import Decimal
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

    def test_base_schema_fields_are_emitted(self):
        row = self._make_row(
            base_appellant="offender",
            base_appeal_outcome=["dismissed", "varied_sentence"],
            base_vic_impact_statement=True,
            base_num_victims=3,
            base_offender_job_offence="employed",
            base_case_name="Smith v The Crown",
            base_date_of_appeal_court_judgment=date(2020, 6, 1),
            base_extracted_at=datetime(2026, 5, 12, 10, 30, tzinfo=UTC),
        )
        doc = transform_judgment_for_meilisearch(row)

        assert doc["base_appellant"] == "offender"
        assert doc["base_appeal_outcome"] == ["dismissed", "varied_sentence"]
        assert doc["base_vic_impact_statement"] is True
        assert doc["base_num_victims"] == 3
        assert doc["base_offender_job_offence"] == "employed"
        assert doc["base_case_name"] == "Smith v The Crown"
        assert doc["base_date_of_appeal_court_judgment"] == "2020-06-01"
        assert isinstance(doc["base_extracted_at_ts"], int)
        assert doc["base_extracted_at_ts"] == int(
            datetime(2026, 5, 12, 10, 30, tzinfo=UTC).timestamp()
        )

    def test_decimal_numeric_base_fields_are_coerced(self):
        row = self._make_row(
            base_case_number=Decimal("1234"),
            base_victim_age_offence=Decimal("17.5"),
        )
        doc = transform_judgment_for_meilisearch(row)
        assert isinstance(doc["base_case_number"], int | float)
        assert doc["base_case_number"] == 1234
        assert doc["base_victim_age_offence"] == 17.5

    def test_coerce_numeric_value_list_of_decimals(self):
        # Test list-of-Decimal coercion by passing a list with mixed types
        # Since coerce_numeric_value is nested inside transform_judgment_for_meilisearch,
        # we test it by providing a field that contains a list with Decimals
        row = self._make_row(
            # Use a text[] field that could contain numeric-like values when coerced
            base_offender_gender=[Decimal("30"), Decimal("17.5"), None, "string"]
        )
        doc = transform_judgment_for_meilisearch(row)

        # Verify that the list was processed and Decimals were coerced
        result = doc["base_offender_gender"]
        assert result == [30, 17.5, None, "string"]
        assert isinstance(result[0], int)
        assert isinstance(result[1], float)
        assert result[2] is None
        assert isinstance(result[3], str)


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


class TestMeilisearchIndexSettings:
    def test_filterable_attributes_cover_all_filterable_base_fields(self):
        from app.services.meilisearch_config import MEILISEARCH_INDEX_SETTINGS

        expected = {
            "base_extraction_status",
            "base_extraction_model",
            "base_num_victims",
            "base_victim_age_offence",
            "base_case_number",
            "base_co_def_acc_num",
            "base_date_of_appeal_court_judgment_ts",
            "base_extracted_at_ts",
            "base_appellant",
            "base_plea_point",
            "base_remand_decision",
            "base_offender_job_offence",
            "base_offender_home_offence",
            "base_offender_victim_relationship",
            "base_offender_age_offence",
            "base_victim_type",
            "base_victim_job_offence",
            "base_victim_home_offence",
            "base_pre_sent_report",
            "base_conv_court_names",
            "base_sent_court_name",
            "base_did_offender_confess",
            "base_vic_impact_statement",
            "base_keywords",
            "base_convict_plea_dates",
            "base_convict_offences",
            "base_acquit_offences",
            "base_sentences_received",
            "base_sentence_serve",
            "base_what_ancilliary_orders",
            "base_offender_gender",
            "base_offender_intox_offence",
            "base_victim_gender",
            "base_victim_intox_offence",
            "base_pros_evid_type_trial",
            "base_def_evid_type_trial",
            "base_agg_fact_sent",
            "base_mit_fact_sent",
            "base_appeal_against",
            "base_appeal_ground",
            "base_sent_guide_which",
            "base_appeal_outcome",
            "base_reason_quash_conv",
            "base_reason_sent_excessive",
            "base_reason_sent_lenient",
            "base_reason_dismiss",
        }
        actual = set(MEILISEARCH_INDEX_SETTINGS["filterableAttributes"])
        missing = expected - actual
        assert not missing, f"Missing filterable: {sorted(missing)}"

    def test_searchable_attributes_include_base_text_fields(self):
        from app.services.meilisearch_config import MEILISEARCH_INDEX_SETTINGS

        expected = {
            "base_neutral_citation_number",
            "base_appeal_court_judges_names",
            "base_case_name",
            "base_offender_representative_name",
            "base_crown_attorney_general_representative_name",
            "base_remand_custody_time",
            "base_offender_age_offence",
            "base_offender_mental_offence",
            "base_victim_mental_offence",
        }
        actual = set(MEILISEARCH_INDEX_SETTINGS["searchableAttributes"])
        missing = expected - actual
        assert not missing, f"Missing searchable: {sorted(missing)}"

    def test_sortable_attributes_include_base_ts_and_numerics(self):
        from app.services.meilisearch_config import MEILISEARCH_INDEX_SETTINGS

        for f in (
            "base_date_of_appeal_court_judgment_ts",
            "base_extracted_at_ts",
            "base_num_victims",
            "base_case_number",
        ):
            assert f in MEILISEARCH_INDEX_SETTINGS["sortableAttributes"]

    def test_existing_settings_blocks_preserved(self):
        from app.services.meilisearch_config import MEILISEARCH_INDEX_SETTINGS

        # Sanity: the existing non-base attributes are still there.
        for f in ("title", "summary", "full_text"):
            assert f in MEILISEARCH_INDEX_SETTINGS["searchableAttributes"]
        for f in ("jurisdiction", "court_level", "keywords"):
            assert f in MEILISEARCH_INDEX_SETTINGS["filterableAttributes"]
        for f in ("decision_date", "updated_at", "created_at"):
            assert f in MEILISEARCH_INDEX_SETTINGS["sortableAttributes"]
        # Existing typoTolerance / synonyms / pagination / embedders blocks survive.
        assert "typoTolerance" in MEILISEARCH_INDEX_SETTINGS
        assert "synonyms" in MEILISEARCH_INDEX_SETTINGS
        assert "pagination" in MEILISEARCH_INDEX_SETTINGS
        assert "embedders" in MEILISEARCH_INDEX_SETTINGS
