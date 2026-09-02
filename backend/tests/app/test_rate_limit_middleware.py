"""The global rate-limit backstop.

slowapi only applies ``default_limits`` when SlowAPIMiddleware is installed;
the @limiter.limit decorator path never consults them. Without the
middleware an undecorated route has no limit whatsoever.
"""

from __future__ import annotations

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware


@pytest.mark.unit
def test_middleware_applies_default_limits_to_an_undecorated_route():
    """Proves the mechanism: no decorator, still throttled."""
    limiter = Limiter(
        key_func=lambda request: "fixed-test-key",
        default_limits=["2 per minute"],
        storage_uri="memory://",
    )
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    @app.get("/undecorated")
    async def undecorated():
        return {"ok": True}

    client = TestClient(app)

    assert client.get("/undecorated").status_code == 200
    assert client.get("/undecorated").status_code == 200
    assert client.get("/undecorated").status_code == 429


@pytest.mark.unit
def test_production_app_installs_the_backstop():
    """Regression guard against the middleware being dropped again."""
    from app.server import app

    assert any(
        middleware.cls is SlowAPIMiddleware for middleware in app.user_middleware
    ), "SlowAPIMiddleware is missing — default_limits apply to nothing"


@pytest.mark.unit
def test_a_rate_limited_response_still_carries_cors_headers():
    """Proves the mechanism: CORS must stay outermost of the rate limiter.

    Starlette builds its middleware stack in reverse registration order, so
    the LAST middleware added ends up OUTERMOST. SlowAPIMiddleware is
    BaseHTTPMiddleware-based and short-circuits a 429 without calling
    call_next. If it were registered after (and therefore outside)
    CORSMiddleware, a rate-limited cross-origin response would skip
    CORSMiddleware entirely and arrive with no
    Access-Control-Allow-Origin header — an unreadable network error for the
    caller instead of a readable 429.
    """
    limiter = Limiter(
        key_func=lambda request: "fixed-test-key-cors",
        default_limits=["1 per minute"],
        storage_uri="memory://",
    )
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    # Registration order matters here: SlowAPI first (innermost), CORS last
    # (outermost) — mirrors app/server.py.
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["https://example.test"],
        allow_credentials=True,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.get("/undecorated")
    async def undecorated():
        return {"ok": True}

    client = TestClient(app)
    headers = {"Origin": "https://example.test"}

    ok = client.get("/undecorated", headers=headers)
    assert ok.status_code == 200
    assert ok.headers.get("access-control-allow-origin") == "https://example.test"

    limited = client.get("/undecorated", headers=headers)
    assert limited.status_code == 429
    assert (
        limited.headers.get("access-control-allow-origin") == "https://example.test"
    ), (
        "429 response is missing CORS headers — SlowAPIMiddleware must not be "
        "registered after (outside of) CORSMiddleware"
    )


@pytest.mark.unit
def test_production_app_registers_cors_outermost_of_the_rate_limiter():
    """Regression guard: CORSMiddleware must stay outermost of SlowAPIMiddleware."""
    from app.server import app

    classes = [middleware.cls for middleware in app.user_middleware]
    assert CORSMiddleware in classes, (
        "CORSMiddleware is missing from the production app"
    )
    assert SlowAPIMiddleware in classes, (
        "SlowAPIMiddleware is missing from the production app"
    )

    # app.user_middleware is ordered outermost-first, so CORS must appear
    # earlier in the list (i.e. at a lower index) than SlowAPI.
    assert classes.index(CORSMiddleware) < classes.index(SlowAPIMiddleware), (
        "CORSMiddleware must be registered after SlowAPIMiddleware in "
        "app/server.py so it ends up outermost and a 429 still carries "
        "Access-Control-Allow-Origin"
    )


@pytest.mark.unit
def test_include_router_routes_are_not_covered_by_default_limits():
    """Characterizes a known gap (#574) — this is NOT desired behaviour.

    On the pinned FastAPI, slowapi's route lookup only matches routes
    registered directly on ``app``; routes mounted via ``include_router``
    (most of this API) are not matched and get no default-limit coverage.
    Pins the gap so nobody assumes the backstop protects routes it does not.
    """
    limiter = Limiter(
        key_func=lambda request: "fixed-test-key-gap",
        default_limits=["1 per minute"],
        storage_uri="memory://",
    )
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    @app.get("/direct")
    async def direct():
        return {"ok": True}

    router = APIRouter()

    @router.get("/included")
    async def included():
        return {"ok": True}

    app.include_router(router)

    client = TestClient(app)

    # Registered directly on `app`: covered by default_limits.
    assert client.get("/direct").status_code == 200
    assert client.get("/direct").status_code == 429

    # Mounted via include_router: NOT covered — the gap tracked in #574.
    assert client.get("/included").status_code == 200
    assert client.get("/included").status_code == 200
