"""Unit tests for the per-route request counter (`api_route_rollup`)."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi import APIRouter, FastAPI, HTTPException
from starlette.responses import PlainTextResponse

from app.services import route_rollup as rr
from app.services.route_rollup import RouteRollup, RouteRollupMiddleware


def _build_app(counter: RouteRollup) -> FastAPI:
    app = FastAPI()
    router = APIRouter(prefix="/documents")

    @router.get("/{document_id}")
    async def get_document(document_id: str) -> dict[str, str]:
        return {"id": document_id}

    @router.get("/boom/now")
    async def boom() -> None:
        raise HTTPException(status_code=500, detail="boom")

    app.include_router(router)

    sub = FastAPI()

    @sub.get("/")
    async def sub_root() -> PlainTextResponse:
        return PlainTextResponse("mounted")

    app.mount("/mcp", sub)
    app.add_middleware(RouteRollupMiddleware, counter=counter, enabled=True)
    return app


async def _get(app: FastAPI, *paths: str) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        for path in paths:
            await client.get(path)


@pytest.mark.unit
class TestRouteRollup:
    async def test_counts_by_route_template_not_raw_path(self):
        counter = RouteRollup(interval_seconds=3600)
        await _get(_build_app(counter), "/documents/abc", "/documents/xyz?q=private")

        assert dict(counter._counts) == {"GET /documents/{document_id}": 2}

    async def test_unmatched_paths_are_lumped_not_recorded(self):
        counter = RouteRollup(interval_seconds=3600)
        await _get(_build_app(counter), "/wp-admin/secret-probe")

        assert dict(counter._counts) == {"GET <unmatched>": 1}

    async def test_mounted_sub_app_route_carries_the_mount_prefix(self):
        counter = RouteRollup(interval_seconds=3600)
        await _get(_build_app(counter), "/mcp/")

        assert dict(counter._counts) == {"GET /mcp/": 1}

    async def test_error_responses_still_counted(self):
        counter = RouteRollup(interval_seconds=3600)
        await _get(_build_app(counter), "/documents/boom/now")

        assert dict(counter._counts) == {"GET /documents/boom/now": 1}

    async def test_flushes_in_background_once_window_elapsed(self, monkeypatch):
        emitted: list[tuple[str, dict[str, Any]]] = []
        monkeypatch.setattr(
            rr,
            "emit_app_event_in_background",
            lambda name, **kw: emitted.append((name, kw)),
        )
        counter = RouteRollup(interval_seconds=3600)
        app = _build_app(counter)
        await _get(app, "/documents/a")
        assert emitted == []

        counter.interval_seconds = 0
        await _get(app, "/documents/b")

        assert len(emitted) == 1
        name, kwargs = emitted[0]
        assert name == "api_route_rollup"
        props = kwargs["properties"]
        assert props["counts"] == {"GET /documents/{document_id}": 2}
        assert props["total"] == 2
        assert props["window_start"] < props["window_end"]
        # The counter starts a fresh window after a flush.
        assert dict(counter._counts) == {}

    def test_drain_of_empty_window_emits_nothing(self, monkeypatch):
        calls: list[Any] = []
        monkeypatch.setattr(rr, "emit_app_event", lambda *a, **k: calls.append(a))
        RouteRollup().flush_now()
        assert calls == []

    async def test_disabled_middleware_counts_nothing(self):
        counter = RouteRollup(interval_seconds=3600)
        app = FastAPI()

        @app.get("/x")
        async def x() -> dict:
            return {}

        app.add_middleware(RouteRollupMiddleware, counter=counter, enabled=False)
        await _get(app, "/x")
        assert dict(counter._counts) == {}

    async def test_counter_failure_never_breaks_the_request(self, monkeypatch):
        counter = RouteRollup(interval_seconds=3600)

        def explode(_key: str) -> None:
            raise RuntimeError("counter broke")

        monkeypatch.setattr(counter, "record", explode)
        transport = httpx.ASGITransport(app=_build_app(counter))
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
            response = await c.get("/documents/abc")
        assert response.status_code == 200
