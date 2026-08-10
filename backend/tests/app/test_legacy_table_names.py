"""Regression tests for issue #447: legacy Supabase table names.

Three tables the backend used to query do not exist:

* ``legal_documents``  -> ``judgments``
* ``events``           -> ``app_events``
* ``search_queries``   -> ``search_analytics``

The renamed tables also use different column names, so these tests pin both
the physical table name **and** the projection / filter columns of every
query that was remapped. A regression back to a non-existent table or column
fails here instead of silently returning empty admin panels.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.core.auth_jwt import AuthenticatedUser

APP_DIR = Path(__file__).resolve().parents[2] / "app"


# ===== Fake PostgREST client that records what was queried =====


class _FakeResponse:
    def __init__(self, data: list | None = None, count: int = 0) -> None:
        self.data = [] if data is None else data
        self.count = count


class _FakeNot:
    def __init__(self, query: _FakeQuery) -> None:
        self._query = query

    def is_(self, column: str, value: object) -> _FakeQuery:
        return self._query._record_filter("not.is", column)


class _FakeQuery:
    """Chainable stand-in for a postgrest query builder."""

    def __init__(self, client: _FakeClient, table: str, response: _FakeResponse):
        self._client = client
        self._table = table
        self._response = response

    # -- projection / writes --
    def select(self, columns: str = "*", **kwargs: object) -> _FakeQuery:
        self._client.selects.append((self._table, columns))
        return self

    def update(self, payload: dict) -> _FakeQuery:
        self._client.updates.append((self._table, payload))
        return self

    def insert(self, payload: dict) -> _FakeQuery:
        self._client.inserts.append((self._table, payload))
        return self

    def delete(self) -> _FakeQuery:
        self._client.deletes.append(self._table)
        return self

    # -- filters / modifiers --
    def _record_filter(self, op: str, column: str) -> _FakeQuery:
        self._client.filters.append((self._table, op, column))
        return self

    def eq(self, column: str, value: object) -> _FakeQuery:
        return self._record_filter("eq", column)

    def neq(self, column: str, value: object) -> _FakeQuery:
        return self._record_filter("neq", column)

    def gte(self, column: str, value: object) -> _FakeQuery:
        return self._record_filter("gte", column)

    def lte(self, column: str, value: object) -> _FakeQuery:
        return self._record_filter("lte", column)

    def is_(self, column: str, value: object) -> _FakeQuery:
        return self._record_filter("is", column)

    def in_(self, column: str, values: object) -> _FakeQuery:
        return self._record_filter("in", column)

    def order(self, column: str, **kwargs: object) -> _FakeQuery:
        return self._record_filter("order", column)

    def limit(self, count: int) -> _FakeQuery:
        return self

    def range(self, start: int, end: int) -> _FakeQuery:
        return self

    @property
    def not_(self) -> _FakeNot:
        return _FakeNot(self)

    def execute(self) -> _FakeResponse:
        return self._response


class _FakeClient:
    def __init__(self, responses: dict[str, _FakeResponse] | None = None) -> None:
        self.tables: list[str] = []
        self.selects: list[tuple[str, str]] = []
        self.filters: list[tuple[str, str, str]] = []
        self.updates: list[tuple[str, dict]] = []
        self.inserts: list[tuple[str, dict]] = []
        self.deletes: list[str] = []
        self._responses = responses or {}
        self.auth = MagicMock()
        self.auth.admin.list_users.return_value = []

    def table(self, name: str) -> _FakeQuery:
        self.tables.append(name)
        return _FakeQuery(self, name, self._responses.get(name, _FakeResponse()))

    # -- assertion helpers --
    def projections(self, table: str) -> list[str]:
        matches = [cols for name, cols in self.selects if name == table]
        assert matches, f"no select recorded for table {table!r}: {self.selects}"
        return matches

    def projection(self, table: str) -> str:
        matches = self.projections(table)
        assert len(matches) == 1, f"expected one select on {table!r}, got {matches}"
        return matches[0]

    def filter_columns(self, table: str) -> set[str]:
        return {column for name, _op, column in self.filters if name == table}


def _admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        {"id": "admin-1", "email": "admin@test.com", "role": "service_role"},
        access_token="admin-token",
    )


# ===== Source-level guard =====


@pytest.mark.unit
class TestNoLegacyTableReferences:
    """The three legacy names must not reappear anywhere under ``app/``."""

    @pytest.mark.parametrize(
        "needle",
        [
            "legal_documents",
            'table("events")',
            'table("search_queries")',
        ],
    )
    def test_legacy_name_absent_from_backend_sources(self, needle: str) -> None:
        offenders = [
            f"{path.relative_to(APP_DIR)}:{lineno}"
            for path in sorted(APP_DIR.rglob("*.py"))
            for lineno, line in enumerate(
                path.read_text(encoding="utf-8").splitlines(), start=1
            )
            if needle in line
        ]
        assert not offenders, (
            f"{needle!r} refers to a table that does not exist (see #447); "
            f"found at: {offenders}"
        )


# ===== search_queries -> search_analytics =====


@pytest.mark.unit
class TestSearchAnalyticsQueries:
    async def test_platform_stats_counts_searches_on_search_analytics(self) -> None:
        from app.api.admin import get_platform_stats

        client = _FakeClient()
        with patch("app.api.admin.get_admin_supabase_client", return_value=client):
            await get_platform_stats(admin=_admin_user())

        assert "search_analytics" in client.tables
        assert "search_queries" not in client.tables
        # `created_at` is the only timestamp column on search_analytics.
        assert "created_at" in client.filter_columns("search_analytics")

    async def test_admin_search_queries_projection_maps_columns(self) -> None:
        from app.api.admin import get_search_queries

        rows = [
            {
                "id": 7,
                "user_id": None,
                "query": "contract",
                "result_count": 5,
                "filters": 'jurisdiction = "PL"',
                "duration_ms": 12,
                "created_at": "2026-03-10T12:23:41+00:00",
            }
        ]
        client = _FakeClient({"search_analytics": _FakeResponse(rows, count=1)})
        with patch("app.api.admin.get_admin_supabase_client", return_value=client):
            result = await get_search_queries(limit=50, page=1, admin=_admin_user())

        assert client.tables == ["search_analytics", "search_analytics"]
        # First select is the exact count, second is the row projection.
        projection = client.projections("search_analytics")[1]
        # Physical columns aliased back onto the response-model field names.
        assert "result_count:hit_count" in projection
        assert "duration_ms:processing_ms" in projection
        # search_analytics has no session_id column.
        assert "session_id" not in projection

        entry = result.queries[0]
        assert entry.result_count == 5
        assert entry.duration_ms == 12
        assert entry.session_id is None
        # search_analytics.filters is a text filter expression, not JSON.
        assert entry.filters == 'jurisdiction = "PL"'

    async def test_recommendations_read_search_analytics(self) -> None:
        from app import recommendations

        client = _FakeClient()
        with patch.object(recommendations, "get_supabase_client", return_value=client):
            await recommendations._get_search_history_recommendations("user-1")

        assert client.tables == ["search_analytics"]
        assert client.filter_columns("search_analytics") == {"user_id", "created_at"}

    async def test_trending_topics_read_search_analytics(self) -> None:
        from app import research_assistant

        client = _FakeClient()
        with patch.object(
            research_assistant, "get_supabase_client", return_value=client
        ):
            await research_assistant._get_trending_topics("user-1")

        assert client.tables == ["search_analytics"]
        assert client.projection("search_analytics") == "query"


# ===== events -> app_events =====


@pytest.mark.unit
class TestAppEventsQueries:
    async def test_platform_stats_reads_app_events_for_sessions(self) -> None:
        from app.api.admin import get_platform_stats

        client = _FakeClient(
            {"app_events": _FakeResponse([{"session_id": "s1"}, {"session_id": "s1"}])}
        )
        with patch("app.api.admin.get_admin_supabase_client", return_value=client):
            stats = await get_platform_stats(admin=_admin_user())

        assert "app_events" in client.tables
        assert "events" not in client.tables
        assert client.projection("app_events") == "session_id"
        assert stats.active_sessions_24h == 1

    async def test_retention_delete_maps_analytics_to_app_events(self) -> None:
        from app.services.retention_service import RetentionService

        client = _FakeClient()
        await RetentionService._delete_data(client, "user-1", "analytics")

        assert client.tables == ["app_events"]
        assert client.deletes == ["app_events"]

    async def test_retention_export_aliases_event_payload(self) -> None:
        from app.services.retention_service import RetentionService

        client = _FakeClient()
        with patch(
            "app.services.retention_service.get_admin_supabase_client",
            return_value=client,
        ):
            await RetentionService.export_user_data("user-1")

        assert "app_events" in client.tables
        # `properties` is the physical payload column on app_events.
        assert "event_data:properties" in client.projection("app_events")
        # search_analytics has no session_id column.
        assert "session_id" not in client.projection("search_analytics")

    async def test_retention_delete_maps_search_queries_to_search_analytics(
        self,
    ) -> None:
        from app.services.retention_service import RetentionService

        client = _FakeClient()
        await RetentionService._delete_data(client, "user-1", "search_queries")

        assert client.tables == ["search_analytics"]


# ===== legal_documents -> judgments =====


@pytest.mark.unit
class TestJudgmentsQueries:
    async def test_platform_stats_counts_judgments_by_created_at(self) -> None:
        from app.api.admin import get_platform_stats

        client = _FakeClient({"judgments": _FakeResponse(count=42)})
        with patch("app.api.admin.get_admin_supabase_client", return_value=client):
            stats = await get_platform_stats(admin=_admin_user())

        assert client.tables.count("judgments") == 2
        assert client.projections("judgments") == ["id", "id"]
        # `judgments` has no `ingestion_date`; row insert time is `created_at`.
        assert client.filter_columns("judgments") == {"created_at"}
        assert stats.total_documents == 42
        assert stats.documents_added_this_week == 42

    async def test_document_stats_maps_country_and_language(self) -> None:
        from app.api.admin import get_document_stats

        client = _FakeClient(
            {
                "judgments": _FakeResponse(
                    [{"country": "PL", "language": "pl"}], count=12
                )
            }
        )
        with patch("app.api.admin.get_admin_supabase_client", return_value=client):
            await get_document_stats(admin=_admin_user())

        projections = client.projections("judgments")
        # jurisdiction is the country dimension; language lives in metadata JSONB.
        assert "country:jurisdiction" in projections
        assert "language:metadata->>language" in projections
        assert client.filter_columns("judgments") == {"created_at"}

    async def test_topic_modeling_fetch_uses_judgments_columns(self) -> None:
        from app.topic_modeling import (
            TopicModelingRequest,
            _fetch_documents_for_topic_modeling,
        )

        client = _FakeClient()
        db = MagicMock()
        db.client = client

        await _fetch_documents_for_topic_modeling(
            db, TopicModelingRequest(document_types=["Judgment"])
        )

        assert client.tables == ["judgments"]
        projection = client.projection("judgments")
        assert "document_id:id" in projection
        assert "date_issued:decision_date" in projection
        assert "document_type:decision_type" in projection
        # Filters must use the physical column, not the alias.
        assert client.filter_columns("judgments") == {"decision_type"}

    async def test_recent_documents_recommendations_alias_judgments(self) -> None:
        from app import recommendations

        client = _FakeClient(
            {
                "judgments": _FakeResponse(
                    [
                        {
                            "document_id": "d1",
                            "title": "T",
                            "document_type": "Judgment",
                            "date_issued": "2020-01-01",
                            "document_number": "I ACa 1/20",
                            "court_name": "SA",
                            "language": "pl",
                            "summary": "s",
                        }
                    ]
                )
            }
        )
        with patch.object(recommendations, "get_supabase_client", return_value=client):
            items = await recommendations._get_recent_documents()

        assert client.tables == ["judgments"]
        projection = client.projection("judgments")
        for alias in (
            "document_id:id",
            "document_type:decision_type",
            "date_issued:decision_date",
            "document_number:case_number",
            "language:metadata->>language",
        ):
            assert alias in projection
        assert items[0].document_id == "d1"
        assert items[0].language == "pl"

    async def test_citation_network_aliases_references_and_umap(self) -> None:
        from app.judgments_pkg import get_citation_network

        client = _FakeClient()
        db = MagicMock()
        db.client = client

        with patch("app.judgments_pkg.get_vector_db", return_value=db):
            await get_citation_network(sample_size=5, min_shared_refs=1)

        assert client.tables == ["judgments"]
        projection = client.projection("judgments")
        assert "references:legal_topics" in projection
        assert "x:umap_x" in projection
        assert "y:umap_y" in projection
        # The not-null filter must target the physical column.
        assert ("judgments", "not.is", "legal_topics") in client.filters

    async def test_version_history_filters_judgments_by_id(self) -> None:
        from app.versioning import get_version_history

        client = _FakeClient(
            {"judgments": _FakeResponse([{"document_id": "doc-1"}])},
        )
        db = MagicMock()
        db.client = client

        with patch("app.versioning.get_vector_db", return_value=db):
            await get_version_history(document_id="doc-1", limit=50, offset=0)

        assert "judgments" in client.tables
        # `judgments` has no `current_version` column.
        assert "current_version" not in client.projection("judgments")
        assert ("judgments", "eq", "id") in client.filters

    async def test_compute_hashes_updates_judgments_by_id(self) -> None:
        from app.deduplication import compute_hashes

        client = _FakeClient(
            {"judgments": _FakeResponse([{"id": "j1", "full_text": "body"}])}
        )
        db = MagicMock()
        db.client = client

        with patch("app.deduplication.get_vector_db", return_value=db):
            await compute_hashes(limit=10)

        assert set(client.tables) == {"judgments"}
        assert client.projection("judgments") == "id, full_text"
        assert ("judgments", "eq", "id") in client.filters
