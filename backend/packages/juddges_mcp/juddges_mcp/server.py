"""Assemble the MCP server from the transport-agnostic tools."""

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from juddges_mcp.tools.judgment import get_extracted_fields, get_judgment
from juddges_mcp.tools.search import search_judgments

INSTRUCTIONS = (
    "Search Polish and UK court judgments in the Juddges corpus. "
    "Use search_judgments to find candidates — it returns citations and "
    "snippets. Call get_judgment for the full text of one judgment, and "
    "get_extracted_fields for its structured base-schema values. Always "
    "quote the court, case number and date when citing a judgment."
)


def build_server() -> FastMCP:
    """Return a FastMCP server with the three read-only tools registered."""
    server = FastMCP(
        name="juddges",
        instructions=INSTRUCTIONS,
        # The parent app mounts this at /mcp. Left at the default the inner
        # route is also /mcp, and the endpoint lands at /mcp/mcp.
        streamable_http_path="/",
        # No session affinity: behind a load balancer the next request of a
        # session may hit another worker, and every tool here is a pure read.
        stateless_http=True,
        # DNS rebinding threatens a server that trusts an ambient credential,
        # where a malicious page makes a victim's browser talk to a local
        # server. /mcp has none: McpAuthMiddleware rejects anything without a
        # valid jdg_mcp_ Bearer token before this app is reached, and a
        # browser page cannot obtain one. Populating allowed_hosts instead
        # would add a deployment knob that silently 421s production whenever
        # the proxy's Host header does not match.
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=False
        ),
    )
    server.tool()(search_judgments)
    server.tool()(get_judgment)
    server.tool()(get_extracted_fields)
    return server
