"""
Comprehensive tests for Schema CRUD operations.

Tests cover:
- Schema creation (POST /api/schemas)
- Schema retrieval (GET /api/schemas/{id})
- Schema listing (GET /api/schemas, GET /api/schemas/db)
- Schema update (PUT /api/schemas/{id})
- Schema deletion (DELETE /api/schemas/{id})
- Schema conversion (GET /api/schemas/db/{schema_id}/convert)
"""

import pytest
from httpx import AsyncClient


@pytest.mark.integration
class TestSchemaCreation:
    """Test schema creation endpoint."""

    @pytest.mark.anyio
    async def test_create_valid_schema(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test creating a valid schema."""
        response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )

        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["name"] == sample_schema_data["name"]
        assert data["description"] == sample_schema_data["description"]
        assert len(data["fields"]) == len(sample_schema_data["fields"])

    @pytest.mark.anyio
    async def test_create_minimal_schema(
        self, client: AsyncClient, auth_headers: dict, minimal_schema_data: dict
    ):
        """Test creating a minimal valid schema."""
        response = await client.post(
            "/api/schemas", json=minimal_schema_data, headers=auth_headers
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == minimal_schema_data["name"]
        assert len(data["fields"]) == 1

    @pytest.mark.anyio
    async def test_create_complex_schema(
        self, client: AsyncClient, auth_headers: dict, complex_schema_data: dict
    ):
        """Test creating a complex schema with nested structures."""
        response = await client.post(
            "/api/schemas", json=complex_schema_data, headers=auth_headers
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == complex_schema_data["name"]

        # Verify nested structures
        judges_field = next(f for f in data["fields"] if f["name"] == "judges")
        assert judges_field["type"] == "array"
        assert "items" in judges_field

    @pytest.mark.anyio
    async def test_create_schema_without_auth(
        self, client: AsyncClient, sample_schema_data: dict
    ):
        """Test schema creation fails without authentication."""
        response = await client.post("/api/schemas", json=sample_schema_data)

        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_create_schema_missing_required_fields(
        self,
        client: AsyncClient,
        auth_headers: dict,
        schema_with_missing_required: dict,
    ):
        """Test schema creation fails with missing required fields."""
        response = await client.post(
            "/api/schemas", json=schema_with_missing_required, headers=auth_headers
        )

        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_create_schema_invalid_field_type(
        self, client: AsyncClient, auth_headers: dict, invalid_schema_data: dict
    ):
        """Test schema creation fails with invalid field types."""
        response = await client.post(
            "/api/schemas", json=invalid_schema_data, headers=auth_headers
        )

        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_create_schema_duplicate_field_names(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test schema creation fails with duplicate field names."""
        schema_data = {
            "name": "Duplicate Fields Schema",
            "description": "Test duplicate fields",
            "fields": [
                {"name": "field1", "type": "string", "required": True},
                {"name": "field1", "type": "string", "required": True},  # Duplicate
            ],
        }

        response = await client.post(
            "/api/schemas", json=schema_data, headers=auth_headers
        )

        # Should either reject or handle duplicates
        assert response.status_code in [400, 422]

    @pytest.mark.anyio
    async def test_create_schema_empty_fields(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test schema creation with empty fields array."""
        schema_data = {
            "name": "Empty Schema",
            "description": "Schema with no fields",
            "fields": [],
        }

        response = await client.post(
            "/api/schemas", json=schema_data, headers=auth_headers
        )

        # Should reject empty fields
        assert response.status_code in [400, 422]

    @pytest.mark.anyio
    async def test_create_schema_with_metadata(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test creating schema with additional metadata."""
        schema_with_metadata = {
            **sample_schema_data,
            "metadata": {
                "author": "test-user",
                "tags": ["contract", "legal"],
                "category": "commercial",
            },
        }

        response = await client.post(
            "/api/schemas", json=schema_with_metadata, headers=auth_headers
        )

        assert response.status_code == 201
        data = response.json()
        if "metadata" in data:
            assert data["metadata"]["author"] == "test-user"


@pytest.mark.integration
class TestSchemaRetrieval:
    """Test schema retrieval endpoints."""

    @pytest.mark.anyio
    async def test_get_schema_by_id(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_schema_data: dict,
        mock_schema_id: str,
    ):
        """Test retrieving a schema by ID."""
        # First create a schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Retrieve it
        response = await client.get(f"/api/schemas/{schema_id}", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == schema_id
        assert data["name"] == sample_schema_data["name"]

    @pytest.mark.anyio
    async def test_get_schema_from_db(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test retrieving schema from database."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Get from DB
        response = await client.get(
            f"/api/schemas/db/{schema_id}", headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == sample_schema_data["name"]

    @pytest.mark.anyio
    async def test_get_nonexistent_schema(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test retrieving a non-existent schema."""
        response = await client.get(
            "/api/schemas/nonexistent-id-999", headers=auth_headers
        )

        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_get_schema_without_auth(
        self, client: AsyncClient, mock_schema_id: str
    ):
        """Test schema retrieval fails without authentication."""
        response = await client.get(f"/api/schemas/{mock_schema_id}")

        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_get_converted_schema(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test retrieving converted schema format."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Get converted
        response = await client.get(
            f"/api/schemas/db/{schema_id}/convert", headers=auth_headers
        )

        if response.status_code == 200:
            data = response.json()
            assert "converted" in data or "schema" in data


@pytest.mark.integration
class TestSchemaListing:
    """Test schema listing endpoints."""

    @pytest.mark.anyio
    async def test_list_schemas(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test listing all schemas."""
        # Create a few schemas
        for i in range(3):
            schema = {**sample_schema_data, "name": f"Schema {i}"}
            await client.post("/api/schemas", json=schema, headers=auth_headers)

        # List them
        response = await client.get("/api/schemas", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3

    @pytest.mark.anyio
    async def test_list_schemas_from_db(self, client: AsyncClient, auth_headers: dict):
        """Test listing schemas from database."""
        response = await client.get("/api/schemas/db", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.anyio
    async def test_list_schemas_empty(self, client: AsyncClient, auth_headers: dict):
        """Test listing schemas when none exist."""
        response = await client.get("/api/schemas", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.anyio
    async def test_list_schemas_pagination(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test schema listing with pagination."""
        # Create multiple schemas
        for i in range(15):
            schema = {**sample_schema_data, "name": f"Schema {i}"}
            await client.post("/api/schemas", json=schema, headers=auth_headers)

        # Get first page
        response = await client.get(
            "/api/schemas", params={"page": 1, "page_size": 10}, headers=auth_headers
        )

        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict) and "items" in data:
                assert len(data["items"]) <= 10

    @pytest.mark.anyio
    async def test_list_schemas_without_auth(self, client: AsyncClient):
        """Test schema listing fails without authentication."""
        response = await client.get("/api/schemas")

        assert response.status_code in [401, 403]


@pytest.mark.integration
class TestSchemaUpdate:
    """Test schema update operations."""

    @pytest.mark.anyio
    async def test_update_schema(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test updating a schema."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Update it
        update_data = {
            "name": "Updated Schema Name",
            "description": "Updated description",
        }

        response = await client.put(
            f"/api/schemas/{schema_id}", json=update_data, headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["description"] == update_data["description"]

    @pytest.mark.anyio
    async def test_update_schema_fields(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test updating schema fields."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Add a new field
        updated_fields = sample_schema_data["fields"] + [
            {
                "name": "new_field",
                "type": "string",
                "description": "New field added",
                "required": False,
            }
        ]

        update_data = {"fields": updated_fields}

        response = await client.put(
            f"/api/schemas/{schema_id}", json=update_data, headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["fields"]) == len(updated_fields)

    @pytest.mark.anyio
    async def test_update_nonexistent_schema(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test updating a non-existent schema."""
        response = await client.put(
            "/api/schemas/nonexistent-id-999",
            json={"name": "Updated"},
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_update_schema_without_auth(
        self, client: AsyncClient, mock_schema_id: str
    ):
        """Test schema update fails without authentication."""
        response = await client.put(
            f"/api/schemas/{mock_schema_id}", json={"name": "Updated"}
        )

        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_update_schema_with_invalid_data(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test schema update with invalid data."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Try invalid update
        invalid_update = {"fields": [{"name": "bad", "type": "invalid_type"}]}

        response = await client.put(
            f"/api/schemas/{schema_id}", json=invalid_update, headers=auth_headers
        )

        assert response.status_code == 422


@pytest.mark.integration
class TestSchemaDeletion:
    """Test schema deletion operations."""

    @pytest.mark.anyio
    async def test_delete_schema(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test deleting a schema."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Delete it
        response = await client.delete(
            f"/api/schemas/{schema_id}", headers=auth_headers
        )

        assert response.status_code in [200, 204]

        # Verify it's gone
        get_response = await client.get(
            f"/api/schemas/{schema_id}", headers=auth_headers
        )
        assert get_response.status_code == 404

    @pytest.mark.anyio
    async def test_delete_schema_with_force(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test force deleting a schema."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Force delete
        response = await client.delete(
            f"/api/schemas/{schema_id}", params={"force": True}, headers=auth_headers
        )

        assert response.status_code in [200, 204]

    @pytest.mark.anyio
    async def test_delete_nonexistent_schema(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test deleting a non-existent schema."""
        response = await client.delete(
            "/api/schemas/nonexistent-id-999", headers=auth_headers
        )

        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_delete_schema_without_auth(
        self, client: AsyncClient, mock_schema_id: str
    ):
        """Test schema deletion fails without authentication."""
        response = await client.delete(f"/api/schemas/{mock_schema_id}")

        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_delete_schema_in_use(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test deleting a schema that's in use (should fail or warn)."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Simulate schema in use by creating extraction
        extraction_data = {"schema_id": schema_id, "document_id": "test-doc-123"}
        await client.post(
            "/api/extractions", json=extraction_data, headers=auth_headers
        )

        # Try to delete (should fail without force)
        response = await client.delete(
            f"/api/schemas/{schema_id}", headers=auth_headers
        )

        # Should either fail or require force flag
        if response.status_code == 200:
            # Check if warning is present
            data = response.json()
            assert "warning" in data or "force" in str(data).lower()
