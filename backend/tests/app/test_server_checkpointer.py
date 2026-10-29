"""Startup wiring of the LangGraph checkpointer in `_app_lifespan`.

No Supabase migration creates the checkpoint tables, so the lifespan must call
`AsyncPostgresSaver.setup()` before handing the saver to the app. If that fails
the app falls back to the in-memory saver instead of refusing to start.
"""

from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from langgraph.checkpoint.memory import MemorySaver

from app import server


def _patched_startup(stack: ExitStack, saver: MagicMock) -> MagicMock:
    """Stub everything in the lifespan except the checkpointer branch."""
    stack.enter_context(
        patch.dict("os.environ", {"DATABASE_URL": "postgresql://u:p@db:5432/x"})
    )
    stack.enter_context(patch.object(server, "validate_environment_variables"))
    stack.enter_context(patch.object(server, "setup_langchain_cache"))

    test_conn = AsyncMock()
    stack.enter_context(
        patch("psycopg.AsyncConnection.connect", AsyncMock(return_value=test_conn))
    )
    pool = MagicMock(open=AsyncMock(), close=AsyncMock())
    stack.enter_context(
        patch.object(server, "AsyncConnectionPool", MagicMock(return_value=pool))
    )
    stack.enter_context(
        patch.object(server, "AsyncPostgresSaver", MagicMock(return_value=saver))
    )
    # Optional, non-fatal steps: make them fail fast instead of reaching out.
    stack.enter_context(
        patch(
            "app.services.search.MeiliSearchService.from_env",
            side_effect=RuntimeError("no meili in unit tests"),
        )
    )
    stack.enter_context(
        patch(
            "app.embedding_providers.get_default_model_id",
            side_effect=RuntimeError("no embedder in unit tests"),
        )
    )
    return pool


@pytest.mark.unit
async def test_postgres_checkpointer_runs_setup_before_use():
    saver = MagicMock(setup=AsyncMock())
    app = FastAPI()

    with ExitStack() as stack:
        pool = _patched_startup(stack, saver)
        async with server._app_lifespan(app):
            saver.setup.assert_awaited_once_with()
            assert app.state.checkpointer is saver

    pool.close.assert_awaited_once()


@pytest.mark.unit
async def test_checkpointer_setup_failure_falls_back_to_memory():
    saver = MagicMock(setup=AsyncMock(side_effect=RuntimeError("permission denied")))
    app = FastAPI()

    with ExitStack() as stack:
        pool = _patched_startup(stack, saver)
        async with server._app_lifespan(app):
            assert isinstance(app.state.checkpointer, MemorySaver)
            pool.close.assert_awaited_once()
