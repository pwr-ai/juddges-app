"""vacuum_analyze must use psycopg 3 (psycopg2 is not a dependency)."""

from __future__ import annotations

import sys
from unittest.mock import MagicMock

import pytest


@pytest.mark.unit
def test_vacuum_analyze_uses_psycopg3_autocommit(monkeypatch) -> None:
    import psycopg

    from app.tasks import maintenance

    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h/db")
    monkeypatch.setitem(sys.modules, "psycopg2", None)  # import would fail
    conn = MagicMock()
    connect = MagicMock(return_value=conn)
    monkeypatch.setattr(psycopg, "connect", connect)

    result = maintenance.vacuum_analyze_judgments.apply().result

    assert result == {"status": "completed"}
    connect.assert_called_once_with("postgresql://u:p@h/db", autocommit=True)
    executed = [c.args[0] for c in conn.cursor.return_value.execute.call_args_list]
    assert executed == ["VACUUM ANALYZE public.judgments"]
    conn.close.assert_called_once()


@pytest.mark.unit
def test_vacuum_analyze_skips_without_database_url(monkeypatch) -> None:
    from app.tasks import maintenance

    monkeypatch.delenv("DATABASE_URL", raising=False)

    result = maintenance.vacuum_analyze_judgments.apply().result

    assert result == {"status": "skipped", "reason": "no_database_url"}
