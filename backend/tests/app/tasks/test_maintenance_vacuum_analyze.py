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
    calls = conn.cursor.return_value.execute.call_args_list
    assert [c.args[0] for c in calls] == [
        "SELECT set_config('statement_timeout', %s, false)",
        "VACUUM ANALYZE public.judgments",
    ]
    assert calls[0].args[1] == (maintenance.VACUUM_STATEMENT_TIMEOUT,)
    assert maintenance.VACUUM_STATEMENT_TIMEOUT == "60min"
    conn.close.assert_called_once()


@pytest.mark.unit
def test_vacuum_analyze_skips_without_database_url(monkeypatch) -> None:
    from app.tasks import maintenance

    monkeypatch.delenv("DATABASE_URL", raising=False)

    result = maintenance.vacuum_analyze_judgments.apply().result

    assert result == {"status": "skipped", "reason": "no_database_url"}


@pytest.mark.unit
def test_vacuum_analyze_timeout_env_override(monkeypatch) -> None:
    import importlib

    import psycopg

    from app.tasks import maintenance

    monkeypatch.setenv("VACUUM_STATEMENT_TIMEOUT", "5min")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h/db")
    try:
        importlib.reload(maintenance)
        conn = MagicMock()
        monkeypatch.setattr(psycopg, "connect", MagicMock(return_value=conn))

        maintenance.vacuum_analyze_judgments.apply()

        first = conn.cursor.return_value.execute.call_args_list[0]
        assert first.args[1] == ("5min",)
    finally:
        monkeypatch.delenv("VACUUM_STATEMENT_TIMEOUT")
        importlib.reload(maintenance)


@pytest.mark.unit
def test_vacuum_analyze_failure_raises_picklable_runtime_error(monkeypatch) -> None:
    import pickle

    import psycopg
    from psycopg import errors

    from app.tasks import maintenance

    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h/db")
    conn = MagicMock()
    conn.cursor.return_value.execute.side_effect = [
        None,
        errors.QueryCanceled("canceling statement due to statement timeout"),
    ]
    monkeypatch.setattr(psycopg, "connect", MagicMock(return_value=conn))

    with pytest.raises(RuntimeError, match="QueryCanceled") as info:
        maintenance.vacuum_analyze_judgments.run()

    restored = pickle.loads(pickle.dumps(info.value))  # noqa: S301
    assert isinstance(restored, RuntimeError)
    assert str(restored) == str(info.value)
