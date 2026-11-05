"""Unit tests for the MCP usage wrapper (`mcp_tool_called` app events)."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from juddges_mcp import usage
from juddges_mcp.principal import reset_principal, set_principal
from juddges_mcp.server import build_server
from juddges_mcp.tools.judgment import get_extracted_fields, get_judgment
from juddges_mcp.tools.search import ToolInputError, search_judgments
from juddges_mcp.usage import instrumented
from mcp.server.fastmcp import FastMCP


@pytest.fixture
def emitted(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    def fake_emit(event_name: str, **kwargs: Any) -> None:
        calls.append({"event_name": event_name, **kwargs})

    monkeypatch.setattr(usage, "emit_app_event_in_background", fake_emit)
    return calls


@pytest.mark.unit
class TestInstrumented:
    async def test_success_records_tool_caller_outcome_and_count(self, emitted):
        async def search_things(query: str) -> list[int]:
            return [1, 2, 3]

        token = set_principal(MagicMock(id="user-1"))
        try:
            result = await instrumented(search_things)(query="secret text")
        finally:
            reset_principal(token)

        assert result == [1, 2, 3]
        assert len(emitted) == 1
        event = emitted[0]
        assert event["event_name"] == "mcp_tool_called"
        assert event["user_id"] == "user-1"
        assert event["surface"] == "mcp"
        props = event["properties"]
        assert props["tool"] == "search_things"
        assert props["outcome"] == "ok"
        assert props["result_count"] == 3
        assert isinstance(props["duration_ms"], int)
        # Arguments are caller data and never recorded.
        assert "secret text" not in repr(event)

    async def test_failure_is_recorded_and_reraised(self, emitted):
        async def broken() -> dict:
            raise ToolInputError("bad input")

        with pytest.raises(ToolInputError):
            await instrumented(broken)()

        assert emitted[0]["properties"]["outcome"] == "ToolInputError"
        assert emitted[0]["user_id"] is None
        assert "result_count" not in emitted[0]["properties"]

    async def test_emit_failure_never_breaks_the_tool(self, monkeypatch):
        def exploding(*_args: Any, **_kwargs: Any) -> None:
            raise RuntimeError("analytics down")

        monkeypatch.setattr(usage, "emit_app_event_in_background", exploding)

        async def tool() -> dict:
            return {"ok": True}

        assert await instrumented(tool)() == {"ok": True}

    async def test_wrapping_leaves_the_advertised_tool_schemas_unchanged(self):
        """FastMCP builds name, description and input schema from the function;
        the wrapper must be invisible to an agent listing tools."""
        plain = FastMCP(name="plain")
        for tool in (search_judgments, get_judgment, get_extracted_fields):
            plain.tool()(tool)

        wrapped_tools = await build_server().list_tools()
        plain_tools = await plain.list_tools()

        assert [t.model_dump() for t in wrapped_tools] == [
            t.model_dump() for t in plain_tools
        ]
