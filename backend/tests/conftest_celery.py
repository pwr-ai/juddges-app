"""Celery + Supabase + extractor fixtures for eager-mode worker tests."""

from unittest.mock import MagicMock

import pytest


@pytest.fixture
def celery_eager(monkeypatch):
    """Run Celery tasks synchronously inside the test process."""
    from app.workers import celery_app

    monkeypatch.setattr(celery_app.conf, "task_always_eager", True)
    monkeypatch.setattr(celery_app.conf, "task_eager_propagates", True)
    yield celery_app


@pytest.fixture
def mocked_supabase(monkeypatch):
    """Replace the module-level supabase_client with a MagicMock."""
    fake = MagicMock(name="supabase_client")
    fake.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[{"id": "ok"}])
    )
    monkeypatch.setattr("app.core.supabase.supabase_client", fake)
    monkeypatch.setattr("app.workers.supabase_client", fake, raising=False)
    return fake


@pytest.fixture
def mocked_extractor(monkeypatch):
    """Stub the extractor function used inside the Celery task body.

    Based on workers.py analysis, the task creates an InformationExtractor instance
    and calls extract_information_with_structured_output method.
    """
    fake_extractor_instance = MagicMock()
    fake_extractor_instance.extract_information_with_structured_output.return_value = {
        "case_number": "AB-1/2026"
    }

    fake_extractor_class = MagicMock(return_value=fake_extractor_instance)
    monkeypatch.setattr(
        "juddges_search.info_extraction.extractor.InformationExtractor",
        fake_extractor_class,
    )

    # Mock the document fetcher
    fake_document = MagicMock()
    fake_document.full_text = "Sample document text"
    fake_get_documents_by_id = MagicMock(return_value=[fake_document])
    monkeypatch.setattr(
        "app.utils.document_fetcher.get_documents_by_id", fake_get_documents_by_id
    )

    # Mock the LLM
    fake_llm = MagicMock()
    fake_llm.model_name = "test-model"
    fake_get_llm = MagicMock(return_value=fake_llm)
    monkeypatch.setattr("juddges_search.llms.get_llm", fake_get_llm)

    return fake_extractor_instance
