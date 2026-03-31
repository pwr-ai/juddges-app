"""
Unit tests for app.experiments module.

Tests A/B experiment endpoints with mocked auth and database.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.auth_jwt import AuthenticatedUser, get_optional_user


def _make_user(user_id="user-1"):
    return AuthenticatedUser(
        {"id": user_id, "email": "test@test.com", "role": "authenticated"},
        access_token="tok",
    )


@pytest.fixture
def exp_app():
    from app.server import app

    async def mock_auth(credentials=None):
        return _make_user()

    app.dependency_overrides[get_optional_user] = mock_auth
    yield app
    app.dependency_overrides.clear()


# ===== List experiments tests =====


@pytest.mark.unit
class TestListExperiments:
    async def test_requires_auth(self):
        from app.server import app

        app.dependency_overrides.clear()

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/experiments")
        assert response.status_code in [401, 403, 422]

    @patch("app.experiments.get_user_db_client")
    async def test_list_experiments_success(self, mock_db_client, exp_app):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.data = [
            {"id": "exp-1", "name": "Test Experiment", "status": "running"}
        ]
        mock_client.table.return_value.select.return_value.order.return_value.execute.return_value = mock_resp
        mock_db_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.get("/api/experiments")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["experiments"][0]["name"] == "Test Experiment"

    @patch("app.experiments.get_user_db_client")
    async def test_list_experiments_with_status_filter(self, mock_db_client, exp_app):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.data = []
        mock_client.table.return_value.select.return_value.order.return_value.eq.return_value.execute.return_value = mock_resp
        mock_db_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/experiments", params={"status": "completed"}
            )
        assert response.status_code == 200

    @patch("app.experiments.get_user_db_client")
    async def test_list_experiments_db_error(self, mock_db_client, exp_app):
        mock_client = MagicMock()
        mock_client.table.side_effect = Exception("connection error")
        mock_db_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.get("/api/experiments")
        assert response.status_code == 500


# ===== Get experiment tests =====


@pytest.mark.unit
class TestGetExperiment:
    @patch("app.experiments.get_user_db_client")
    async def test_get_experiment_not_found(self, mock_db_client, exp_app):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.data = None
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_resp
        mock_db_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.get("/api/experiments/nonexistent")
        assert response.status_code == 404

    @patch("app.experiments.get_user_db_client")
    async def test_get_experiment_success(self, mock_db_client, exp_app):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.data = {"id": "exp-1", "name": "Test", "status": "running"}
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_resp
        mock_db_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.get("/api/experiments/exp-1")
        assert response.status_code == 200


# ===== Create experiment tests =====


@pytest.mark.unit
class TestCreateExperiment:
    @patch("app.experiments.get_user_db_client")
    async def test_create_experiment_success(self, mock_db_client, exp_app):
        mock_client = MagicMock()
        exp_resp = MagicMock()
        exp_resp.data = [{"id": "new-exp", "name": "New Experiment"}]
        var_resp = MagicMock()
        var_resp.data = [
            {"id": "v1", "name": "Control"},
            {"id": "v2", "name": "Treatment"},
        ]

        call_idx = {"n": 0}

        def table_side(name):
            call_idx["n"] += 1
            m = MagicMock()
            if call_idx["n"] == 1:
                m.insert.return_value.execute.return_value = exp_resp
            elif call_idx["n"] == 2:
                m.insert.return_value.execute.return_value = var_resp
            return m

        mock_client.table.side_effect = table_side
        mock_db_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/experiments",
                json={
                    "name": "New Experiment",
                    "variants": [
                        {"name": "Control", "is_control": True, "weight": 50},
                        {"name": "Treatment", "is_control": False, "weight": 50},
                    ],
                },
            )
        assert response.status_code == 200

    async def test_create_requires_at_least_2_variants(self, exp_app):
        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/experiments",
                json={
                    "name": "Bad Experiment",
                    "variants": [{"name": "Only One"}],
                },
            )
        assert response.status_code == 422

    async def test_create_requires_name(self, exp_app):
        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/experiments",
                json={
                    "name": "",
                    "variants": [
                        {"name": "A", "weight": 50},
                        {"name": "B", "weight": 50},
                    ],
                },
            )
        assert response.status_code == 422


# ===== Update experiment tests =====


@pytest.mark.unit
class TestUpdateExperiment:
    @patch("app.experiments.get_user_db_client")
    async def test_update_with_no_fields_returns_400(self, mock_db_client, exp_app):
        mock_db_client.return_value = MagicMock()

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.patch(
                "/api/experiments/exp-1",
                json={},
            )
        assert response.status_code == 400

    @patch("app.experiments.get_user_db_client")
    async def test_update_not_found(self, mock_db_client, exp_app):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.data = None
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_resp
        mock_db_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.patch(
                "/api/experiments/exp-1",
                json={"name": "Updated"},
            )
        assert response.status_code == 404


# ===== Track event tests =====


@pytest.mark.unit
class TestTrackExperimentEvent:
    @patch("app.experiments.get_user_db_client")
    async def test_track_event_success(self, mock_db_client, exp_app):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.data = [{"id": "event-1"}]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            mock_resp
        )
        mock_db_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/experiments/track",
                json={
                    "experiment_id": "exp-1",
                    "variant_id": "v-1",
                    "event_type": "conversion",
                    "event_value": 42.5,
                },
            )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "tracked"

    async def test_track_event_requires_event_type(self, exp_app):
        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/experiments/track",
                json={
                    "experiment_id": "exp-1",
                    "variant_id": "v-1",
                    "event_type": "",  # empty
                },
            )
        assert response.status_code == 422


# ===== Experiment results tests =====


@pytest.mark.unit
class TestExperimentResults:
    @patch("app.experiments.get_user_db_client")
    async def test_results_not_found(self, mock_db_client, exp_app):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.data = None
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_resp
        mock_db_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.get("/api/experiments/nonexistent/results")
        assert response.status_code == 404

    @patch("app.experiments.get_user_db_client")
    async def test_results_with_data(self, mock_db_client, exp_app):
        mock_client = MagicMock()

        call_idx = {"n": 0}

        def table_side(name):
            call_idx["n"] += 1
            m = MagicMock()
            if call_idx["n"] == 1:
                # experiment
                resp = MagicMock()
                resp.data = {"id": "exp-1", "name": "Test", "status": "running"}
                m.select.return_value.eq.return_value.single.return_value.execute.return_value = resp
            elif call_idx["n"] == 2:
                # variants
                resp = MagicMock()
                resp.data = [
                    {"id": "v1", "name": "Control", "is_control": True},
                    {"id": "v2", "name": "Treatment", "is_control": False},
                ]
                m.select.return_value.eq.return_value.execute.return_value = resp
            elif call_idx["n"] == 3:
                # assignments
                resp = MagicMock()
                resp.data = [
                    {"variant_id": "v1"},
                    {"variant_id": "v1"},
                    {"variant_id": "v2"},
                ]
                m.select.return_value.eq.return_value.execute.return_value = resp
            elif call_idx["n"] == 4:
                # events
                resp = MagicMock()
                resp.data = [
                    {
                        "variant_id": "v1",
                        "event_type": "conversion",
                        "event_value": 10.0,
                    },
                    {"variant_id": "v2", "event_type": "click", "event_value": None},
                ]
                m.select.return_value.eq.return_value.execute.return_value = resp
            return m

        mock_client.table.side_effect = table_side
        mock_db_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=exp_app), base_url="http://test"
        ) as client:
            response = await client.get("/api/experiments/exp-1/results")
        assert response.status_code == 200
        data = response.json()
        assert data["experiment_id"] == "exp-1"
        assert len(data["variants"]) == 2
        assert data["total_participants"] == 3
