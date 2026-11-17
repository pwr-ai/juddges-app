"""Regression tests for #876: slowapi needs a ``response`` parameter.

``Limiter(headers_enabled=True)`` injects ``X-RateLimit-*`` headers after the
handler returns. When the handler returns a model rather than a ``Response`` it
reads the ``response`` kwarg; without that parameter slowapi raises and the
endpoint returns 500. The test config disables the limiter, so a behavioural
test cannot catch this: assert on the handler signatures instead.
"""

from __future__ import annotations

import inspect

import pytest
from starlette.responses import Response

from app.rate_limiter import limiter
from app.server import app  # importing registers every decorated handler


def _limited_handlers() -> list:
    marked = limiter._Limiter__marked_for_limiting
    return [func for funcs in marked.values() for func in funcs]


@pytest.mark.unit
def test_limiter_registry_is_populated():
    # Guards the private slowapi attribute used below against silent renames.
    assert len(_limited_handlers()) >= 15


@pytest.mark.unit
def test_every_rate_limited_handler_accepts_response_param():
    assert limiter._headers_enabled, "test assumes headers_enabled=True"
    offenders = []
    for func in _limited_handlers():
        params = inspect.signature(func).parameters
        if "response" not in params:
            offenders.append(f"{func.__module__}.{func.__name__}")
            continue
        annotation = params["response"].annotation
        if annotation is not Response and annotation != "Response":
            if not (isinstance(annotation, type) and issubclass(annotation, Response)):
                offenders.append(f"{func.__module__}.{func.__name__} (annotation)")
    assert not offenders, f"missing `response: Response`: {sorted(offenders)}"


@pytest.mark.unit
async def test_example_questions_returns_200_with_limiter_enabled(
    client, valid_api_headers
):
    # The autouse fixture turns the limiter off; switch it back on so slowapi's
    # header injection actually runs against the handler.
    app.state.limiter.enabled = True
    resp = await client.get(
        "/example_questions?num_polish=2&num_english=2", headers=valid_api_headers
    )
    assert resp.status_code == 200, resp.text
    assert "x-ratelimit-limit" in resp.headers
