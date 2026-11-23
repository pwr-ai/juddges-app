"""Guard test: the paged-results RPC stays backend-only (service_role)."""

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

_MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase/migrations/20261123000003_extraction_job_results_page.sql"
)
_SIGNATURE = r"public\.get_extraction_job_results_page\(\s*text,\s*uuid,\s*int,\s*int,\s*text\s*\)"


def _sql() -> str:
    return _MIGRATION.read_text(encoding="utf-8")


def test_revokes_from_public_anon_and_authenticated() -> None:
    assert re.search(
        rf"REVOKE ALL ON FUNCTION {_SIGNATURE}\s+FROM PUBLIC, anon, authenticated;",
        _sql(),
    )


def test_grants_execute_to_service_role_only() -> None:
    grants = re.findall(rf"GRANT EXECUTE ON FUNCTION {_SIGNATURE}\s+TO (\w+);", _sql())
    assert grants == ["service_role"]


def test_pins_search_path() -> None:
    assert "SET search_path = ''" in _sql()
