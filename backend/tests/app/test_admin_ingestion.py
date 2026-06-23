"""Unit tests for the admin ingestion endpoints (#104).

Auth and the Celery task are mocked so no broker is required.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

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


class TestStartIngestion:
    @patch("app.tasks.ingestion.ingest_judgments_task")
    async def test_submits_task_and_returns_id(self, mock_task, admin_app):
        mock_task.delay.return_value = MagicMock(id="task-123")
        async with await _client(admin_app) as client:
            resp = await client.post(
                "/api/admin/ingestion/start", json={"polish": 100, "uk": 50}
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["task_id"] == "task-123"
        assert body["status"] == "PENDING"
        mock_task.delay.assert_called_once()
        _, kwargs = mock_task.delay.call_args
        assert kwargs["polish"] == 100
        assert kwargs["uk"] == 50

    async def test_rejects_zero_sample_sizes(self, admin_app):
        async with await _client(admin_app) as client:
            resp = await client.post(
                "/api/admin/ingestion/start", json={"polish": 0, "uk": 0}
            )
        assert resp.status_code == 400

    async def test_rejects_skip_both(self, admin_app):
        async with await _client(admin_app) as client:
            resp = await client.post(
                "/api/admin/ingestion/start",
                json={"polish": 10, "skip_polish": True, "skip_uk": True},
            )
        assert resp.status_code == 400

    @patch("app.tasks.ingestion.ingest_judgments_task")
    async def test_broker_failure_returns_503(self, mock_task, admin_app):
        mock_task.delay.side_effect = OSError("broker down")
        async with await _client(admin_app) as client:
            resp = await client.post("/api/admin/ingestion/start", json={"polish": 10})
        assert resp.status_code == 503


class TestIngestionStatus:
    @patch("app.workers.celery_app")
    @patch("celery.result.AsyncResult")
    async def test_progress_state(self, mock_async_result, _app, admin_app):
        result = MagicMock()
        result.state = "PROGRESS"
        result.info = {"completed": 5, "total": 10, "processed": 5}
        mock_async_result.return_value = result

        async with await _client(admin_app) as client:
            resp = await client.get(
                "/api/admin/ingestion/status", params={"task_id": "t1"}
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["state"] == "PROGRESS"
        assert body["progress"]["completed"] == 5
        assert body["result"] is None

    @patch("app.workers.celery_app")
    @patch("celery.result.AsyncResult")
    async def test_success_state(self, mock_async_result, _app, admin_app):
        result = MagicMock()
        result.state = "SUCCESS"
        result.info = {"status": "completed", "total_ingested": 42}
        mock_async_result.return_value = result

        async with await _client(admin_app) as client:
            resp = await client.get(
                "/api/admin/ingestion/status", params={"task_id": "t1"}
            )
        body = resp.json()
        assert body["state"] == "SUCCESS"
        assert body["result"]["total_ingested"] == 42

    @patch("app.workers.celery_app")
    @patch("celery.result.AsyncResult")
    async def test_failure_state(self, mock_async_result, _app, admin_app):
        result = MagicMock()
        result.state = "FAILURE"
        result.info = ValueError("boom")
        mock_async_result.return_value = result

        async with await _client(admin_app) as client:
            resp = await client.get(
                "/api/admin/ingestion/status", params={"task_id": "t1"}
            )
        body = resp.json()
        assert body["state"] == "FAILURE"
        assert "boom" in body["error"]
