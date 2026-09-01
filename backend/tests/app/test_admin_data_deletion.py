"""Unit tests for the admin GDPR deletion-request queue (#506).

`RetentionService.process_deletion_request` has existed and been tested since
the retention service landed, but nothing ever called it: a subject could
request erasure, be told in writing it would happen within 30 days, and have
nothing happen. These tests cover the operator surface that makes the promise
keepable.

Auth and Supabase are mocked so no database is required.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.admin import DeletionRequestItem
from app.core.auth_jwt import AuthenticatedUser, require_admin

pytestmark = pytest.mark.unit


def _make_admin_user():
    return AuthenticatedUser(
        {"id": "admin-1", "email": "admin@test.com", "role": "service_role"},
        access_token="admin-token",
    )


@pytest.fixture
def admin_app():
    from app.server import app

    async def mock_require_admin():
        return _make_admin_user()

    app.dependency_overrides[require_admin] = mock_require_admin
    yield app
    app.dependency_overrides.clear()


async def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _mock_supabase_returning(rows):
    """Supabase client whose select chain resolves to `rows`."""
    client = MagicMock()
    chain = client.table.return_value.select.return_value
    chain.eq.return_value.order.return_value.limit.return_value.execute.return_value = (
        MagicMock(data=rows)
    )
    chain.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=rows
    )
    return client


class TestListDeletionRequests:
    @patch("app.api.admin.get_admin_supabase_client")
    async def test_returns_pending_requests(self, mock_client, admin_app):
        mock_client.return_value = _mock_supabase_returning(
            [
                {
                    "id": "req-1",
                    "user_id": "user-1",
                    "request_type": "full_deletion",
                    "data_types": ["audit_logs"],
                    "status": "pending",
                    "created_at": "2026-08-01T00:00:00+00:00",
                    "started_at": None,
                    "completed_at": None,
                    "processed_by": None,
                    "deletion_summary": {},
                    "error_message": None,
                }
            ]
        )

        async with await _client(admin_app) as client:
            resp = await client.get("/api/admin/data-deletion-requests")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["requests"][0]["id"] == "req-1"
        assert body["requests"][0]["status"] == "pending"

    @patch("app.api.admin.get_admin_supabase_client")
    async def test_defaults_to_pending_only(self, mock_client, admin_app):
        client_mock = _mock_supabase_returning([])
        mock_client.return_value = client_mock

        async with await _client(admin_app) as client:
            await client.get("/api/admin/data-deletion-requests")

        client_mock.table.assert_called_with("data_deletion_requests")
        select_chain = client_mock.table.return_value.select.return_value
        select_chain.eq.assert_called_once_with("status", "pending")

    @patch("app.api.admin.get_admin_supabase_client")
    async def test_status_all_does_not_filter(self, mock_client, admin_app):
        client_mock = _mock_supabase_returning([])
        mock_client.return_value = client_mock

        async with await _client(admin_app) as client:
            resp = await client.get("/api/admin/data-deletion-requests?status=all")

        assert resp.status_code == 200
        select_chain = client_mock.table.return_value.select.return_value
        select_chain.eq.assert_not_called()

    @patch("app.api.admin.get_admin_supabase_client")
    async def test_rejects_unknown_status(self, mock_client, admin_app):
        mock_client.return_value = _mock_supabase_returning([])

        async with await _client(admin_app) as client:
            resp = await client.get("/api/admin/data-deletion-requests?status=bogus")

        assert resp.status_code == 422

    @patch("app.api.admin.get_admin_supabase_client")
    async def test_projection_covers_every_response_field(self, mock_client, admin_app):
        """Guard against a dropped column.

        The mock returns whatever rows the test hands it regardless of the
        projection, so a narrowed `.select()` would leave these tests green
        while the real endpoint 500s on the missing key. Assert the projection
        against the response model instead of against the mock.
        """
        client_mock = _mock_supabase_returning([])
        mock_client.return_value = client_mock

        async with await _client(admin_app) as client:
            await client.get("/api/admin/data-deletion-requests")

        selected = client_mock.table.return_value.select.call_args[0][0]
        columns = {c.strip() for c in selected.split(",")}
        assert set(DeletionRequestItem.model_fields) <= columns


class TestProcessDeletionRequest:
    @patch("app.api.admin.RetentionService.process_deletion_request")
    async def test_delegates_to_retention_service_with_admin_identity(
        self, mock_process, admin_app
    ):
        mock_process.return_value = {
            "status": "success",
            "request_id": "req-1",
            "deletion_summary": {"audit_logs": "deleted 12 records"},
            "timestamp": "2026-09-01T00:00:00+00:00",
        }

        async with await _client(admin_app) as client:
            resp = await client.post("/api/admin/data-deletion-requests/req-1/process")

        assert resp.status_code == 200
        body = resp.json()
        assert body["request_id"] == "req-1"
        assert body["deletion_summary"] == {"audit_logs": "deleted 12 records"}
        mock_process.assert_awaited_once_with(
            request_id="req-1", processed_by="admin-1"
        )

    @patch("app.api.admin.RetentionService.process_deletion_request")
    async def test_unknown_request_is_404(self, mock_process, admin_app):
        mock_process.side_effect = ValueError("Deletion request req-x not found")

        async with await _client(admin_app) as client:
            resp = await client.post("/api/admin/data-deletion-requests/req-x/process")

        assert resp.status_code == 404

    @patch("app.api.admin.RetentionService.process_deletion_request")
    async def test_processing_failure_is_500_without_leaking_detail(
        self, mock_process, admin_app
    ):
        mock_process.side_effect = RuntimeError(
            "connection to db-internal.example failed"
        )

        async with await _client(admin_app) as client:
            resp = await client.post("/api/admin/data-deletion-requests/req-1/process")

        assert resp.status_code == 500
        assert "db-internal.example" not in resp.text

    @patch(
        "app.api.admin.RetentionService.process_deletion_request",
        new_callable=AsyncMock,
    )
    async def test_request_id_is_passed_through_verbatim(self, mock_process, admin_app):
        mock_process.return_value = {
            "status": "success",
            "request_id": "550e8400-e29b-41d4-a716-446655440000",
            "deletion_summary": {},
            "timestamp": "2026-09-01T00:00:00+00:00",
        }

        async with await _client(admin_app) as client:
            await client.post(
                "/api/admin/data-deletion-requests/"
                "550e8400-e29b-41d4-a716-446655440000/process"
            )

        mock_process.assert_awaited_once_with(
            request_id="550e8400-e29b-41d4-a716-446655440000",
            processed_by="admin-1",
        )
