"""Unit tests for the judgment ingestion Celery task (#104).

These tests mock Supabase, the embedding HTTP call, and the HuggingFace
``datasets`` dependency so no real broker, database, or network is required.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.tasks import ingestion
from app.tasks.ingestion import JudgmentIngestionPipeline, run_ingestion_pipeline

pytestmark = pytest.mark.unit


def _make_pipeline(**overrides) -> JudgmentIngestionPipeline:
    """Build a pipeline with a mocked Supabase client (no embeddings)."""
    with patch.object(ingestion, "create_client", return_value=MagicMock()):
        return JudgmentIngestionPipeline(
            supabase_url="http://supabase.local",
            supabase_key="key",
            transformers_url=None,  # disable embeddings
            batch_size=overrides.get("batch_size", 50),
            progress_callback=overrides.get("progress_callback"),
        )


# ── transforms ───────────────────────────────────────────────────────────────


class TestTransforms:
    def test_transform_polish_judgment(self):
        pipeline = _make_pipeline()
        raw = {
            "full_text": "Pełny tekst wyroku.",
            "court_name": "Sąd Apelacyjny w Warszawie",
            "department_name": "II Wydział Karny",
            "judges": ["Jan Kowalski"],
            "presiding_judge": "Anna Nowak",
            "keywords": ["kara"],
            "legal_bases": ["art. 1 KK"],
            "docket_number": "II AKa 1/20",
            "judgment_date": "2020-01-15",
            "judgment_id": "abc123",
        }
        doc = pipeline._transform_polish_judgment(raw)
        assert doc is not None
        assert doc["case_number"] == "II AKa 1/20"
        assert doc["jurisdiction"] == "PL"
        assert doc["court_level"] == "Court of Appeal"
        assert doc["decision_date"] == "2020-01-15"
        # presiding judge prepended
        assert doc["judges"][0] == "Anna Nowak"
        # embeddings disabled → None
        assert doc["embedding"] is None

    def test_transform_polish_empty_text_returns_none(self):
        pipeline = _make_pipeline()
        assert pipeline._transform_polish_judgment({"full_text": ""}) is None

    def test_transform_uk_court_raw(self):
        pipeline = _make_pipeline()
        raw = {
            "full_text": "Full UK judgment text.",
            "judges": "Lord Smith, Lady Jones",
            "court_type": "high_court",
            "citation": "[2020] EWHC 1",
            "publication_date": "2020-03-01",
            "judgment_id": "uk123",
        }
        doc = pipeline._transform_uk_judgment(raw, source="JuDDGES/en-court-raw")
        assert doc is not None
        assert doc["case_number"] == "[2020] EWHC 1"
        assert doc["jurisdiction"] == "UK"
        assert doc["court_level"] == "High Court"
        assert doc["judges"] == ["Lord Smith", "Lady Jones"]

    def test_transform_uk_appealcourt(self):
        pipeline = _make_pipeline()
        doc = pipeline._transform_uk_judgment(
            {"context": "Appeal text here."},
            source="JuDDGES/en-appealcourt",
        )
        assert doc is not None
        assert doc["case_number"].startswith("UK-APPEAL-")
        assert doc["court_name"] == "Court of Appeal"

    def test_parse_date_variants(self):
        pipeline = _make_pipeline()
        assert pipeline._parse_date("2020-01-15") == "2020-01-15"
        assert pipeline._parse_date("15/01/2020") == "2020-01-15"
        assert pipeline._parse_date(None) is None
        assert pipeline._parse_date("not-a-date") is None


# ── idempotency / persistence ────────────────────────────────────────────────


class TestIdempotency:
    def test_check_document_exists_true(self):
        pipeline = _make_pipeline()
        exec_mock = MagicMock()
        exec_mock.data = [{"case_number": "X"}]
        pipeline.supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = exec_mock
        assert pipeline.check_document_exists("X") is True

    def test_check_document_exists_false(self):
        pipeline = _make_pipeline()
        exec_mock = MagicMock()
        exec_mock.data = []
        pipeline.supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = exec_mock
        assert pipeline.check_document_exists("X") is False

    def test_insert_judgment_uses_upsert_on_case_number(self):
        pipeline = _make_pipeline()
        exec_mock = MagicMock()
        exec_mock.data = [{"id": "1"}]
        upsert_mock = pipeline.supabase.table.return_value.upsert
        upsert_mock.return_value.execute.return_value = exec_mock

        ok = pipeline._insert_judgment({"case_number": "II AKa 1/20"})
        assert ok is True
        # idempotency contract: upsert with on_conflict=case_number
        _, kwargs = upsert_mock.call_args
        assert kwargs.get("on_conflict") == "case_number"

    def test_process_polish_batch_skips_duplicates(self):
        pipeline = _make_pipeline()
        pipeline.check_document_exists = MagicMock(return_value=True)
        pipeline._insert_judgment = MagicMock(return_value=True)
        pipeline._transform_polish_judgment = MagicMock(
            return_value={"case_number": "DUP"}
        )
        pipeline.save_checkpoint = MagicMock()

        processed = pipeline._process_polish_batch([(1, {})], "polish")
        assert processed == 0
        assert pipeline.stats["duplicates_skipped"] == 1
        pipeline._insert_judgment.assert_not_called()


# ── checkpointing ────────────────────────────────────────────────────────────


class TestCheckpointing:
    def test_save_and_load_checkpoint(self, tmp_path):
        ckpt = tmp_path / "ckpt.json"
        with patch.object(ingestion, "CHECKPOINT_FILE", ckpt):
            pipeline = _make_pipeline()
            pipeline.save_checkpoint("polish", 42, 10)
            assert ckpt.exists()
            data = json.loads(ckpt.read_text())
            assert data["dataset"] == "polish"
            assert data["last_processed_index"] == 42

            loaded = pipeline.load_checkpoint()
            assert loaded is not None
            assert loaded["last_processed_index"] == 42

    def test_clear_checkpoint(self, tmp_path):
        ckpt = tmp_path / "ckpt.json"
        ckpt.write_text("{}")
        with patch.object(ingestion, "CHECKPOINT_FILE", ckpt):
            pipeline = _make_pipeline()
            pipeline.clear_checkpoint()
            assert not ckpt.exists()


# ── progress reporting ───────────────────────────────────────────────────────


def test_progress_callback_invoked():
    events = []
    pipeline = _make_pipeline(progress_callback=events.append)
    pipeline._report(dataset="polish", total=10, completed=5)
    assert events
    assert events[0]["completed"] == 5
    assert events[0]["total"] == 10
    assert "processed" in events[0]


def test_progress_callback_failure_is_swallowed():
    def boom(_):
        raise RuntimeError("nope")

    pipeline = _make_pipeline(progress_callback=boom)
    # must not raise
    pipeline._report(total=1, completed=1)


# ── run_ingestion_pipeline / orchestration ───────────────────────────────────


class TestRunPipeline:
    def test_missing_credentials_raises(self, monkeypatch):
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
        with pytest.raises(RuntimeError, match="Missing SUPABASE"):
            run_ingestion_pipeline(polish=10)

    def test_dispatches_to_both_datasets(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "http://supabase.local")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")

        fake = MagicMock()
        fake.ingest_polish_judgments.return_value = 3
        fake.ingest_uk_judgments.return_value = 2
        fake.stats = {"processed": 5, "duplicates_skipped": 1, "errors": 0}

        with patch.object(ingestion, "JudgmentIngestionPipeline", return_value=fake):
            summary = run_ingestion_pipeline(polish=3, uk=2, no_embeddings=True)

        assert summary["total_ingested"] == 5
        assert summary["status"] == "completed"
        fake.ingest_polish_judgments.assert_called_once_with(
            sample_size=3, resume=False
        )
        fake.ingest_uk_judgments.assert_called_once_with(sample_size=2, resume=False)

    def test_skip_flags_respected(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "http://supabase.local")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")

        fake = MagicMock()
        fake.ingest_polish_judgments.return_value = 1
        fake.ingest_uk_judgments.return_value = 1
        fake.stats = {"processed": 1, "duplicates_skipped": 0, "errors": 0}

        with patch.object(ingestion, "JudgmentIngestionPipeline", return_value=fake):
            run_ingestion_pipeline(polish=5, uk=5, skip_uk=True, no_embeddings=True)

        fake.ingest_polish_judgments.assert_called_once()
        fake.ingest_uk_judgments.assert_not_called()


# ── Celery task wrapper ──────────────────────────────────────────────────────


def test_ingest_judgments_task_calls_pipeline(monkeypatch):
    """The task should delegate to run_ingestion_pipeline and return its summary."""
    summary = {"status": "completed", "total_ingested": 7}
    called = {}

    def fake_run(**kwargs):
        called.update(kwargs)
        return summary

    monkeypatch.setattr(ingestion, "run_ingestion_pipeline", fake_run)

    # Run synchronously, bypassing the broker.
    result = ingestion.ingest_judgments_task.apply(
        kwargs={"polish": 4, "uk": 3, "batch_size": 25}
    )
    assert result.successful()
    assert result.result == summary
    assert called["polish"] == 4
    assert called["uk"] == 3
    assert called["batch_size"] == 25
    # progress_callback is injected by the task
    assert callable(called["progress_callback"])


def test_task_is_registered():
    from app.workers import celery_app

    assert "ingestion.ingest_judgments" in celery_app.tasks
