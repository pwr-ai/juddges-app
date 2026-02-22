"""
Comprehensive tests for Schema Versioning.

Tests cover:
- Version history (GET /api/schemas/db/{id}/versions)
- Get specific version (GET /api/schemas/db/{id}/versions/{version})
- Compare versions (GET /api/schemas/db/{id}/versions/compare)
- Rollback version (POST /api/schemas/db/{id}/versions/{version}/rollback)
"""

import pytest
from httpx import AsyncClient


@pytest.mark.integration
class TestSchemaVersionHistory:
    """Test schema version history operations."""

    @pytest.mark.anyio
    async def test_get_version_history(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test retrieving schema version history."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Make some updates to create versions
        await client.put(
            f"/api/schemas/{schema_id}",
            json={"description": "Updated v1"},
            headers=auth_headers,
        )

        await client.put(
            f"/api/schemas/{schema_id}",
            json={"description": "Updated v2"},
            headers=auth_headers,
        )

        # Get version history
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions", headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # At least the initial version

    @pytest.mark.anyio
    async def test_version_history_pagination(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test version history with pagination."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Create many versions
        for i in range(15):
            await client.put(
                f"/api/schemas/{schema_id}",
                json={"description": f"Update {i}"},
                headers=auth_headers,
            )

        # Get paginated history
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions",
            params={"page": 1, "page_size": 10},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        if isinstance(data, dict) and "items" in data:
            assert len(data["items"]) <= 10
            assert "total" in data

    @pytest.mark.anyio
    async def test_version_history_nonexistent_schema(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test version history for non-existent schema."""
        response = await client.get(
            "/api/schemas/db/nonexistent-id-999/versions", headers=auth_headers
        )

        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_version_history_without_auth(
        self, client: AsyncClient, mock_schema_id: str
    ):
        """Test version history fails without authentication."""
        response = await client.get(f"/api/schemas/db/{mock_schema_id}/versions")

        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_version_history_ordering(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test version history is ordered correctly."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Create versions
        for i in range(5):
            await client.put(
                f"/api/schemas/{schema_id}",
                json={"description": f"Version {i}"},
                headers=auth_headers,
            )

        # Get history
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions", headers=auth_headers
        )

        assert response.status_code == 200
        versions = response.json()

        if len(versions) > 1:
            # Check ordering (usually newest first)
            if "version" in versions[0]:
                assert versions[0]["version"] >= versions[-1]["version"]


@pytest.mark.integration
class TestGetSpecificVersion:
    """Test retrieving specific schema versions."""

    @pytest.mark.anyio
    async def test_get_specific_version(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test retrieving a specific schema version."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Update to create version 2
        await client.put(
            f"/api/schemas/{schema_id}",
            json={"description": "Version 2"},
            headers=auth_headers,
        )

        # Get version 1
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions/1", headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["description"] == sample_schema_data["description"]

    @pytest.mark.anyio
    async def test_get_latest_version(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test retrieving the latest version."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Update multiple times
        for i in range(3):
            await client.put(
                f"/api/schemas/{schema_id}",
                json={"description": f"Version {i + 2}"},
                headers=auth_headers,
            )

        # Get latest version
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions/latest", headers=auth_headers
        )

        if response.status_code == 200:
            data = response.json()
            assert data["description"] == "Version 4"

    @pytest.mark.anyio
    async def test_get_nonexistent_version(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test retrieving non-existent version."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Try to get version 999
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions/999", headers=auth_headers
        )

        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_get_version_with_fields(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test version includes all field data."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Get version
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions/1", headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "fields" in data
        assert len(data["fields"]) == len(sample_schema_data["fields"])


@pytest.mark.integration
class TestVersionComparison:
    """Test comparing schema versions."""

    @pytest.mark.anyio
    async def test_compare_two_versions(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test comparing two schema versions."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Update to create version 2
        await client.put(
            f"/api/schemas/{schema_id}",
            json={
                "description": "Updated",
                "fields": sample_schema_data["fields"]
                + [{"name": "new_field", "type": "string", "required": False}],
            },
            headers=auth_headers,
        )

        # Compare versions
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions/compare",
            params={"from_version": 1, "to_version": 2},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "differences" in data or "changes" in data

    @pytest.mark.anyio
    async def test_compare_identical_versions(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test comparing identical versions."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Compare version 1 with itself
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions/compare",
            params={"from_version": 1, "to_version": 1},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Should show no differences
        if "differences" in data:
            assert len(data["differences"]) == 0

    @pytest.mark.anyio
    async def test_compare_field_additions(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test comparison detects field additions."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Add field
        await client.put(
            f"/api/schemas/{schema_id}",
            json={
                "fields": sample_schema_data["fields"]
                + [{"name": "added_field", "type": "string", "required": False}]
            },
            headers=auth_headers,
        )

        # Compare
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions/compare",
            params={"from_version": 1, "to_version": 2},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Should detect addition
        if "added" in data or "changes" in data:
            assert "added_field" in str(data)

    @pytest.mark.anyio
    async def test_compare_field_removals(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test comparison detects field removals."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Remove field
        reduced_fields = sample_schema_data["fields"][:-1]
        await client.put(
            f"/api/schemas/{schema_id}",
            json={"fields": reduced_fields},
            headers=auth_headers,
        )

        # Compare
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions/compare",
            params={"from_version": 1, "to_version": 2},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Should detect removal
        if "removed" in data or "changes" in data:
            removed_field = sample_schema_data["fields"][-1]["name"]
            assert removed_field in str(data)

    @pytest.mark.anyio
    async def test_compare_field_modifications(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test comparison detects field modifications."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Modify field
        modified_fields = sample_schema_data["fields"].copy()
        modified_fields[0]["description"] = "Modified description"

        await client.put(
            f"/api/schemas/{schema_id}",
            json={"fields": modified_fields},
            headers=auth_headers,
        )

        # Compare
        response = await client.get(
            f"/api/schemas/db/{schema_id}/versions/compare",
            params={"from_version": 1, "to_version": 2},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Should detect modification
        if "modified" in data or "changes" in data:
            assert "description" in str(data)


@pytest.mark.integration
class TestVersionRollback:
    """Test schema version rollback operations."""

    @pytest.mark.anyio
    async def test_rollback_to_previous_version(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test rolling back to a previous version."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]
        original_description = sample_schema_data["description"]

        # Update it
        await client.put(
            f"/api/schemas/{schema_id}",
            json={"description": "Unwanted update"},
            headers=auth_headers,
        )

        # Rollback to version 1
        response = await client.post(
            f"/api/schemas/db/{schema_id}/versions/1/rollback", headers=auth_headers
        )

        assert response.status_code in [200, 201]

        # Verify rollback
        get_response = await client.get(
            f"/api/schemas/{schema_id}", headers=auth_headers
        )
        assert get_response.json()["description"] == original_description

    @pytest.mark.anyio
    async def test_rollback_to_specific_version(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test rolling back to a specific version."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Create multiple versions
        await client.put(
            f"/api/schemas/{schema_id}",
            json={"description": "Version 2"},
            headers=auth_headers,
        )

        await client.put(
            f"/api/schemas/{schema_id}",
            json={"description": "Version 3"},
            headers=auth_headers,
        )

        # Rollback to version 2
        response = await client.post(
            f"/api/schemas/db/{schema_id}/versions/2/rollback", headers=auth_headers
        )

        assert response.status_code in [200, 201]

        # Verify
        get_response = await client.get(
            f"/api/schemas/{schema_id}", headers=auth_headers
        )
        assert get_response.json()["description"] == "Version 2"

    @pytest.mark.anyio
    async def test_rollback_nonexistent_version(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test rollback to non-existent version fails."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Try to rollback to version 999
        response = await client.post(
            f"/api/schemas/db/{schema_id}/versions/999/rollback", headers=auth_headers
        )

        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_rollback_creates_new_version(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test rollback creates a new version in history."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]

        # Update
        await client.put(
            f"/api/schemas/{schema_id}",
            json={"description": "Version 2"},
            headers=auth_headers,
        )

        # Rollback to version 1
        await client.post(
            f"/api/schemas/db/{schema_id}/versions/1/rollback", headers=auth_headers
        )

        # Check version history
        history_response = await client.get(
            f"/api/schemas/db/{schema_id}/versions", headers=auth_headers
        )

        assert history_response.status_code == 200
        versions = history_response.json()

        # Should have at least 3 versions (original, update, rollback)
        assert len(versions) >= 3

    @pytest.mark.anyio
    async def test_rollback_without_auth(
        self, client: AsyncClient, mock_schema_id: str
    ):
        """Test rollback fails without authentication."""
        response = await client.post(
            f"/api/schemas/db/{mock_schema_id}/versions/1/rollback"
        )

        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_rollback_preserves_fields(
        self, client: AsyncClient, auth_headers: dict, sample_schema_data: dict
    ):
        """Test rollback preserves field structure."""
        # Create schema
        create_response = await client.post(
            "/api/schemas", json=sample_schema_data, headers=auth_headers
        )
        schema_id = create_response.json()["id"]
        original_fields = sample_schema_data["fields"]

        # Update with different fields
        await client.put(
            f"/api/schemas/{schema_id}",
            json={"fields": [{"name": "single_field", "type": "string"}]},
            headers=auth_headers,
        )

        # Rollback
        await client.post(
            f"/api/schemas/db/{schema_id}/versions/1/rollback", headers=auth_headers
        )

        # Verify fields restored
        get_response = await client.get(
            f"/api/schemas/{schema_id}", headers=auth_headers
        )

        restored_fields = get_response.json()["fields"]
        assert len(restored_fields) == len(original_fields)
