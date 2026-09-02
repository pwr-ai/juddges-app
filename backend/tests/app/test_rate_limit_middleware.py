"""The global rate-limit backstop.

slowapi only applies ``default_limits`` when SlowAPIMiddleware is installed;
the @limiter.limit decorator path never consults them. Without the
middleware an undecorated route has no limit whatsoever.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
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
