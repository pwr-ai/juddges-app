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

The IP budget is enforced only when ``TRUSTED_PROXY`` is truthy. It is keyed on
the address ``get_client_ip`` returns, and that address identifies a client only
when the proxy's ``X-Forwarded-For`` is trusted. Behind a reverse proxy with
``TRUSTED_PROXY`` unset (the default, and the state of docker-compose.yml, where
every request arrives through Caddy) the address is the proxy's own, so every
caller shares one bucket. A limit on a key that is the same for everyone is not
a rate limit but a kill switch: twenty rejected keys from anyone would lock out
every MCP user. The gate is therefore inert unless ``TRUSTED_PROXY=true``, which
leaves rejected-key database load unbounded in that state (a known, logged
gap) rather than letting one caller deny the service to all. The flag is read
per call, never inferred from a request header: a client could send
``X-Forwarded-For`` itself to switch its own gating on or off.

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
from loguru import logger

from app.rate_limiter import (
    RATE_LIMIT_STORAGE_URI,
    _is_trusted_proxy,
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

# The skip is logged once per process, not once per request.
_ip_gate_skip_warned = False


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
            "Wait for the window to roll over and try again.",
            # The whole window: a deliberate conservative over-estimate. The
            # exact remainder (get_window_stats) is a storage call, and an
            # error path must not make a call that can throw.
            retry_after=int(item.get_expiry()),
        )


def _ip_gate_enabled() -> bool:
    """True when the client IP identifies a client, so the budget may be enforced."""
    global _ip_gate_skip_warned
    if _is_trusted_proxy():
        return True
    if not _ip_gate_skip_warned:
        _ip_gate_skip_warned = True
        logger.warning(
            "MCP_IP_RATE_LIMIT is not being enforced because TRUSTED_PROXY is "
            "not set: the client IP is the proxy's, so one shared budget would "
            "lock every MCP user out. Set TRUSTED_PROXY=true behind a trusted "
            "reverse proxy to enable it."
        )
    return False


def mcp_auth_failures_exhausted(client_ip: str) -> bool:
    """True when `client_ip` has already spent its rejected-key budget.

    Does not consume budget, so it can run before key resolution. Always False
    when the proxy is not trusted (see the module docstring).
    """
    if not _ip_gate_enabled():
        return False
    return not test_with_fallback(
        _limiter, _current_ip_limit(), _AUTH_FAIL_BUCKET, client_ip
    )


def record_mcp_auth_failure(client_ip: str) -> None:
    """Charge one rejected key against `client_ip`'s budget.

    A no-op when the proxy is not trusted: nothing would read the bucket.
    """
    if not _ip_gate_enabled():
        return
    hit_with_fallback(_limiter, _current_ip_limit(), _AUTH_FAIL_BUCKET, client_ip)


def mcp_auth_failure_retry_after() -> int:
    """Seconds a throttled IP should wait: the whole window, as for keys."""
    return int(_current_ip_limit().get_expiry())
