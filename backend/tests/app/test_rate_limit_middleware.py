"""The global rate-limit backstop.

slowapi only applies ``default_limits`` when SlowAPIMiddleware is installed;
the @limiter.limit decorator path never consults them. Without the
middleware an undecorated route has no limit whatsoever. The middleware in
turn cannot see include_router-mounted routes on the pinned FastAPI, which
the ``enforce_default_rate_limits`` dependency covers (#574).
"""

from __future__ import annotations

import pytest
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.rate_limiter import enforce_default_rate_limits


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


def _backstop_app(limit: str, key: str, key_func=None) -> FastAPI:
    """Mirror app/server.py: middleware for direct routes, dependency for the rest."""
    limiter = Limiter(
        key_func=key_func or (lambda request: key),
        default_limits=[limit],
        storage_uri="memory://",
    )
    app = FastAPI(dependencies=[Depends(enforce_default_rate_limits)])
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    @app.get("/direct")
    async def direct():
        return {"ok": True}

    router = APIRouter(prefix="/api")

    @router.get("/included")
    async def included():
        return {"ok": True}

    @router.get("/decorated")
    @limiter.limit("3 per minute")
    async def decorated(request: Request):
        return {"ok": True}

    @router.get("/exempt")
    @limiter.exempt
    async def exempt():
        return {"ok": True}

    app.include_router(router)
    return app


@pytest.mark.unit
def test_include_router_routes_are_covered_by_default_limits(monkeypatch):
    """#574: a router-mounted, undecorated route is throttled by default_limits."""
    monkeypatch.setenv("RATE_LIMIT_ROUTER_BACKSTOP", "true")
    client = TestClient(_backstop_app("2 per minute", "backstop-included"))

    codes = [client.get("/api/included").status_code for _ in range(4)]

    assert codes == [200, 200, 429, 429]


@pytest.mark.unit
def test_direct_routes_are_charged_once_not_twice(monkeypatch):
    """Middleware and dependency both see a direct route; only one may charge it."""
    monkeypatch.setenv("RATE_LIMIT_ROUTER_BACKSTOP", "true")
    client = TestClient(_backstop_app("2 per minute", "backstop-direct"))

    codes = [client.get("/direct").status_code for _ in range(3)]

    assert codes == [200, 200, 429]


@pytest.mark.unit
def test_decorated_and_exempt_router_routes_keep_their_own_rules(monkeypatch):
    """An explicit @limiter.limit replaces the defaults; @limiter.exempt skips them."""
    monkeypatch.setenv("RATE_LIMIT_ROUTER_BACKSTOP", "true")
    client = TestClient(_backstop_app("1 per minute", "backstop-rules"))

    decorated = [client.get("/api/decorated").status_code for _ in range(4)]
    exempt = [client.get("/api/exempt").status_code for _ in range(3)]

    assert decorated == [200, 200, 200, 429]
    assert exempt == [200, 200, 200]


@pytest.mark.unit
def test_router_backstop_can_be_explicitly_disabled(monkeypatch):
    """Only a deliberate development override disables router protection."""
    monkeypatch.setenv("RATE_LIMIT_ROUTER_BACKSTOP", "false")
    client = TestClient(_backstop_app("1 per minute", "backstop-off"))

    codes = [client.get("/api/included").status_code for _ in range(3)]

    assert codes == [200, 200, 200]


@pytest.mark.unit
def test_production_app_charges_default_limits_on_router_routes():
    """The real app wires the dependency so a router-mounted route is reachable by it."""
    from app.server import app

    assert any(
        dep.dependency is enforce_default_rate_limits for dep in app.router.dependencies
    ), "enforce_default_rate_limits is not an app-wide dependency (#574)"


@pytest.mark.unit
@pytest.mark.parametrize(
    "identity_header", ["X-RateLimit-Identity", "X-RateLimit-Client-IP"]
)
def test_real_429_limits_are_isolated_for_verified_visitors(
    monkeypatch, identity_header
):
    from app.rate_limiter import get_client_ip

    monkeypatch.delenv("RATE_LIMIT_ROUTER_BACKSTOP", raising=False)
    monkeypatch.setenv("BACKEND_API_KEY", "bff-service-key")
    client = TestClient(_backstop_app("1 per minute", "unused", key_func=get_client_ip))
    visitors = (
        ("a" * 64, "b" * 64)
        if identity_header.endswith("Identity")
        else ("192.0.2.1", "192.0.2.2")
    )
    first = {"X-API-Key": "bff-service-key", identity_header: visitors[0]}
    second = {"X-API-Key": "bff-service-key", identity_header: visitors[1]}

    assert client.get("/api/included", headers=first).status_code == 200
    assert client.get("/api/included", headers=first).status_code == 429
    assert client.get("/api/included", headers=second).status_code == 200
    assert client.get("/api/included", headers=second).status_code == 429


@pytest.mark.unit
def test_spoofed_identity_cannot_rotate_the_rate_limit_bucket(monkeypatch):
    from app.rate_limiter import get_client_ip

    monkeypatch.delenv("RATE_LIMIT_ROUTER_BACKSTOP", raising=False)
    monkeypatch.setenv("BACKEND_API_KEY", "bff-service-key")
    monkeypatch.setenv("TRUSTED_PROXY", "false")
    client = TestClient(_backstop_app("1 per minute", "unused", key_func=get_client_ip))
    assert (
        client.get(
            "/api/included", headers={"X-RateLimit-Identity": "a" * 64}
        ).status_code
        == 200
    )
    assert (
        client.get(
            "/api/included", headers={"X-RateLimit-Identity": "b" * 64}
        ).status_code
        == 429
    )
