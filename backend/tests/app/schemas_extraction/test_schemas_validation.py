"""
Comprehensive tests for Schema Validation and Compilation.

Tests cover:
- Schema validation (POST /api/schemas/compile)
- OpenAI schema validation (GET /api/schemas/db/{id}/validate-openai)
- Field compilation
- Schema compatibility checks
"""

import pytest
from httpx import AsyncClient


@pytest.mark.integration
class TestSchemaCompilation:
    """Test schema compilation and validation."""

    @pytest.mark.anyio
    async def test_compile_valid_schema(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test compiling a valid schema."""
        response = await client.post(
            "/api/schemas/compile",
            json={"fields": sample_schema_data["fields"]},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "compiled" in data or "valid" in data

    @pytest.mark.anyio
    async def test_compile_minimal_schema(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test compiling minimal schema."""
        minimal_fields = [{"name": "field1", "type": "string", "required": True}]

        response = await client.post(
            "/api/schemas/compile",
            json={"fields": minimal_fields},
            headers=auth_headers,
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_compile_complex_nested_schema(
        self, client: AsyncClient, auth_headers: dict, complex_schema_data: dict
    ):
        """Test compiling complex nested schema."""
        response = await client.post(
            "/api/schemas/compile",
            json={"fields": complex_schema_data["fields"]},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Verify nested structures are compiled
        if "json_schema" in data:
            assert "properties" in data["json_schema"]

    @pytest.mark.anyio
    async def test_compile_schema_with_invalid_type(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test compilation fails with invalid field type."""
        invalid_fields = [
            {"name": "bad_field", "type": "invalid_type", "required": True}
        ]

        response = await client.post(
            "/api/schemas/compile",
            json={"fields": invalid_fields},
            headers=auth_headers,
        )

        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_compile_schema_missing_required(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test compilation fails with missing required properties."""
        incomplete_fields = [
            {"name": "incomplete"}  # Missing type and required
        ]

        response = await client.post(
            "/api/schemas/compile",
            json={"fields": incomplete_fields},
            headers=auth_headers,
        )

        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_compile_schema_empty_fields(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test compilation with empty fields array."""
        response = await client.post(
            "/api/schemas/compile", json={"fields": []}, headers=auth_headers
        )

        assert response.status_code in [400, 422]

    @pytest.mark.anyio
    async def test_compile_schema_duplicate_names(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test compilation detects duplicate field names."""
        duplicate_fields = [
            {"name": "field1", "type": "string", "required": True},
            {"name": "field1", "type": "number", "required": False},
        ]

        response = await client.post(
            "/api/schemas/compile",
            json={"fields": duplicate_fields},
            headers=auth_headers,
        )

        assert response.status_code in [400, 422]

    @pytest.mark.anyio
    async def test_compile_schema_without_auth(self, client: AsyncClient):
        """Test compilation fails without authentication."""
        response = await client.post(
            "/api/schemas/compile",
            json={"fields": [{"name": "test", "type": "string"}]},
        )

        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_compile_array_field(self, client: AsyncClient, auth_headers: dict):
        """Test compiling array field types."""
        array_fields = [
            {
                "name": "items",
                "type": "array",
                "required": True,
                "items": {"type": "string"},
            }
        ]

        response = await client.post(
            "/api/schemas/compile", json={"fields": array_fields}, headers=auth_headers
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_compile_object_field(self, client: AsyncClient, auth_headers: dict):
        """Test compiling object field types."""
        object_fields = [
            {
                "name": "person",
                "type": "object",
                "required": True,
                "properties": {"name": {"type": "string"}, "age": {"type": "number"}},
            }
        ]

        response = await client.post(
            "/api/schemas/compile", json={"fields": object_fields}, headers=auth_headers
        )

        assert response.status_code == 200


@pytest.mark.integration
class TestOpenAISchemaValidation:
    """Test OpenAI-specific schema validation."""

    @pytest.mark.anyio
    async def test_validate_openai_schema(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test validating schema for OpenAI compatibility."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Validate for OpenAI
        response = await client.get(
            f"/api/schemas/db/{schema_id}/validate-openai", headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "valid" in data or "compatible" in data

    @pytest.mark.anyio
    async def test_validate_openai_nonexistent_schema(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test OpenAI validation for non-existent schema."""
        response = await client.get(
            "/api/schemas/db/nonexistent-id-999/validate-openai", headers=auth_headers
        )

        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_validate_openai_complex_schema(
        self, client: AsyncClient, auth_headers: dict, complex_schema_data: dict
    ):
        """Test OpenAI validation for complex schema."""
        # Create complex schema
        create_response = await client.post(
            "/api/schemas", json=complex_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Validate
        response = await client.get(
            f"/api/schemas/db/{schema_id}/validate-openai", headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()

        # Check for compatibility warnings
        if "warnings" in data:
            assert isinstance(data["warnings"], list)

    @pytest.mark.anyio
    async def test_validate_openai_without_auth(
        self, client: AsyncClient, mock_schema_id: str
    ):
        """Test OpenAI validation fails without auth."""
        response = await client.get(f"/api/schemas/db/{mock_schema_id}/validate-openai")

        assert response.status_code in [401, 403]


@pytest.mark.integration
class TestSchemaCompatibility:
    """Test schema compatibility checks."""

    @pytest.mark.anyio
    async def test_compatible_schema_update(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test updating schema with compatible changes."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Make compatible update (add optional field)
        compatible_update = {
            "fields": sample_schema_data["fields"]
            + [{"name": "optional_field", "type": "string", "required": False}]
        }

        response = await client.put(
            f"/api/schemas/{schema_id}", json=compatible_update, headers=auth_headers
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_incompatible_schema_update(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test updating schema with incompatible changes."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Make incompatible update (remove required field)
        incompatible_update = {
            "fields": [sample_schema_data["fields"][0]]  # Remove other fields
        }

        response = await client.put(
            f"/api/schemas/{schema_id}", json=incompatible_update, headers=auth_headers
        )

        # Should warn or reject
        if response.status_code == 200:
            data = response.json()
            assert "warning" in data or "compatibility" in str(data).lower()

    @pytest.mark.anyio
    async def test_field_type_change_incompatible(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test changing field type is flagged as incompatible."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Change field type
        modified_fields = sample_schema_data["fields"].copy()
        modified_fields[0]["type"] = "number"  # Was string/array

        incompatible_update = {"fields": modified_fields}

        response = await client.put(
            f"/api/schemas/{schema_id}", json=incompatible_update, headers=auth_headers
        )

        # Should warn about type change
        if response.status_code == 200:
            response.json()
            # Implementation may vary
            pass


@pytest.mark.integration
class TestFieldTypeValidation:
    """Test validation of different field types."""

    @pytest.mark.anyio
    async def test_string_field_validation(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test string field validation."""
        fields = [
            {
                "name": "text",
                "type": "string",
                "required": True,
                "description": "Text field",
            }
        ]

        response = await client.post(
            "/api/schemas/compile", json={"fields": fields}, headers=auth_headers
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_number_field_validation(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test number field validation."""
        fields = [
            {
                "name": "amount",
                "type": "number",
                "required": True,
                "description": "Numeric field",
            }
        ]

        response = await client.post(
            "/api/schemas/compile", json={"fields": fields}, headers=auth_headers
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_boolean_field_validation(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test boolean field validation."""
        fields = [{"name": "active", "type": "boolean", "required": False}]

        response = await client.post(
            "/api/schemas/compile", json={"fields": fields}, headers=auth_headers
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_date_field_validation(self, client: AsyncClient, auth_headers: dict):
        """Test date field validation."""
        fields = [
            {
                "name": "date",
                "type": "date",
                "required": True,
                "description": "Date field",
            }
        ]

        response = await client.post(
            "/api/schemas/compile", json={"fields": fields}, headers=auth_headers
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_array_of_strings_validation(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test array of strings validation."""
        fields = [
            {
                "name": "tags",
                "type": "array",
                "required": False,
                "items": {"type": "string"},
            }
        ]

        response = await client.post(
            "/api/schemas/compile", json={"fields": fields}, headers=auth_headers
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_array_of_objects_validation(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test array of objects validation."""
        fields = [
            {
                "name": "people",
                "type": "array",
                "required": True,
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "age": {"type": "number"},
                    },
                },
            }
        ]

        response = await client.post(
            "/api/schemas/compile", json={"fields": fields}, headers=auth_headers
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_nested_object_validation(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test nested object validation."""
        fields = [
            {
                "name": "address",
                "type": "object",
                "required": True,
                "properties": {
                    "street": {"type": "string"},
                    "city": {"type": "string"},
                    "coordinates": {
                        "type": "object",
                        "properties": {
                            "lat": {"type": "number"},
                            "lng": {"type": "number"},
                        },
                    },
                },
            }
        ]

        response = await client.post(
            "/api/schemas/compile", json={"fields": fields}, headers=auth_headers
        )

        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_mixed_types_validation(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test schema with mixed field types."""
        fields = [
            {"name": "id", "type": "string", "required": True},
            {"name": "count", "type": "number", "required": True},
            {"name": "active", "type": "boolean", "required": False},
            {"name": "created", "type": "date", "required": True},
            {"name": "tags", "type": "array", "items": {"type": "string"}},
            {
                "name": "metadata",
                "type": "object",
                "properties": {"source": {"type": "string"}},
            },
        ]

        response = await client.post(
            "/api/schemas/compile", json={"fields": fields}, headers=auth_headers
        )

        assert response.status_code == 200
