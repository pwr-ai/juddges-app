"""
Pytest fixtures for schema and extraction API tests.
"""

import os
import uuid
from typing import Any, AsyncGenerator, Dict

import pytest
from httpx import AsyncClient, ASGITransport

# Set test environment variables before importing app
os.environ.setdefault("BACKEND_API_KEY", "test-api-key-12345")
os.environ.setdefault("SUPABASE_URL", "http://test-supabase.local")
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "http://test-supabase.local")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault(
    "LANGGRAPH_POSTGRES_URL", "postgresql://test:test@localhost:5432/test"
)
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("REDIS_PORT", "6379")

from app.server import app


@pytest.fixture
def test_api_key() -> str:
    """Return the test API key."""
    return "test-api-key-12345"


@pytest.fixture
def auth_headers(test_api_key: str) -> Dict[str, str]:
    """Return authentication headers with API key."""
    return {"X-API-Key": test_api_key, "Content-Type": "application/json"}


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Create an async HTTP client for testing."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture
def sample_schema_data() -> Dict[str, Any]:
    """Sample schema data for testing."""
    return {
        "name": "Contract Schema",
        "description": "Extract contract details from legal documents",
        "version": "1.0.0",
        "fields": [
            {
                "name": "parties",
                "type": "array",
                "description": "Contract parties involved",
                "required": True,
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "role": {"type": "string"},
                    },
                },
            },
            {
                "name": "contract_date",
                "type": "date",
                "description": "Date of contract signing",
                "required": True,
            },
            {
                "name": "amount",
                "type": "number",
                "description": "Contract amount in currency",
                "required": False,
            },
            {
                "name": "terms",
                "type": "string",
                "description": "Key contract terms",
                "required": False,
            },
        ],
    }


@pytest.fixture
def minimal_schema_data() -> Dict[str, Any]:
    """Minimal valid schema data."""
    return {
        "name": "Minimal Schema",
        "description": "Basic test schema",
        "fields": [
            {
                "name": "field1",
                "type": "string",
                "description": "Test field",
                "required": True,
            }
        ],
    }


@pytest.fixture
def complex_schema_data() -> Dict[str, Any]:
    """Complex schema with nested objects and arrays."""
    return {
        "name": "Court Judgment Schema",
        "description": "Extract detailed court judgment information",
        "version": "2.0.0",
        "fields": [
            {
                "name": "case_number",
                "type": "string",
                "description": "Unique case identifier",
                "required": True,
            },
            {
                "name": "court",
                "type": "object",
                "description": "Court information",
                "required": True,
                "properties": {
                    "name": {"type": "string"},
                    "jurisdiction": {"type": "string"},
                    "level": {"type": "string"},
                },
            },
            {
                "name": "judges",
                "type": "array",
                "description": "List of judges",
                "required": False,
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "role": {"type": "string"},
                    },
                },
            },
            {
                "name": "parties",
                "type": "array",
                "description": "Case parties",
                "required": True,
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "type": {"type": "string"},
                        "representation": {"type": "string"},
                    },
                },
            },
            {
                "name": "decision_date",
                "type": "date",
                "description": "Date of judgment",
                "required": True,
            },
            {
                "name": "verdict",
                "type": "string",
                "description": "Court verdict",
                "required": True,
            },
            {
                "name": "legal_basis",
                "type": "array",
                "description": "Legal basis for decision",
                "required": False,
                "items": {"type": "string"},
            },
        ],
    }


@pytest.fixture
def sample_document_text() -> str:
    """Sample document text for extraction testing."""
    return """
    CONTRACT AGREEMENT
    
    This contract is entered into on January 15, 2024, between:
    
    Party A: Tech Solutions Inc., represented by John Smith (CEO)
    Party B: Legal Services Ltd., represented by Jane Doe (Managing Director)
    
    TERMS:
    1. Party A agrees to provide software development services
    2. Party B agrees to pay $50,000 for the services
    3. Project duration: 6 months
    4. Payment terms: 50% upfront, 50% on completion
    
    SIGNATURES:
    John Smith, January 15, 2024
    Jane Doe, January 15, 2024
    """


@pytest.fixture
def sample_judgment_text() -> str:
    """Sample court judgment text for extraction testing."""
    return """
    SUPREME COURT OF POLAND
    Case No: II CSK 123/2024
    
    Judgment delivered on February 10, 2024
    
    JUDGES:
    - Judge Anna Kowalski (Presiding)
    - Judge Jan Nowak
    - Judge Maria Wisniewski
    
    PARTIES:
    Plaintiff: John Smith, represented by Attorney Mark Brown
    Defendant: ABC Corporation Ltd., represented by Attorney Sarah Johnson
    
    VERDICT:
    The court rules in favor of the plaintiff. The defendant is ordered to pay
    damages in the amount of 100,000 PLN plus court costs.
    
    LEGAL BASIS:
    - Civil Code Art. 415
    - Civil Procedure Code Art. 233
    
    Reasoning follows...
    """


@pytest.fixture
def sample_extraction_request() -> Dict[str, Any]:
    """Sample extraction request data."""
    return {
        "schema_id": "test-schema-123",
        "document_id": "test-doc-456",
        "config": {
            "mode": "auto",
            "confidence_threshold": 0.7,
            "extract_citations": True,
        },
    }


@pytest.fixture
def sample_bulk_extraction_request() -> Dict[str, Any]:
    """Sample bulk extraction request."""
    return {
        "schema_id": "test-schema-123",
        "document_ids": ["doc-1", "doc-2", "doc-3", "doc-4", "doc-5"],
        "config": {"mode": "batch", "parallel": True, "max_workers": 3},
    }


@pytest.fixture
def invalid_schema_data() -> Dict[str, Any]:
    """Invalid schema data for negative testing."""
    return {
        "name": "Invalid Schema",
        "fields": [
            {
                "name": "bad_field",
                "type": "invalid_type",  # Invalid type
                "required": True,
            }
        ],
    }


@pytest.fixture
def schema_with_missing_required() -> Dict[str, Any]:
    """Schema data missing required fields."""
    return {"description": "Missing name field", "fields": []}


@pytest.fixture
def mock_schema_id() -> str:
    """Generate a mock schema ID."""
    return f"schema-{uuid.uuid4()}"


@pytest.fixture
def mock_extraction_id() -> str:
    """Generate a mock extraction ID."""
    return f"extraction-{uuid.uuid4()}"


@pytest.fixture
def mock_session_id() -> str:
    """Generate a mock session ID."""
    return f"session-{uuid.uuid4()}"


@pytest.fixture
def ai_generation_request() -> Dict[str, Any]:
    """Sample AI schema generation request."""
    return {
        "description": "I need to extract party names, dates, and amounts from contracts",
        "sample_documents": ["Contract between A and B for $10,000 dated 2024-01-15"],
        "output_format": "json_schema",
    }


@pytest.fixture
def chat_refinement_request() -> Dict[str, Any]:
    """Sample chat refinement request."""
    return {
        "message": "Add extraction of contract duration",
        "context": {"previous_schema": {"fields": ["parties", "date", "amount"]}},
    }


@pytest.fixture
def schema_test_request() -> Dict[str, Any]:
    """Schema test request data."""
    return {
        "document_id": "test-doc-789",
        "sample_text": "Test document with party A and party B",
        "validation_mode": "strict",
    }


@pytest.fixture
def prompt_data() -> Dict[str, Any]:
    """Sample prompt data for extraction."""
    return {
        "id": "test-prompt-001",
        "name": "Contract Extraction Prompt",
        "template": "Extract the following from the contract:\n{{ fields }}",
        "variables": ["fields"],
        "version": "1.0.0",
    }


@pytest.fixture
def filter_request() -> Dict[str, Any]:
    """Sample filter request for extracted data."""
    return {
        "filters": {
            "date_range": {"start": "2024-01-01", "end": "2024-12-31"},
            "amount_range": {"min": 1000, "max": 100000},
            "parties": ["Tech Solutions Inc."],
        },
        "page": 1,
        "page_size": 20,
    }


@pytest.fixture
def facet_request() -> Dict[str, Any]:
    """Sample facet aggregation request."""
    return {
        "fields": ["jurisdiction", "court_type", "verdict"],
        "filters": {"year": 2024},
    }
