# juddges_mcp

This package holds the MCP tool surface for the Juddges judgment corpus.
Tools must stay transport-agnostic: they read the authenticated principal
from `juddges_mcp.principal` and never take a credential as an argument, so
the same tools can be served over any MCP transport.

See `docs/reference/mcp-tools.md` for the tool reference and
`docs/how-to/mcp-server.md` for running and connecting to the server.
