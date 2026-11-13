"""Guards the Langfuse SDK surface we depend on.

Both code paths swallow exceptions (telemetry must never break search), so an
SDK API removal shows up only as a log warning in production. These tests run
against the real SDK with an unreachable host and fail on that swallowed path.
"""

import importlib

import pytest
from loguru import logger


@pytest.fixture
def langfuse_env(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-dummy")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-dummy")
    monkeypatch.setenv("LANGFUSE_HOST", "http://127.0.0.1:9")
    monkeypatch.setenv("LANGFUSE_TRACING_ENABLED", "true")


@pytest.fixture
def warnings_captured():
    messages: list[str] = []
    sink_id = logger.add(lambda m: messages.append(str(m)), level="WARNING")
    yield messages
    logger.remove(sink_id)


@pytest.mark.unit
def test_record_search_emits_without_swallowed_error(langfuse_env, warnings_captured):
    from app import search_telemetry

    importlib.reload(search_telemetry)
    search_telemetry.record_search(
        query="umowa o pracę",
        query_type="conceptual",
        language="pl",
        hits=2,
        chunks_preview=[{"id": "1", "title": "t"}],
        timing_breakdown={"total_ms": 1.0},
        effective_alpha=0.5,
        alpha_was_routed=True,
        vector_fallback=True,
        fallback_used=True,
        thinking_mode=True,
        error="boom",
    )
    assert search_telemetry._langfuse_client is not None
    failures = [m for m in warnings_captured if "Langfuse telemetry" in m]
    assert not failures, failures


@pytest.mark.unit
def test_callbacks_module_builds_langchain_handler(langfuse_env):
    from juddges_search.chains import callbacks

    importlib.reload(callbacks)
    assert callbacks.langfuse_handler is not None
    assert callbacks.callbacks == [callbacks.langfuse_handler]
