from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

import pytest

from app.models import BaseSchemaExtractionRequest

results_router_module = importlib.import_module("app.extraction_domain.results_router")


@pytest.fixture
def anyio_backend():
    return "asyncio"


class _FakeJudgmentsQuery:
    def __init__(self, data: dict[str, Any], expected_select: str):
        self._data = data
        self._expected_select = expected_select

    def select(self, fields: str):
        # Enforce the exact projection used by endpoint to catch schema drift.
        assert fields == self._expected_select
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return SimpleNamespace(data=self._data)


class _FakeSupabase:
    def __init__(self, data: dict[str, Any], expected_select: str):
        self._data = data
        self._expected_select = expected_select

    def table(self, name: str):
        assert name == "judgments"
        return _FakeJudgmentsQuery(self._data, self._expected_select)


class _NoopChatOpenAI:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs


@pytest.mark.anyio
async def test_extract_with_base_schema_does_not_crash_on_braced_exception(monkeypatch):
    """Endpoint should return failed result, not 500, when inner error contains braces."""

    class _FailingExtractor:
        def __init__(self, model):
            self.model = model

        async def extract(self, **_kwargs):
            raise RuntimeError(
                "{'message': 'column judgments.language does not exist'}"
            )

        def validate_extraction(self, _data):
            return True, []

    fake_doc = {
        "id": "doc-1",
        "full_text": "Example text",
        "jurisdiction": "UK",
        "court_name": "Court of Appeal",
    }

    monkeypatch.setattr(
        results_router_module,
        "supabase",
        _FakeSupabase(fake_doc, "id, full_text, jurisdiction, court_name"),
    )
    monkeypatch.setattr(results_router_module, "BaseSchemaExtractor", _FailingExtractor)
    monkeypatch.setattr("langchain_openai.ChatOpenAI", _NoopChatOpenAI)

    response = await results_router_module.extract_with_base_schema(
        BaseSchemaExtractionRequest(document_ids=["doc-1"])
    )

    assert response.total_documents == 1
    assert response.successful_extractions == 0
    assert response.failed_extractions == 1
    assert response.results[0].status == "failed"
    assert "column judgments.language does not exist" in (
        response.results[0].error_message or ""
    )


@pytest.mark.anyio
async def test_extract_with_base_schema_maps_language_from_jurisdiction(monkeypatch):
    """Endpoint should pass language hint derived from jurisdiction when language column is absent."""

    class _RecordingExtractor:
        def __init__(self, model):
            self.model = model
            self.last_language = None

        async def extract(self, **kwargs):
            self.last_language = kwargs.get("language")
            return {"case_name": "Sprawa testowa"}, "pl"

        def validate_extraction(self, _data):
            return True, []

    fake_doc = {
        "id": "doc-pl",
        "full_text": "Przykladowy tekst wyroku",
        "jurisdiction": "PL",
        "court_name": "Sąd Apelacyjny",
    }

    extractor = _RecordingExtractor(model=None)

    monkeypatch.setattr(
        results_router_module,
        "supabase",
        _FakeSupabase(fake_doc, "id, full_text, jurisdiction, court_name"),
    )
    monkeypatch.setattr(
        results_router_module, "BaseSchemaExtractor", lambda model: extractor
    )
    monkeypatch.setattr("langchain_openai.ChatOpenAI", _NoopChatOpenAI)

    response = await results_router_module.extract_with_base_schema(
        BaseSchemaExtractionRequest(document_ids=["doc-pl"])
    )

    assert response.successful_extractions == 1
    assert response.failed_extractions == 0
    assert extractor.last_language == "pl"
