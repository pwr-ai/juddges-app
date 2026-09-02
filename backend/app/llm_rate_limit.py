"""Per-client budget for the LangServe LLM routes.

LangServe registers /qa, /chat and /enhance_query through ``add_routes``,
which exposes no route function for ``@limiter.limit`` to decorate. These
three endpoints are the only ones in the backend that call ChatOpenAI on
every request, so they get an explicit dependency instead.

The budget deliberately uses the same ``limits`` storage URI as the rest of
the app, so a Redis-backed deployment shares one counter across processes.
"""

from __future__ import annotations

import os

from fastapi import HTTPException, Request, status
from limits import RateLimitItem, parse
from limits.storage import storage_from_string
from limits.strategies import MovingWindowRateLimiter

from app.rate_limiter import RATE_LIMIT_STORAGE_URI, get_client_ip, hit_with_fallback

DEFAULT_LLM_RATE_LIMIT = "20/hour"

_limiter = MovingWindowRateLimiter(storage_from_string(RATE_LIMIT_STORAGE_URI))


def _current_limit() -> RateLimitItem:
    """Parse the configured budget on every call so env overrides apply."""
    return parse(os.getenv("LLM_RATE_LIMIT", DEFAULT_LLM_RATE_LIMIT))


def enforce_llm_rate_limit(request: Request) -> None:
    """Charge one LLM call against the caller's budget, or reject with 429."""
    if not hit_with_fallback(_limiter, _current_limit(), "llm", get_client_ip(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "LLM_RATE_LIMIT_EXCEEDED",
                "message": (
                    "Too many AI requests. This limit protects the shared "
                    "research budget — please try again later."
                ),
            },
        )
