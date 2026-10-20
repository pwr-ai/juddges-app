"""Unit tests for the stdio entrypoint.

main() is never run for real here: FastMCP's stdio transport blocks on stdin.
"""

import subprocess
import sys
from unittest.mock import MagicMock, patch

import pytest
from juddges_mcp.stdio import main
from loguru import logger


@pytest.fixture
def log_messages():
    """Collect loguru output. capsys cannot: loguru keeps the stderr it saw at import."""
    messages: list[str] = []
    sink_id = logger.add(messages.append, format="{message}")
    try:
        yield messages
    finally:
        logger.remove(sink_id)


@pytest.mark.unit
class TestStdioEntrypoint:
    def test_missing_key_exits_with_a_message(self, monkeypatch, log_messages):
        monkeypatch.delenv("JUDDGES_MCP_KEY", raising=False)
        with (
            patch("juddges_mcp.stdio.build_server") as build,
            pytest.raises(SystemExit) as exc,
        ):
            main()
        assert exc.value.code == 2
        assert any("JUDDGES_MCP_KEY" in m for m in log_messages)
        build.assert_not_called()

    def test_unresolvable_key_exits_with_a_message(self, monkeypatch, log_messages):
        monkeypatch.setenv("JUDDGES_MCP_KEY", "jdg_mcp_revoked")
        with (
            patch("juddges_mcp.stdio.resolve_mcp_principal", return_value=None),
            patch("juddges_mcp.stdio.build_server") as build,
            pytest.raises(SystemExit) as exc,
        ):
            main()
        assert exc.value.code == 2
        assert any("could not be resolved" in m for m in log_messages)
        build.assert_not_called()

    def test_valid_key_binds_the_principal_before_running_over_stdio(self, monkeypatch):
        monkeypatch.setenv("JUDDGES_MCP_KEY", "jdg_mcp_good")
        principal = MagicMock(id="user-123")
        order = MagicMock()
        server = order.server
        with (
            patch("juddges_mcp.stdio.resolve_mcp_principal", return_value=principal),
            patch("juddges_mcp.stdio.build_server", return_value=server),
            patch("juddges_mcp.stdio.set_principal", order.bind),
        ):
            main()
        # The binding must precede run(): run blocks for the process lifetime.
        assert [c[0] for c in order.mock_calls] == ["bind", "server.run"]
        order.bind.assert_called_once_with(principal)
        server.run.assert_called_once_with(transport="stdio")

    def test_the_key_is_resolved_from_the_environment(self, monkeypatch):
        monkeypatch.setenv("JUDDGES_MCP_KEY", "jdg_mcp_good")
        with (
            patch(
                "juddges_mcp.stdio.resolve_mcp_principal", return_value=MagicMock()
            ) as resolve,
            patch("juddges_mcp.stdio.build_server"),
            patch("juddges_mcp.stdio.set_principal"),
        ):
            main()
        resolve.assert_called_once_with("jdg_mcp_good")


@pytest.mark.unit
def test_importing_and_building_the_server_writes_nothing_to_stdout():
    """stdout carries the JSON-RPC frames; one stray write corrupts every client.

    Runs in a fresh interpreter: in-process, the modules are already imported
    by the time a test runs, so a module-level write would never be seen.
    """
    result = subprocess.run(  # noqa: S603, RUF100 - fixed argv; S603 is enabled only by the root hook config
        [
            sys.executable,
            "-c",
            "import juddges_mcp.stdio as s; s.build_server()",
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout == ""
