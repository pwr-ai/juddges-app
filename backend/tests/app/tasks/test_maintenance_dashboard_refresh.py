"""Scheduled refresh of the precomputed dashboard statistics (#467).

`/statistics` reads `dashboard_precomputed_stats` rather than aggregating the
corpus per request, and nothing refreshed that table on a schedule — the numbers
drifted for three months until a migration happened to recompute them. These
tests pin the schedule, the RPC call, and the cache invalidation that makes a
refresh visible.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest


@pytest.mark.unit
def test_refresh_is_scheduled_and_routed() -> None:
    """A refresh nobody runs is the bug this fixes.

    The queue matters too: `task_routes` maps `maintenance.*` onto the
    `maintenance` queue, which has its own worker, so the refresh cannot end up
    queued behind a long extraction batch.
    """
    from app.workers import celery_app

    entries = [
        entry
        for entry in celery_app.conf.beat_schedule.values()
        if entry["task"] == "maintenance.refresh_dashboard_stats"
    ]
    assert entries, "maintenance.refresh_dashboard_stats is not in beat_schedule"

    entry = entries[0]
    # A run that has not started by the time the next is due is worthless.
    assert entry["options"]["expires"], "a skipped run must not pile up"

    import fnmatch

    queue = celery_app.conf.task_default_queue
    for pattern, route in celery_app.conf.task_routes.items():
        if fnmatch.fnmatch("maintenance.refresh_dashboard_stats", pattern):
            queue = route["queue"]
            break
    assert queue == "maintenance"


@pytest.mark.unit
def test_refresh_calls_the_rpc_and_clears_the_shared_cache(monkeypatch) -> None:
    from app.tasks import maintenance

    supabase = MagicMock()
    monkeypatch.setattr("app.core.supabase.supabase_client", supabase)

    redis_client = MagicMock()
    monkeypatch.setattr("app.services.sync_status._get_redis", lambda: redis_client)

    result = maintenance.refresh_dashboard_stats.apply().result

    assert result["status"] == "completed"
    supabase.rpc.assert_called_once_with("refresh_dashboard_stats")

    # Deleting the versioned key by importing it — rather than re-spelling the
    # literal — is what keeps this working when the cache version is bumped.
    from app.dashboard import (
        DASHBOARD_STATS_CACHE_KEY,
        LEGACY_DASHBOARD_STATS_CACHE_KEY,
    )

    redis_client.delete.assert_called_once_with(
        DASHBOARD_STATS_CACHE_KEY, LEGACY_DASHBOARD_STATS_CACHE_KEY
    )
    assert result["cache_cleared"] is True


@pytest.mark.unit
def test_cache_failure_does_not_fail_the_refresh(monkeypatch) -> None:
    """The rows are already fresh; a stale cache resolves itself at TTL.

    Retrying the whole refresh because Redis blipped would recompute the corpus
    aggregates for nothing.
    """
    from app.tasks import maintenance

    supabase = MagicMock()
    monkeypatch.setattr("app.core.supabase.supabase_client", supabase)

    def exploding_redis():
        raise RuntimeError("connection reset")

    monkeypatch.setattr("app.services.sync_status._get_redis", exploding_redis)

    result = maintenance.refresh_dashboard_stats.apply().result

    assert result["status"] == "completed"
    assert result["cache_cleared"] is False
    supabase.rpc.assert_called_once_with("refresh_dashboard_stats")


@pytest.mark.unit
def test_rpc_failure_propagates(monkeypatch) -> None:
    """A failed refresh must surface so Celery can retry it."""
    from app.tasks import maintenance

    supabase = MagicMock()
    supabase.rpc.side_effect = RuntimeError("function does not exist")
    monkeypatch.setattr("app.core.supabase.supabase_client", supabase)

    outcome = maintenance.refresh_dashboard_stats.apply()

    assert not outcome.successful()


@pytest.mark.unit
def test_missing_supabase_skips_without_calling_the_rpc(monkeypatch) -> None:
    from app.tasks import maintenance

    monkeypatch.setattr("app.core.supabase.supabase_client", None)

    result = maintenance.refresh_dashboard_stats.apply().result

    assert result == {"status": "skipped", "reason": "no_supabase_client"}
