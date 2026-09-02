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


@pytest.mark.unit
def test_email_rate_limit_returns_429_after_exceeding(api, monkeypatch):
    app, invites = api
    monkeypatch.setenv("INVITE_REDEEM_EMAIL_RATE_LIMIT", "2/hour")
    supabase = _client_with_rpc_result(True)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: supabase)
    client = TestClient(app)
    payload = {
        "code": "PILOT-2026",
        "email": "rate-limit-same@example.org",
        "password": "correct horse battery",
    }

    first = client.post("/auth/invites/redeem", json=payload)
    second = client.post("/auth/invites/redeem", json=payload)
    third = client.post("/auth/invites/redeem", json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert third.status_code == 429
    assert third.json()["detail"]["code"] == "INVITE_RATE_LIMIT_EXCEEDED"


@pytest.mark.unit
def test_different_emails_have_independent_budgets(api, monkeypatch):
    app, invites = api
    monkeypatch.setenv("INVITE_REDEEM_EMAIL_RATE_LIMIT", "1/hour")
    supabase = _client_with_rpc_result(True)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: supabase)
    client = TestClient(app)

    exhausted = client.post(
        "/auth/invites/redeem",
        json={
            "code": "PILOT-2026",
            "email": "budget-a@example.org",
            "password": "correct horse battery",
        },
    )
    blocked = client.post(
        "/auth/invites/redeem",
        json={
            "code": "PILOT-2026",
            "email": "budget-a@example.org",
            "password": "correct horse battery",
        },
    )
    other_email = client.post(
        "/auth/invites/redeem",
        json={
            "code": "PILOT-2026",
            "email": "budget-b@example.org",
            "password": "correct horse battery",
        },
    )

    assert exhausted.status_code == 201
    assert blocked.status_code == 429
    assert other_email.status_code == 201


@pytest.mark.unit
def test_rate_limited_attempt_does_not_call_the_rpc(api, monkeypatch):
    app, invites = api
    monkeypatch.setenv("INVITE_REDEEM_EMAIL_RATE_LIMIT", "1/hour")
    client = TestClient(app)
    payload = {
        "code": "PILOT-2026",
        "email": "never-spend-a-code@example.org",
        "password": "correct horse battery",
    }

    first_supabase = _client_with_rpc_result(True)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: first_supabase)
    first = client.post("/auth/invites/redeem", json=payload)
    assert first.status_code == 201

    # Swap in a fresh double so this assertion can only be about the blocked
    # call, not leftover calls from exhausting the budget above.
    second_supabase = _client_with_rpc_result(True)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: second_supabase)
    second = client.post("/auth/invites/redeem", json=payload)

    assert second.status_code == 429
    second_supabase.rpc.assert_not_called()


@pytest.mark.unit
def test_email_normalization_shares_one_bucket(api, monkeypatch):
    app, invites = api
    monkeypatch.setenv("INVITE_REDEEM_EMAIL_RATE_LIMIT", "1/hour")
    supabase = _client_with_rpc_result(True)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: supabase)
    client = TestClient(app)

    first = client.post(
        "/auth/invites/redeem",
        json={
            "code": "PILOT-2026",
            "email": "A@Example.org ",
            "password": "correct horse battery",
        },
    )
    second = client.post(
        "/auth/invites/redeem",
        json={
            "code": "PILOT-2026",
            "email": "a@example.org",
            "password": "correct horse battery",
        },
    )

    assert first.status_code == 201
    assert second.status_code == 429
    assert second.json()["detail"]["code"] == "INVITE_RATE_LIMIT_EXCEEDED"
