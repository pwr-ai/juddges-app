"""
Unit tests for app.evaluations module.

Tests helper functions and endpoints with mocked Supabase and auth.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth import verify_api_key
from app.core.auth_jwt import AuthenticatedUser, get_current_user
from app.evaluations import (
    FieldEvaluation,
    _calculate_accuracy_stats,
    _get_field_evaluations,
    _save_field_evaluations,
)


def _make_user(user_id="user-1"):
    return AuthenticatedUser(
        {"id": user_id, "email": "test@test.com", "role": "authenticated"},
        access_token="tok",
    )


@pytest.fixture
def eval_app():
    from app.server import app

    async def mock_auth():
        return _make_user()

    async def mock_api_key():
        return "test-key"

    app.dependency_overrides[get_current_user] = mock_auth
    app.dependency_overrides[verify_api_key] = mock_api_key
    yield app
    app.dependency_overrides.clear()


# ===== _get_field_evaluations tests =====


@pytest.mark.unit
class TestGetFieldEvaluations:
    @patch("app.evaluations.supabase", None)
    def test_returns_empty_when_no_supabase(self):
        result = _get_field_evaluations("eval-1")
        assert result == []

    @patch("app.evaluations.supabase")
    def test_returns_field_evaluations(self, mock_sb):
        mock_resp = MagicMock()
        mock_resp.data = [
            {
                "field_path": "parties.0.name",
                "field_name": "Party Name",
                "is_correct": True,
                "extracted_value": "ACME Corp",
                "evaluator_notes": "Correct",
            }
        ]
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_resp

        result = _get_field_evaluations("eval-1")
        assert len(result) == 1
        assert result[0].field_path == "parties.0.name"
        assert result[0].is_correct is True

    @patch("app.evaluations.supabase")
    def test_returns_empty_on_exception(self, mock_sb):
        mock_sb.table.side_effect = Exception("db error")
        result = _get_field_evaluations("eval-1")
        assert result == []

    @patch("app.evaluations.supabase")
    def test_returns_empty_when_no_data(self, mock_sb):
        mock_resp = MagicMock()
        mock_resp.data = None
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_resp
        result = _get_field_evaluations("eval-1")
        assert result == []


# ===== _save_field_evaluations tests =====


@pytest.mark.unit
class TestSaveFieldEvaluations:
    @patch("app.evaluations.supabase", None)
    def test_noop_when_no_supabase(self):
        # Should not raise
        _save_field_evaluations(
            "eval-1", [FieldEvaluation(field_path="x", field_name="X", is_correct=True)]
        )

    @patch("app.evaluations.supabase")
    def test_noop_with_empty_list(self, mock_sb):
        _save_field_evaluations("eval-1", [])
        mock_sb.table.assert_not_called()

    @patch("app.evaluations.supabase")
    def test_deletes_existing_then_inserts(self, mock_sb):
        fe = FieldEvaluation(field_path="amount", field_name="Amount", is_correct=False)
        _save_field_evaluations("eval-1", [fe])

        # Should have called delete then insert
        assert mock_sb.table.call_count >= 2

    @patch("app.evaluations.supabase")
    def test_raises_on_error(self, mock_sb):
        mock_sb.table.return_value.delete.side_effect = Exception("delete failed")
        fe = FieldEvaluation(field_path="x", field_name="X", is_correct=True)
        with pytest.raises(Exception, match="delete failed"):
            _save_field_evaluations("eval-1", [fe])


# ===== _calculate_accuracy_stats tests =====


@pytest.mark.unit
class TestCalculateAccuracyStats:
    @patch("app.evaluations.supabase", None)
    def test_returns_zeros_when_no_supabase(self):
        result = _calculate_accuracy_stats("sv-1")
        assert result.total_evaluations == 0
        assert result.accuracy_rate == 0.0

    @patch("app.evaluations.supabase")
    def test_uses_rpc_when_available(self, mock_sb):
        mock_resp = MagicMock()
        mock_resp.data = [
            {
                "total_evaluations": 10,
                "correct_count": 8,
                "incorrect_count": 2,
                "accuracy_rate": 80.0,
                "total_fields_evaluated": 50,
                "correct_fields": 45,
                "field_accuracy_rate": 90.0,
            }
        ]
        mock_sb.rpc.return_value.execute.return_value = mock_resp

        result = _calculate_accuracy_stats("sv-1")
        assert result.total_evaluations == 10
        assert result.correct_count == 8
        assert result.accuracy_rate == 80.0

    @patch("app.evaluations.supabase")
    def test_fallback_when_rpc_fails(self, mock_sb):
        mock_sb.rpc.side_effect = Exception("rpc not found")

        # Fallback queries
        eval_resp = MagicMock()
        eval_resp.data = [
            {"id": "e1", "overall_rating": "correct"},
            {"id": "e2", "overall_rating": "incorrect"},
        ]

        field_resp = MagicMock()
        field_resp.data = [
            {"is_correct": True},
            {"is_correct": True},
            {"is_correct": False},
        ]

        call_idx = {"n": 0}

        def table_side(name):
            call_idx["n"] += 1
            m = MagicMock()
            if call_idx["n"] == 1:
                m.select.return_value.eq.return_value.execute.return_value = eval_resp
            elif call_idx["n"] == 2:
                m.select.return_value.in_.return_value.execute.return_value = field_resp
            return m

        mock_sb.table.side_effect = table_side

        result = _calculate_accuracy_stats("sv-1")
        assert result.total_evaluations == 2
        assert result.correct_count == 1
        assert result.incorrect_count == 1
        assert result.total_fields_evaluated == 3
        assert result.correct_fields == 2

    @patch("app.evaluations.supabase")
    def test_fallback_empty_evaluations(self, mock_sb):
        mock_sb.rpc.side_effect = Exception("rpc not found")

        eval_resp = MagicMock()
        eval_resp.data = []
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value = eval_resp

        result = _calculate_accuracy_stats("sv-1")
        assert result.total_evaluations == 0


# ===== Create evaluation endpoint tests =====


@pytest.mark.unit
class TestCreateEvaluationEndpoint:
    @patch("app.evaluations.supabase")
    async def test_create_evaluation_success(self, mock_sb, eval_app):
        # No existing evaluation
        existing_resp = MagicMock()
        existing_resp.data = []

        # Insert returns the created record
        insert_resp = MagicMock()
        insert_resp.data = [
            {
                "id": "eval-new",
                "schema_version_id": "sv-1",
                "document_id": "d-1",
                "overall_rating": "correct",
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:00:00",
                "extracted_data": {},
            }
        ]

        call_idx = {"n": 0}

        def table_side(name):
            call_idx["n"] += 1
            m = MagicMock()
            if call_idx["n"] == 1:
                m.select.return_value.eq.return_value.eq.return_value.execute.return_value = existing_resp
            elif call_idx["n"] == 2:
                m.insert.return_value.execute.return_value = insert_resp
            return m

        mock_sb.table.side_effect = table_side

        async with AsyncClient(
            transport=ASGITransport(app=eval_app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/evaluations",
                json={
                    "schema_version_id": "sv-1",
                    "document_id": "d-1",
                    "overall_rating": "correct",
                },
            )
        assert response.status_code == 201

    @patch("app.evaluations.supabase")
    async def test_create_evaluation_conflict(self, mock_sb, eval_app):
        existing_resp = MagicMock()
        existing_resp.data = [{"id": "existing-eval"}]
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = existing_resp

        async with AsyncClient(
            transport=ASGITransport(app=eval_app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/evaluations",
                json={
                    "schema_version_id": "sv-1",
                    "document_id": "d-1",
                    "overall_rating": "correct",
                },
            )
        assert response.status_code == 409

    @patch("app.evaluations.supabase", None)
    async def test_create_evaluation_no_db(self, eval_app):
        async with AsyncClient(
            transport=ASGITransport(app=eval_app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/evaluations",
                json={
                    "schema_version_id": "sv-1",
                    "document_id": "d-1",
                    "overall_rating": "correct",
                },
            )
        assert response.status_code == 503


# ===== Get evaluation endpoint tests =====


@pytest.mark.unit
class TestGetEvaluationEndpoint:
    @patch("app.evaluations.supabase", None)
    async def test_get_evaluation_no_db(self, eval_app):
        async with AsyncClient(
            transport=ASGITransport(app=eval_app), base_url="http://test"
        ) as client:
            response = await client.get("/evaluations/eval-1")
        assert response.status_code == 503


# ===== Delete evaluation endpoint tests =====


@pytest.mark.unit
class TestDeleteEvaluationEndpoint:
    @patch("app.evaluations.supabase", None)
    async def test_delete_evaluation_no_db(self, eval_app):
        async with AsyncClient(
            transport=ASGITransport(app=eval_app), base_url="http://test"
        ) as client:
            response = await client.delete("/evaluations/eval-1")
        assert response.status_code == 503

    @patch("app.evaluations.supabase")
    async def test_delete_evaluation_not_found(self, mock_sb, eval_app):
        resp = MagicMock()
        resp.data = None
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = resp

        async with AsyncClient(
            transport=ASGITransport(app=eval_app), base_url="http://test"
        ) as client:
            response = await client.delete("/evaluations/eval-1")
        assert response.status_code == 404

    @patch("app.evaluations.supabase")
    async def test_delete_evaluation_forbidden(self, mock_sb, eval_app):
        """Users cannot delete other users' evaluations."""
        resp = MagicMock()
        resp.data = {"id": "eval-1", "evaluator_user_id": "other-user"}
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = resp

        async with AsyncClient(
            transport=ASGITransport(app=eval_app), base_url="http://test"
        ) as client:
            response = await client.delete("/evaluations/eval-1")
        assert response.status_code == 403


# ===== Update evaluation endpoint tests =====


@pytest.mark.unit
class TestUpdateEvaluationEndpoint:
    @patch("app.evaluations.supabase")
    async def test_update_forbidden_for_non_owner(self, mock_sb, eval_app):
        resp = MagicMock()
        resp.data = {
            "id": "eval-1",
            "evaluator_user_id": "another-user",
        }
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = resp

        async with AsyncClient(
            transport=ASGITransport(app=eval_app), base_url="http://test"
        ) as client:
            response = await client.put(
                "/evaluations/eval-1",
                json={"overall_rating": "incorrect"},
            )
        assert response.status_code == 403


# ===== Auth enforcement tests =====


@pytest.mark.unit
class TestEvaluationAuthEnforcement:
    async def test_create_requires_auth(self):
        from app.server import app

        app.dependency_overrides.clear()

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/evaluations",
                json={
                    "schema_version_id": "sv-1",
                    "document_id": "d-1",
                    "overall_rating": "correct",
                },
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code in [401, 403]
