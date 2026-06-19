"""Pin the per-call retry coverage on the structured-output extractor (#169).

Transient OpenAI failures (429 / 5xx / timeouts) must be retried per LLM call
so a single transient error does not fail the whole document.
"""

import pytest
from openai import (
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
    RateLimitError,
)

from juddges_search.info_extraction.extractor import InformationExtractor


def _retry_exception_types() -> tuple[type, ...]:
    """Extract the exception tuple from the tenacity @retry on the extract method."""
    retrying = InformationExtractor.extract_information_with_structured_output.retry
    return retrying.retry.exception_types


@pytest.mark.unit
@pytest.mark.parametrize(
    "exc_type",
    [RateLimitError, APITimeoutError, APIConnectionError, InternalServerError],
)
def test_transient_openai_errors_are_retried(exc_type: type) -> None:
    assert exc_type in _retry_exception_types()


@pytest.mark.unit
def test_permanent_4xx_not_blanket_retried() -> None:
    """APIStatusError (base for permanent 4xx like 400/401/403) must NOT be a
    blanket retry target — only the specific transient subclasses are listed."""
    from openai import APIStatusError

    assert APIStatusError not in _retry_exception_types()
