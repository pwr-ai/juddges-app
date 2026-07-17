"""
Unit tests for the app_events ingestion endpoint (POST /api/events) and the
partition-maintenance Celery task.

Covers:
- Event allowlist enforcement (unknown + DB-trigger-only names → 422).
- auth_signed_out accepted from API-key callers (server-to-server path).
- Batch size and properties size caps.
- user_id stamped from JWT, never accepted in the body (extra="forbid").
- guest_session_id cookie fallback.
- API key requirement.
- roll_app_events_partitions happy path and no-DATABASE_URL skip.
"""

from __future__ import annotations

import os
from typing import Any

import pytest

# Ensure env vars are set before app import.
os.environ.setdefault("BACKEND_API_KEY", "test-api-key-12345")
os.environ.setdefault("SUPABASE_URL", "http://test-supabase.local")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.core.auth_jwt import AuthenticatedUser, get_optional_user
from app.server import app
from app.services.app_events import (
    API_EVENT_ALLOWLIST,
    DB_TRIGGER_ONLY_EVENTS,
    EVENT_ALLOWLIST,
)


@pytest.fixture
def captured_rows(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Capture rows passed to record_app_events instead of hitting Supabase.

    Patches the reference bound in the router module (the BackgroundTasks
    target). ASGITransport runs background tasks before the response returns,
    so captured rows are ready to assert right after the request.
    """
    rows: list[dict[str, Any]] = []
    monkeypatch.setattr("app.api.events.record_app_events", rows.extend)
    return rows


def _payload(event_name: str = "judgment_viewed", **envelope: Any) -> dict[str, Any]:
    return {
        "events": [{"event_name": event_name, "properties": {"document_id": "d1"}}],
        **envelope,
    }


class TestTaxonomyConstants:
    def test_db_trigger_only_events_excluded_from_api_allowlist(self):
        assert DB_TRIGGER_ONLY_EVENTS <= EVENT_ALLOWLIST
        assert not (DB_TRIGGER_ONLY_EVENTS & API_EVENT_ALLOWLIST)
        assert "auth_signed_out" in API_EVENT_ALLOWLIST


class TestTrackEventsEndpoint:
    async def test_valid_event_returns_202_and_records_row(
        self, client, valid_api_headers, captured_rows
    ):
        response = await client.post(
            "/api/events",
            json=_payload(
                session_id="tab-1",
                guest_session_id="guest-1",
                locale="pl",
                app_version="1.3.0",
            ),
            headers=valid_api_headers,
        )
        assert response.status_code == 202
        assert captured_rows == [
            {
                "event_name": "judgment_viewed",
                "user_id": None,
                "guest_session_id": "guest-1",
                "session_id": "tab-1",
                "surface": "web",
                "locale": "pl",
                "app_version": "1.3.0",
                "properties": {"document_id": "d1"},
            }
        ]

    async def test_unknown_event_name_rejected(
        self, client, valid_api_headers, captured_rows
    ):
        response = await client.post(
            "/api/events",
            json=_payload("made_up_event"),
            headers=valid_api_headers,
        )
        assert response.status_code == 422
        assert captured_rows == []

    @pytest.mark.parametrize("event_name", sorted(DB_TRIGGER_ONLY_EVENTS))
    async def test_db_trigger_only_events_rejected_even_with_api_key(
        self, client, valid_api_headers, captured_rows, event_name
    ):
        response = await client.post(
            "/api/events",
            json=_payload(event_name),
            headers=valid_api_headers,
        )
        assert response.status_code == 422
        assert captured_rows == []

    async def test_auth_signed_out_accepted_with_api_key(
        self, client, valid_api_headers, captured_rows
    ):
        response = await client.post(
            "/api/events",
            json={
                "events": [{"event_name": "auth_signed_out", "properties": {}}],
                "surface": "api",
            },
            headers=valid_api_headers,
        )
        assert response.status_code == 202
        assert captured_rows[0]["event_name"] == "auth_signed_out"
        assert captured_rows[0]["surface"] == "api"

    async def test_batch_over_cap_rejected(
        self, client, valid_api_headers, captured_rows
    ):
        events = [{"event_name": "judgment_viewed", "properties": {}}] * 21
        response = await client.post(
            "/api/events", json={"events": events}, headers=valid_api_headers
        )
        assert response.status_code == 422
        assert captured_rows == []

    async def test_empty_batch_rejected(self, client, valid_api_headers):
        response = await client.post(
            "/api/events", json={"events": []}, headers=valid_api_headers
        )
        assert response.status_code == 422

    async def test_properties_size_cap(self, client, valid_api_headers, captured_rows):
        big = {"blob": "x" * 9000}
        response = await client.post(
            "/api/events",
            json={"events": [{"event_name": "judgment_viewed", "properties": big}]},
            headers=valid_api_headers,
        )
        assert response.status_code == 422
        assert captured_rows == []

    async def test_user_id_in_body_rejected(
        self, client, valid_api_headers, captured_rows
    ):
        response = await client.post(
            "/api/events",
            json={
                "events": [
                    {
                        "event_name": "judgment_viewed",
                        "properties": {},
                        "user_id": "attacker-chosen",
                    }
                ]
            },
            headers=valid_api_headers,
        )
        assert response.status_code == 422

        response = await client.post(
            "/api/events",
            json={**_payload(), "user_id": "attacker-chosen"},
            headers=valid_api_headers,
        )
        assert response.status_code == 422
        assert captured_rows == []

    async def test_user_id_stamped_from_jwt(
        self, client, valid_api_headers, captured_rows
    ):
        # get_optional_user calls get_current_user as a plain function, so the
        # conftest get_current_user override does not reach it — override the
        # optional dependency itself.
        async def _user() -> AuthenticatedUser:
            return AuthenticatedUser(
                user_data={
                    "id": "jwt-user-42",
                    "email": "jwt@example.com",
                    "role": "authenticated",
                },
                access_token="test-bearer-token",
            )

        app.dependency_overrides[get_optional_user] = _user
        response = await client.post(
            "/api/events", json=_payload(), headers=valid_api_headers
        )
        assert response.status_code == 202
        assert captured_rows[0]["user_id"] == "jwt-user-42"

    async def test_guest_cookie_fallback(
        self, client, valid_api_headers, captured_rows
    ):
        response = await client.post(
            "/api/events",
            json=_payload(),
            headers=valid_api_headers,
            cookies={"guest_session_id": "cookie-guest"},
        )
        assert response.status_code == 202
        assert captured_rows[0]["guest_session_id"] == "cookie-guest"

    async def test_body_guest_id_wins_over_cookie(
        self, client, valid_api_headers, captured_rows
    ):
        response = await client.post(
            "/api/events",
            json=_payload(guest_session_id="body-guest"),
            headers=valid_api_headers,
            cookies={"guest_session_id": "cookie-guest"},
        )
        assert response.status_code == 202
        assert captured_rows[0]["guest_session_id"] == "body-guest"

    async def test_requires_api_key(self, client, captured_rows):
        response = await client.post("/api/events", json=_payload())
        assert response.status_code in (401, 403)
        assert captured_rows == []

    async def test_invalid_api_key_rejected(
        self, client, invalid_api_headers, captured_rows
    ):
        response = await client.post(
            "/api/events", json=_payload(), headers=invalid_api_headers
        )
        assert response.status_code in (401, 403)
        assert captured_rows == []


class TestRollAppEventsPartitions:
    def test_calls_partition_function_for_current_and_next_month(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        from app.tasks.maintenance import roll_app_events_partitions

        executed: list[str] = []

        class FakeCursor:
            def execute(self, sql: str) -> None:
                executed.append(sql)

            def close(self) -> None:
                pass

        class FakeConn:
            autocommit = False

            def cursor(self) -> FakeCursor:
                return FakeCursor()

            def close(self) -> None:
                pass

        import psycopg

        monkeypatch.setattr(psycopg, "connect", lambda url: FakeConn())
        result = roll_app_events_partitions.apply().get()
        assert result == {"status": "completed"}
        assert len(executed) == 2
        assert all("create_app_events_partition" in sql for sql in executed)
        assert "interval '1 month'" in executed[1]

    def test_skips_without_database_url(self, monkeypatch: pytest.MonkeyPatch):
        from app.tasks.maintenance import roll_app_events_partitions

        monkeypatch.delenv("DATABASE_URL", raising=False)
        result = roll_app_events_partitions.apply().get()
        assert result == {"status": "skipped", "reason": "no_database_url"}
