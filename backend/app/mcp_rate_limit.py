"""Rate limiting for MCP traffic: a budget per key, and a bound per IP before auth.

Per key. Agent traffic has a different shape from interactive traffic: one
prompt can fan out into many tool calls. This keeps a separate bucket per key
so an agent cannot exhaust the budget an interactive user shares.

Per IP, before authentication. ``/mcp`` is reachable by anonymous callers, and
a bogus key that carries the ``jdg_mcp_`` prefix costs a database query to
reject. The per-key budget cannot see such a caller (it is charged on the key
id, which exists only after resolution), and the default IP limiter does not
cover mounted sub-apps (#574). So each IP gets a budget of *rejected* keys.

The failure bucket counts only rejected keys, never all requests. A valid key
never charges it, so the bound on unauthenticated database work is the same as
charging every request, while legitimate traffic is never throttled by it. For
the same reason the default is tight rather than generous: nothing legitimate
touches the bucket, and 20 a minute is ample for a developer mistyping a key.

The budget is *tested* before resolution (no database work if it is spent) and
*charged* only after a resolution failure.

Both budgets follow ``app/llm_rate_limit.py``: module-level limiters on the
app's storage URI, with the limit parsed on every call so an env override
applies without a restart.
"""

import os

from limits import RateLimitItem, parse
from limits.storage import storage_from_string
from limits.strategies import MovingWindowRateLimiter

from app.rate_limiter import (
    RATE_LIMIT_STORAGE_URI,
    hit_with_fallback,
    test_with_fallback,
)

DEFAULT_MCP_RATE_LIMIT = "120/hour"
DEFAULT_MCP_IP_RATE_LIMIT = "20/minute"

# Distinct bucket names: the per-key and rejected-key budgets must never bleed
# into each other, nor into the UI's budget.
_KEY_BUCKET = "mcp"
_AUTH_FAIL_BUCKET = "mcp-auth-fail"

_limiter = MovingWindowRateLimiter(storage_from_string(RATE_LIMIT_STORAGE_URI))


class McpRateLimitExceeded(RuntimeError):
    """The caller's key is over budget."""

    def __init__(self, message: str, retry_after: int) -> None:
        super().__init__(message)
        self.retry_after = retry_after


def _configured_limit() -> str:
    return os.getenv("MCP_RATE_LIMIT", DEFAULT_MCP_RATE_LIMIT)


def _current_ip_limit() -> RateLimitItem:
    """Parse the rejected-key budget on every call so env overrides apply."""
    return parse(os.getenv("MCP_IP_RATE_LIMIT", DEFAULT_MCP_IP_RATE_LIMIT))


def enforce_mcp_rate_limit(key_id: str) -> None:
    """Charge one MCP call against `key_id`'s budget, or raise."""
    # One parse for both the check and the message, so they cannot disagree.
    configured = _configured_limit()
    item = parse(configured)
    if not hit_with_fallback(_limiter, item, _KEY_BUCKET, key_id):
        raise McpRateLimitExceeded(
            f"MCP rate limit exceeded for this key (limit: {configured}). "
            "Wait for the window to roll over, or generate a second key.",
            # The whole window: a deliberate conservative over-estimate. The
            # exact remainder (get_window_stats) is a storage call, and an
            # error path must not make a call that can throw.
            retry_after=int(item.get_expiry()),
        )


def mcp_auth_failures_exhausted(client_ip: str) -> bool:
    """True when `client_ip` has already spent its rejected-key budget.

    Does not consume budget, so it can run before key resolution.
    """
    return not test_with_fallback(
        _limiter, _current_ip_limit(), _AUTH_FAIL_BUCKET, client_ip
    )


def record_mcp_auth_failure(client_ip: str) -> None:
    """Charge one rejected key against `client_ip`'s budget."""
    hit_with_fallback(_limiter, _current_ip_limit(), _AUTH_FAIL_BUCKET, client_ip)


def mcp_auth_failure_retry_after() -> int:
    """Seconds a throttled IP should wait: the whole window, as for keys."""
    return int(_current_ip_limit().get_expiry())
