"""The authenticated principal for the current MCP tool call.

Tools must not take a credential as an argument — an LLM would then be able
to pass one. The transport authenticates, sets the principal here, and the
tools read it. A tool that cannot see a principal fails rather than falling
back to an anonymous read.

The principal lives in a ContextVar, so concurrent requests (each running in
its own asyncio task) never see each other's principal.
"""

from contextvars import ContextVar, Token
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.auth_jwt import AuthenticatedUser

_principal: ContextVar["AuthenticatedUser"] = ContextVar("juddges_mcp_principal")


class MissingPrincipalError(RuntimeError):
    """Raised when a tool runs without an authenticated principal."""


def set_principal(user: "AuthenticatedUser") -> Token:
    """Bind `user` for the current context; pass the token to reset_principal."""
    return _principal.set(user)


def reset_principal(token: Token) -> None:
    """Restore the principal that was bound before the matching set_principal."""
    _principal.reset(token)


def get_principal() -> "AuthenticatedUser":
    """Return the current principal, or raise MissingPrincipalError."""
    try:
        return _principal.get()
    except LookupError as e:
        raise MissingPrincipalError(
            "No authenticated principal for this MCP call"
        ) from e
