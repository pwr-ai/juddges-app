"""Contracts for jurisdiction-scoped dashboard statistics and caching."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest

from app import dashboard as dashboard_module

if TYPE_CHECKING:
    from httpx import AsyncClient


pytestmark = pytest.mark.unit


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class _FakeQuery:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self._rows)


class _FakeSupabase:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def table(self, name: str) -> _FakeQuery:
        assert name == "dashboard_precomputed_stats"
        return _FakeQuery(self._rows)


class _FakeRedis:
    def __init__(self, cached_data: str | None = None) -> None:
        self.cached_data = cached_data
        self.writes: list[tuple[str, int, str]] = []

    async def get(self, _key: str) -> str | None:
        return self.cached_data

    async def setex(self, key: str, ttl: int, value: str) -> None:
        self.writes.append((key, ttl, value))


@pytest.fixture(autouse=True)
def clear_dashboard_cache():
    dashboard_module._clear_stats_cache()
    yield
    dashboard_module._clear_stats_cache()


@pytest.mark.anyio
@pytest.mark.api
async def test_stats_maps_jurisdiction_years_and_top_courts(
    monkeypatch: pytest.MonkeyPatch,
    authenticated_client: AsyncClient,
):
    rows = [
        {
            "stat_key": "top_courts",
            "stat_value": [
                {"name": "Court PL", "count": 8, "jurisdiction": "PL"},
                {"name": "Court UK", "count": 7, "jurisdiction": "UK"},
            ],
            "computed_at": "2026-08-05T10:00:00Z",
        },
        {
            "stat_key": "decisions_per_year_by_jurisdiction",
            "stat_value": [
                {"year": 2025, "count": 5, "jurisdiction": "PL"},
                {"year": 2025, "count": 4, "jurisdiction": "UK"},
            ],
            "computed_at": "2026-08-05T10:00:00Z",
        },
    ]
    monkeypatch.setattr(dashboard_module, "supabase", _FakeSupabase(rows))
    monkeypatch.setattr(dashboard_module, "REDIS_AVAILABLE", False)

    response = await authenticated_client.get("/dashboard/stats")

    assert response.status_code == 200
    assert response.json()["top_courts"] == rows[0]["stat_value"]
    assert (
        response.json()["decisions_per_year_by_jurisdiction"] == rows[1]["stat_value"]
    )


@pytest.mark.anyio
@pytest.mark.parametrize(
    "payload",
    [
        {"total_judgments": 999},
        {"version": 1, "data": {"total_judgments": 999}},
    ],
)
async def test_cache_rejects_legacy_payload(
    monkeypatch: pytest.MonkeyPatch,
    payload: dict,
):
    redis = _FakeRedis(json.dumps(payload))
    monkeypatch.setattr(dashboard_module, "REDIS_AVAILABLE", True)
    monkeypatch.setattr(dashboard_module, "redis_client", redis)

    cached = await dashboard_module._get_cached_dashboard_stats(
        dashboard_module.DASHBOARD_STATS_CACHE_KEY,
        dashboard_module.datetime.now(dashboard_module.UTC),
    )

    assert cached is None


@pytest.mark.anyio
async def test_cache_round_trip_uses_current_version(
    monkeypatch: pytest.MonkeyPatch,
):
    redis = _FakeRedis()
    monkeypatch.setattr(dashboard_module, "REDIS_AVAILABLE", True)
    monkeypatch.setattr(dashboard_module, "redis_client", redis)
    stats = dashboard_module.DashboardStats(
        total_judgments=9,
        decisions_per_year_by_jurisdiction=[
            {"year": 2025, "count": 9, "jurisdiction": "UK"}
        ],
    )
    now = dashboard_module.datetime.now(dashboard_module.UTC)

    await dashboard_module._update_dashboard_cache(
        dashboard_module.DASHBOARD_STATS_CACHE_KEY, stats, now
    )

    assert len(redis.writes) == 1
    _, _, raw_payload = redis.writes[0]
    payload = json.loads(raw_payload)
    assert payload["version"] == dashboard_module.DASHBOARD_STATS_CACHE_VERSION
    assert payload["data"]["total_judgments"] == 9

    dashboard_module._clear_stats_cache()
    redis.cached_data = raw_payload
    cached = await dashboard_module._get_cached_dashboard_stats(
        dashboard_module.DASHBOARD_STATS_CACHE_KEY, now
    )
    assert cached == stats


def test_migration_scopes_dashboard_stats_and_rpc_permissions():
    migration = (
        Path(__file__).resolve().parents[3]
        / "supabase/migrations/20260805000001_jurisdiction_dashboard_stats.sql"
    ).read_text()

    assert "ROW_NUMBER() OVER" in migration
    assert "PARTITION BY jurisdiction" in migration
    assert "court_rank <= 15" in migration
    assert "'decisions_per_year_by_jurisdiction'" in migration
    assert "GROUP BY yr, jurisdiction" in migration
    assert "SET search_path = public, pg_temp" in migration
    assert (
        "REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_stats() "
        "FROM PUBLIC, anon, authenticated;"
    ) in migration
    assert (
        "GRANT EXECUTE ON FUNCTION public.refresh_dashboard_stats() TO service_role;"
        in migration
    )
