"""#191: env validation differentiates dev vs prod; optional warnings demoted."""

import pytest
from loguru import logger

pytestmark = pytest.mark.unit

_HARD_REQUIRED = (
    "BACKEND_API_KEY",
    "OPENAI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
)


def _set_hard_required(monkeypatch):
    for k in _HARD_REQUIRED:
        monkeypatch.setenv(k, "stub")


def _capture(level):
    msgs: list[str] = []
    sink_id = logger.add(lambda m: msgs.append(str(m)), level=level)
    return msgs, sink_id


def test_production_missing_redis_auth_fails_fast(monkeypatch):
    _set_hard_required(monkeypatch)
    monkeypatch.setenv("PYTHON_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/db")
    monkeypatch.delenv("REDIS_AUTH", raising=False)
    monkeypatch.delenv("MEILISEARCH_URL", raising=False)

    from app.server import validate_environment_variables

    with pytest.raises(SystemExit):
        validate_environment_variables()


def test_production_ok_when_prod_required_present(monkeypatch):
    _set_hard_required(monkeypatch)
    monkeypatch.setenv("PYTHON_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/db")
    monkeypatch.setenv("REDIS_AUTH", "secret")
    monkeypatch.delenv("MEILISEARCH_URL", raising=False)

    from app.server import validate_environment_variables

    # Must not raise — all production-required vars present.
    validate_environment_variables()


def test_development_missing_optional_does_not_warn(monkeypatch):
    _set_hard_required(monkeypatch)
    monkeypatch.setenv("PYTHON_ENV", "development")
    monkeypatch.delenv("REDIS_AUTH", raising=False)
    monkeypatch.delenv("MEILISEARCH_SEARCH_KEY", raising=False)

    from app.server import validate_environment_variables

    warnings, sink_id = _capture("WARNING")
    try:
        validate_environment_variables()
    finally:
        logger.remove(sink_id)

    blob = " ".join(warnings)
    assert "REDIS_AUTH" not in blob
    assert "MEILISEARCH_SEARCH_KEY" not in blob
