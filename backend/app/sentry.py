"""Sentry error tracking initialization for the backend.

Initializes Sentry SDK when SENTRY_DSN is set. No-op when unset, so
development and tests are not affected. The same ``init_sentry()`` is called by
both the FastAPI server (``app.server``) and the Celery worker/beat bootstrap
(``app.workers``), so task exceptions land in Sentry too — not just request-path
errors. The ``CeleryIntegration`` auto-captures failures in tasks when the SDK
is initialized inside a worker process.

Tags each event with:
- service=backend
- environment (from PYTHON_ENV, default "development")
- release (from SENTRY_RELEASE — set to ``prod-v<semver>`` by the prod build —
  falling back to GIT_SHA)

PII scrubbing (``before_send`` -> ``_scrub_event``) is **allowlist-based**, not
denylist: only a small set of safe request headers survive; everything else
(``Authorization``, ``Cookie``, query strings, user email/IP/username) is
dropped, and email addresses are redacted from messages and exception values.
This keeps ``send_default_pii`` effectively off even if upstream defaults change.
"""

from __future__ import annotations

import os
import re
from typing import Any

from loguru import logger

# Request headers that are safe to keep on a Sentry event. Everything not in
# this allowlist (Authorization, Cookie, X-Api-Key, ...) is dropped.
_SAFE_HEADERS = frozenset(
    {
        "accept",
        "accept-encoding",
        "accept-language",
        "content-length",
        "content-type",
        "host",
        "referer",
        "user-agent",
    }
)

# Fields scrubbed from event["user"] — we keep only a stable id for grouping.
_USER_PII_FIELDS = ("email", "ip_address", "username")

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_REDACTED = "[Filtered]"


def init_sentry() -> None:
    """Initialize Sentry SDK. Skips silently when SENTRY_DSN is not set."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        logger.debug("SENTRY_DSN not set — Sentry error tracking disabled")
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        environment = os.getenv("PYTHON_ENV", "development")
        # Prefer the deploy tag (prod-v<semver>) so issues group per release;
        # fall back to the commit SHA when running outside a tagged build.
        release = os.getenv("SENTRY_RELEASE") or os.getenv("GIT_SHA")

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release,
            # Never let the SDK attach PII by default; _scrub_event is the
            # belt-and-suspenders allowlist on top of this.
            send_default_pii=False,
            # Keep trace sampling low to avoid budget blow-up
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            # Capture 100% of errors (only traces are sampled)
            sample_rate=1.0,
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
                # Auto-captures exceptions raised in Celery tasks (worker + beat).
                CeleryIntegration(),
                LoggingIntegration(
                    level=None,  # capture all log levels as breadcrumbs
                    event_level=None,  # do NOT auto-send logs as Sentry events
                ),
            ],
            # Tag service + scrub PII on every event before it leaves the process.
            before_send=_scrub_event,
        )
        logger.info(
            f"Sentry initialized (env={environment}, "
            f"release={release or 'unset'}, traces={sentry_sdk.get_client().options.get('traces_sample_rate', 0.1)})"
        )
    except ImportError:
        logger.warning(
            "sentry-sdk not installed — Sentry error tracking disabled. "
            "Install with: pip install 'sentry-sdk[fastapi]'"
        )
    except Exception as e:
        # Never crash the app because of Sentry init failure
        logger.warning(f"Sentry initialization failed (non-fatal): {e}")


def _scrub_event(event: dict, hint: dict) -> dict:
    """Tag the event and strip PII using an allowlist (Sentry ``before_send``).

    - tags ``service=backend``
    - keeps only allowlisted request headers (drops Authorization, Cookie, etc.)
    - filters cookies and query strings wholesale
    - filters user email / ip / username, keeping any stable id for grouping
    - redacts email addresses from the message and exception values

    Pure function over the event dict so it is unit-testable without the SDK.
    """
    event.setdefault("tags", {})["service"] = "backend"

    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {
                k: v for k, v in headers.items() if k.lower() in _SAFE_HEADERS
            }
        if request.get("cookies"):
            request["cookies"] = _REDACTED
        if request.get("query_string"):
            request["query_string"] = _REDACTED

    user = event.get("user")
    if isinstance(user, dict):
        for field in _USER_PII_FIELDS:
            if field in user:
                user[field] = _REDACTED

    if isinstance(event.get("message"), str):
        event["message"] = _EMAIL_RE.sub(_REDACTED, event["message"])

    _redact_emails_in_exceptions(event)
    return event


def _redact_emails_in_exceptions(event: dict[str, Any]) -> None:
    """Redact email addresses embedded in exception messages (in place)."""
    exception = event.get("exception")
    if not isinstance(exception, dict):
        return
    for entry in exception.get("values") or []:
        value = entry.get("value") if isinstance(entry, dict) else None
        if isinstance(value, str):
            entry["value"] = _EMAIL_RE.sub(_REDACTED, value)


def capture_exception(exc: Exception, **extra: object) -> None:
    """Capture an exception to Sentry with optional extra context.

    No-op when Sentry is not initialized or sentry-sdk is not installed.
    """
    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            for key, value in extra.items():
                scope.set_extra(key, value)
            sentry_sdk.capture_exception(exc)
    except ImportError:
        pass
    except Exception:
        pass  # never break the app because of telemetry
