"""Sentry error tracking initialization for the backend.

Initializes Sentry SDK when SENTRY_DSN is set. No-op when unset, so
development and tests are not affected.

Tags each event with:
- service=backend
- environment (from PYTHON_ENV, default "development")
- release (from GIT_SHA env var when available)
"""

from __future__ import annotations

import os

from loguru import logger


def init_sentry() -> None:
    """Initialize Sentry SDK. Skips silently when SENTRY_DSN is not set."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        logger.debug("SENTRY_DSN not set — Sentry error tracking disabled")
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        environment = os.getenv("PYTHON_ENV", "development")
        release = os.getenv("GIT_SHA")

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release,
            # Keep trace sampling low to avoid budget blow-up
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            # Capture 100% of errors (only traces are sampled)
            sample_rate=1.0,
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
                LoggingIntegration(
                    level=None,  # capture all log levels as breadcrumbs
                    event_level=None,  # do NOT auto-send logs as Sentry events
                ),
            ],
            # Tag all events with service name for easy filtering
            before_send=_tag_event,
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


def _tag_event(event: dict, hint: dict) -> dict:
    """Add service tag to every Sentry event."""
    event.setdefault("tags", {})["service"] = "backend"
    return event


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
