"""Fixtures for schema_generator_agent tests."""

import pytest
from juddges_search.testing import FakeChatModel


@pytest.fixture
def fake_llm_with_schema_response():
    """Fake LLM seeded with a plausible schema generation response."""
    return FakeChatModel(
        responses=[
            '{"is_generated": true, "schema": {"fields": {"case_number": "string", "court": "string"}}}'
        ]
    )


@pytest.fixture
def fake_llm_with_multiple_responses():
    """Fake LLM with responses for multi-step workflow."""
    return FakeChatModel(
        responses=[
            "Help: I can analyze legal documents to extract structured data",
            "Problem: Extract case numbers and court names from judgments",
            '{"fields": {"case_number": "string", "court": "string", "date": "date"}}',
            "Assessment: Schema looks good for basic case metadata extraction",
        ]
    )
