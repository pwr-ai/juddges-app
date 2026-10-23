# juddges_mcp

This package holds the MCP tool surface for the Juddges judgment corpus.
Tools must stay transport-agnostic: they read the authenticated principal
from `juddges_mcp.principal` and never take a credential as an argument, so
the same tools can be served over any MCP transport.

See `docs/superpowers/specs/2026-10-14-juddges-mcp-design.md` for the design.
