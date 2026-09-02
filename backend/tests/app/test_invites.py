"""Invite redemption endpoint.

The Supabase client is replaced by a double so these stay unit tests: the
behaviour under test is the redeem-then-create ordering and the mapping of
a refused code onto 403, not Supabase itself.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient


def _client_with_rpc_result(redeemed: bool) -> MagicMock:
    """Build a Supabase double whose redeem_invite_code returns `redeemed`."""
    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = MagicMock(data=redeemed)
    return supabase


@pytest.fixture()
def api(monkeypatch):
    from fastapi import FastAPI

    from app.api import invites
    from app.rate_limiter import limiter

    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(invites.router)
    return app, invites


@pytest.mark.unit
def test_valid_code_creates_the_user(api, monkeypatch):
    app, invites = api
    supabase = _client_with_rpc_result(True)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: supabase)

    response = TestClient(app).post(
        "/auth/invites/redeem",
        json={
            "code": "PILOT-2026",
            "email": "jurist@example.org",
            "password": "correct horse battery",
        },
    )

    assert response.status_code == 201
    supabase.auth.admin.create_user.assert_called_once()
    created = supabase.auth.admin.create_user.call_args[0][0]
    assert created["email"] == "jurist@example.org"
    assert created["email_confirm"] is True


@pytest.mark.unit
def test_unknown_or_exhausted_code_is_refused_and_creates_nobody(api, monkeypatch):
    app, invites = api
    supabase = _client_with_rpc_result(False)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: supabase)

    response = TestClient(app).post(
        "/auth/invites/redeem",
        json={
            "code": "NOPE",
            "email": "stranger@example.org",
            "password": "correct horse battery",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "INVALID_INVITE_CODE"
    supabase.auth.admin.create_user.assert_not_called()


@pytest.mark.unit
def test_short_password_is_rejected_before_the_code_is_spent(api, monkeypatch):
    app, invites = api
    supabase = _client_with_rpc_result(True)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: supabase)

    response = TestClient(app).post(
        "/auth/invites/redeem",
        json={
            "code": "PILOT-2026",
            "email": "jurist@example.org",
            "password": "short",
        },
    )

    assert response.status_code == 422
    supabase.rpc.assert_not_called()
