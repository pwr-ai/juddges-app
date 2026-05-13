"""Unit tests for Supabase-backed search topic snapshot helpers."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services.search_topics_store import (
    load_search_topics_run,
    persist_search_topics_run,
    topic_row_to_meilisearch_document,
)


@pytest.mark.unit
class TestPersistSearchTopicsRun:
    def test_inserts_normalized_rows_and_returns_run_id(self, monkeypatch):
        inserted: list[dict] = []
        table = MagicMock()
        table.insert.return_value.execute.side_effect = lambda: inserted.extend(
            table.insert.call_args.args[0]
        )
        supabase = MagicMock()
        supabase.table.return_value = table

        monkeypatch.setattr(
            "app.services.search_topics_store._get_supabase",
            lambda: supabase,
        )

        run_id = persist_search_topics_run(
            [
                {
                    "id": "fraud",
                    "label_pl": "Oszustwo",
                    "label_en": "Fraud",
                    "aliases_pl": ["wyludzenie"],
                    "aliases_en": ["deception"],
                    "category": "fraud",
                    "doc_count": 7,
                    "jurisdictions": ["uk"],
                    "generated_at": "2026-05-13T12:00:00+00:00",
                    "corpus_snapshot": 123,
                }
            ],
            case_type="criminal",
            run_id="run-123",
        )

        assert run_id == "run-123"
        assert len(inserted) == 1
        assert inserted[0]["run_id"] == "run-123"
        assert inserted[0]["source_case_type"] == "criminal"
        assert inserted[0]["doc_count"] == 7


@pytest.mark.unit
class TestLoadSearchTopicsRun:
    def test_uses_latest_run_id_when_none_provided(self, monkeypatch):
        response = MagicMock()
        response.data = [{"id": "fraud", "doc_count": 7}]

        query = MagicMock()
        query.select.return_value = query
        query.eq.return_value = query
        query.order.return_value = query
        query.execute.return_value = response

        supabase = MagicMock()
        supabase.table.return_value = query

        monkeypatch.setattr(
            "app.services.search_topics_store._get_supabase",
            lambda: supabase,
        )
        monkeypatch.setattr(
            "app.services.search_topics_store.get_latest_search_topics_run_id",
            lambda: "run-latest",
        )

        rows = load_search_topics_run()

        assert rows == [{"id": "fraud", "doc_count": 7}]
        query.eq.assert_called_once_with("run_id", "run-latest")


@pytest.mark.unit
class TestTopicRowToMeilisearchDocument:
    def test_projects_only_meili_fields(self):
        doc = topic_row_to_meilisearch_document(
            {
                "run_id": "run-123",
                "id": "fraud",
                "label_pl": "Oszustwo",
                "label_en": "Fraud",
                "aliases_pl": ["wyludzenie"],
                "aliases_en": ["deception"],
                "category": "fraud",
                "doc_count": 7,
                "jurisdictions": ["uk"],
                "generated_at": "2026-05-13T12:00:00+00:00",
                "corpus_snapshot": 123,
                "source_case_type": "criminal",
                "created_at": "2026-05-13T12:01:00+00:00",
            }
        )

        assert doc == {
            "id": "fraud",
            "label_pl": "Oszustwo",
            "label_en": "Fraud",
            "aliases_pl": ["wyludzenie"],
            "aliases_en": ["deception"],
            "category": "fraud",
            "doc_count": 7,
            "jurisdictions": ["uk"],
            "generated_at": "2026-05-13T12:00:00+00:00",
            "corpus_snapshot": 123,
        }
