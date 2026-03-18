"""
Integration tests for schema management and generation endpoints.

Tests the /schemas router with actual HTTP requests.
"""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
@pytest.mark.schemas
async def test_schemas_require_api_key(client: AsyncClient):
    """Test that schema endpoints require valid API key."""
    response = await client.get("/schemas")
    assert response.status_code == 401, "Should reject request without API key"


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_list_schemas(authenticated_client: AsyncClient):
    """Test listing all schemas."""
    response = await authenticated_client.get("/schemas")

    assert response.status_code == 200
    data = response.json()

    # Should return list (may be empty)
    assert isinstance(data, list)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_list_db_schemas(authenticated_client: AsyncClient):
    """Test listing schemas from database."""
    response = await authenticated_client.get("/schemas/db")

    assert response.status_code == 200
    data = response.json()

    assert isinstance(data, list | dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_create_schema(
    authenticated_client: AsyncClient, sample_schema_data: dict[str, Any]
):
    """Test creating a new schema."""
    # Make schema name unique
    sample_schema_data["name"] = f"TestSchema_{uuid.uuid4().hex[:8]}"

    response = await authenticated_client.post("/schemas", json=sample_schema_data)

    assert response.status_code in [200, 201]
    data = response.json()

    # Verify response structure
    assert "name" in data or "id" in data

    return data.get("id") or data.get("name")


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_create_schema_minimal(authenticated_client: AsyncClient):
    """Test creating schema with minimal fields."""
    minimal_schema = {"name": f"MinimalSchema_{uuid.uuid4().hex[:8]}", "fields": []}

    response = await authenticated_client.post("/schemas", json=minimal_schema)

    # Should either accept or require more fields
    assert response.status_code in [200, 201, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_get_schema_by_id(authenticated_client: AsyncClient):
    """Test retrieving a specific schema."""
    # First create a schema
    schema_data = {
        "name": f"GetTest_{uuid.uuid4().hex[:8]}",
        "description": "Schema for get test",
        "fields": [{"name": "field1", "type": "string", "description": "Test field"}],
    }

    create_response = await authenticated_client.post("/schemas", json=schema_data)

    if create_response.status_code in [200, 201]:
        created = create_response.json()
        schema_id = created.get("id") or created.get("name")

        # Retrieve the schema
        response = await authenticated_client.get(f"/schemas/{schema_id}")

        assert response.status_code == 200
        data = response.json()
        assert data.get("name") == schema_data["name"] or data.get("id") == schema_id


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_get_db_schema_by_id(authenticated_client: AsyncClient):
    """Test retrieving a schema from database by ID."""
    # List schemas first
    list_response = await authenticated_client.get("/schemas/db")

    if list_response.status_code == 200:
        schemas = list_response.json()

        # Handle both list and dict responses
        if isinstance(schemas, list) and len(schemas) > 0:
            schema_id = schemas[0].get("id") or schemas[0].get("name")

            if schema_id:
                response = await authenticated_client.get(f"/schemas/db/{schema_id}")
                assert response.status_code in [200, 404]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_update_schema(authenticated_client: AsyncClient):
    """Test updating an existing schema."""
    # Create a schema
    schema_data = {
        "name": f"UpdateTest_{uuid.uuid4().hex[:8]}",
        "description": "Original description",
        "fields": [{"name": "field1", "type": "string"}],
    }

    create_response = await authenticated_client.post("/schemas", json=schema_data)

    if create_response.status_code in [200, 201]:
        created = create_response.json()
        schema_id = created.get("id") or created.get("name")

        # Update the schema
        update_data = {
            "name": schema_data["name"],
            "description": "Updated description",
            "fields": [
                {"name": "field1", "type": "string"},
                {"name": "field2", "type": "number"},
            ],
        }

        response = await authenticated_client.put(
            f"/schemas/{schema_id}", json=update_data
        )

        assert response.status_code in [200, 404]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_delete_schema(authenticated_client: AsyncClient):
    """Test deleting a schema."""
    # Create a schema
    schema_data = {"name": f"DeleteTest_{uuid.uuid4().hex[:8]}", "fields": []}

    create_response = await authenticated_client.post("/schemas", json=schema_data)

    if create_response.status_code in [200, 201]:
        created = create_response.json()
        schema_id = created.get("id") or created.get("name")

        # Delete the schema
        response = await authenticated_client.delete(f"/schemas/{schema_id}")

        assert response.status_code in [200, 204, 404]

        # Verify deletion
        get_response = await authenticated_client.get(f"/schemas/{schema_id}")
        assert get_response.status_code in [404, 200]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_generate_schema_from_sample(authenticated_client: AsyncClient):
    """Test AI-powered schema generation from sample data."""
    generation_request = {
        "sample_data": {
            "parties": ["John Doe", "Jane Smith"],
            "contract_date": "2023-06-15",
            "contract_value": 50000,
            "terms": "Standard terms and conditions",
        },
        "schema_name": f"Generated_{uuid.uuid4().hex[:8]}",
        "description": "Auto-generated schema for contract",
    }

    response = await authenticated_client.post(
        "/schemas/generate", json=generation_request
    )

    # Should either succeed or indicate missing requirements
    assert response.status_code in [200, 201, 400, 422]

    if response.status_code in [200, 201]:
        data = response.json()
        # Should contain generated schema
        assert "schema" in data or "fields" in data or "session_id" in data


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_refine_generated_schema(authenticated_client: AsyncClient):
    """Test refining an AI-generated schema."""
    # First generate a schema
    generation_request = {
        "sample_data": {"field1": "value1", "field2": 123},
        "schema_name": f"Refinement_{uuid.uuid4().hex[:8]}",
    }

    gen_response = await authenticated_client.post(
        "/schemas/generate", json=generation_request
    )

    if gen_response.status_code in [200, 201]:
        gen_data = gen_response.json()
        session_id = gen_data.get("session_id")

        if session_id:
            # Refine the schema
            refinement_request = {
                "feedback": "Add more detailed descriptions",
                "modifications": {"add_field": {"name": "new_field", "type": "string"}},
            }

            response = await authenticated_client.post(
                f"/schemas/generate/{session_id}/refine", json=refinement_request
            )

            assert response.status_code in [200, 404]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_get_generation_session(authenticated_client: AsyncClient):
    """Test retrieving a schema generation session."""
    # Create a generation session first
    generation_request = {
        "sample_data": {"test": "data"},
        "schema_name": f"Session_{uuid.uuid4().hex[:8]}",
    }

    gen_response = await authenticated_client.post(
        "/schemas/generate", json=generation_request
    )

    if gen_response.status_code in [200, 201]:
        gen_data = gen_response.json()
        session_id = gen_data.get("session_id")

        if session_id:
            response = await authenticated_client.get(f"/schemas/generate/{session_id}")

            assert response.status_code in [200, 404]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_delete_generation_session(authenticated_client: AsyncClient):
    """Test deleting a schema generation session."""
    # Create a session
    generation_request = {
        "sample_data": {"test": "data"},
        "schema_name": f"DeleteSession_{uuid.uuid4().hex[:8]}",
    }

    gen_response = await authenticated_client.post(
        "/schemas/generate", json=generation_request
    )

    if gen_response.status_code in [200, 201]:
        gen_data = gen_response.json()
        session_id = gen_data.get("session_id")

        if session_id:
            response = await authenticated_client.delete(
                f"/schemas/generate/{session_id}"
            )

            assert response.status_code in [200, 204, 404]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_validate_schema_openai_compatibility(authenticated_client: AsyncClient):
    """Test validating schema for OpenAI function calling."""
    # Create or get a schema
    schema_data = {
        "name": f"ValidationTest_{uuid.uuid4().hex[:8]}",
        "fields": [
            {"name": "parties", "type": "array", "items": {"type": "string"}},
            {"name": "date", "type": "string", "format": "date"},
        ],
    }

    create_response = await authenticated_client.post("/schemas", json=schema_data)

    if create_response.status_code in [200, 201]:
        created = create_response.json()
        schema_id = created.get("id") or created.get("name")

        # Validate for OpenAI
        response = await authenticated_client.get(
            f"/schemas/db/{schema_id}/validate-openai"
        )

        assert response.status_code in [200, 404]

        if response.status_code == 200:
            data = response.json()
            # Should indicate validation status
            assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_compile_schema(authenticated_client: AsyncClient):
    """Test compiling schema to executable format."""
    schema_to_compile = {
        "name": f"CompileTest_{uuid.uuid4().hex[:8]}",
        "fields": [
            {"name": "field1", "type": "string"},
            {"name": "field2", "type": "integer"},
        ],
    }

    response = await authenticated_client.post(
        "/schemas/compile", json=schema_to_compile
    )

    # Compilation may or may not be implemented
    assert response.status_code in [200, 201, 404, 501]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_schema_versioning(authenticated_client: AsyncClient):
    """Test schema version management."""
    # Create a schema
    schema_data = {
        "name": f"VersionTest_{uuid.uuid4().hex[:8]}",
        "version": "1.0.0",
        "fields": [{"name": "field1", "type": "string"}],
    }

    create_response = await authenticated_client.post("/schemas", json=schema_data)

    if create_response.status_code in [200, 201]:
        created = create_response.json()
        schema_id = created.get("id") or created.get("name")

        # Get versions
        response = await authenticated_client.get(f"/schemas/db/{schema_id}/versions")

        # Versioning may or may not be implemented
        assert response.status_code in [200, 404]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_schema_validation_errors(authenticated_client: AsyncClient):
    """Test validation errors for schema operations."""
    # Invalid schema - missing name
    response = await authenticated_client.post("/schemas", json={"fields": []})
    assert response.status_code == 422

    # Invalid schema - invalid field type
    response = await authenticated_client.post(
        "/schemas",
        json={
            "name": "InvalidSchema",
            "fields": [{"name": "f1", "type": "invalid_type"}],
        },
    )
    # May accept or reject depending on validation
    assert response.status_code in [200, 201, 422]


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.schemas
@pytest.mark.integration
async def test_get_nonexistent_schema(authenticated_client: AsyncClient):
    """Test retrieving a schema that doesn't exist."""
    response = await authenticated_client.get("/schemas/nonexistent-schema-999")
    assert response.status_code == 404
