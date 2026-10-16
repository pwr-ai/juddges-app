"""Local stdio entrypoint for development.

Production serves MCP over HTTP at /mcp. This entrypoint lets a developer
drive the same tools from a local client without deploying: it takes the key
from JUDDGES_MCP_KEY and binds that principal for the whole process.

JUDDGES_MCP_KEY holds a live credential. Export it in your shell or pass it
through your MCP client's per-user config; never put it in a committed file.

This only works for someone who already holds the backend's service-role
credentials locally (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY), because
resolve_mcp_principal looks the key up through get_admin_supabase_client().
It is a developer convenience, not a path an external user can take; external
clients connect to HTTP /mcp.

stdout carries the JSON-RPC frames in this transport, so nothing in this
process may write to it. Diagnostics go through loguru, whose default sink is
stderr.
"""

import os

from loguru import logger

from app.core.auth_mcp import resolve_mcp_principal
from juddges_mcp.principal import set_principal
from juddges_mcp.server import build_server

KEY_ENV_VAR = "JUDDGES_MCP_KEY"
_USAGE_ERROR = 2


def main() -> None:
    """Run the MCP server over stdio as the owner of JUDDGES_MCP_KEY."""
    key = os.getenv(KEY_ENV_VAR)
    if not key:
        logger.error(
            f"{KEY_ENV_VAR} is not set. Generate a key in /settings "
            "(MCP access) and export it before starting the server."
        )
        raise SystemExit(_USAGE_ERROR)

    # Resolve before building the server so a bad key never starts one.
    principal = resolve_mcp_principal(key)
    if principal is None:
        # resolve_mcp_principal also returns None when the backend credentials
        # are missing, so name that cause too.
        logger.error(
            f"The key in {KEY_ENV_VAR} could not be resolved: it may be revoked, "
            "expired, or from another environment, or SUPABASE_URL / "
            "SUPABASE_SERVICE_ROLE_KEY may be unset."
        )
        raise SystemExit(_USAGE_ERROR)

    # The returned token is deliberately discarded: this binding lasts the whole
    # process, unlike the per-request bindings the HTTP middleware resets in a
    # `finally`. There is nothing to restore it to.
    set_principal(principal)
    build_server().run(transport="stdio")


if __name__ == "__main__":
    main()
