"""Unit tests for app.schemas — Pydantic models, validation, and helper functions.

Tests the schema validation logic, request/response models, and utility functions
WITHOUT hitting any external services (Supabase, file system, AI agents).
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from app.schemas import (
    SCHEMA_NAME_ALLOWED_PATTERN,
    SYSTEM_SCHEMAS,
    CreateSchemaRequest,
    DeleteSchemaResponse,
    SchemaMetadata,
    UpdateSchemaRequest,
    _get_schema_directory,
    _get_schema_metadata_path,
    _load_schema_metadata,
    _save_schema_metadata,
)

# ============================================================================
# CreateSchemaRequest Validation
# ============================================================================


@pytest.mark.unit
class TestCreateSchemaRequest:
    """Tests for CreateSchemaRequest pydantic model and its validators."""

    def test_valid_minimal_schema(self):
        req = CreateSchemaRequest(
            schema_id="my_schema",
            description="A test schema",
            schema_definition={"field_name": {"type": "string"}},
        )
        assert req.schema_id == "my_schema"

    def test_schema_id_allows_hyphens_and_underscores(self):
        req = CreateSchemaRequest(
            schema_id="my-schema_v2",
            description="Valid ID",
            schema_definition={"title": {"type": "string"}},
        )
        assert req.schema_id == "my-schema_v2"

    def test_schema_id_rejects_spaces(self):
        with pytest.raises(ValidationError, match="pattern"):
            CreateSchemaRequest(
                schema_id="invalid schema",
                description="Bad ID",
                schema_definition={"f": {"type": "string"}},
            )

    def test_schema_id_rejects_special_chars(self):
        with pytest.raises(ValidationError):
            CreateSchemaRequest(
                schema_id="schema@#$",
                description="Bad ID",
                schema_definition={"f": {"type": "string"}},
            )

    def test_schema_id_min_length(self):
        with pytest.raises(ValidationError):
            CreateSchemaRequest(
                schema_id="",
                description="Empty ID",
                schema_definition={"f": {"type": "string"}},
            )

    def test_schema_id_max_length(self):
        with pytest.raises(ValidationError):
            CreateSchemaRequest(
                schema_id="x" * 101,
                description="Too long",
                schema_definition={"f": {"type": "string"}},
            )

    def test_description_min_length(self):
        with pytest.raises(ValidationError):
            CreateSchemaRequest(
                schema_id="ok_id",
                description="",
                schema_definition={"f": {"type": "string"}},
            )

    def test_description_max_length(self):
        with pytest.raises(ValidationError):
            CreateSchemaRequest(
                schema_id="ok_id",
                description="x" * 501,
                schema_definition={"f": {"type": "string"}},
            )

    def test_empty_schema_definition_raises(self):
        with pytest.raises(ValidationError, match="Schema cannot be empty"):
            CreateSchemaRequest(
                schema_id="ok_id",
                description="Valid",
                schema_definition={},
            )

    def test_schema_with_too_many_fields_raises(self):
        # Create schema with > 100 fields
        huge_schema = {f"field_{i}": {"type": "string"} for i in range(101)}
        with pytest.raises(ValidationError, match="exceeds the maximum of 100"):
            CreateSchemaRequest(
                schema_id="huge",
                description="Too many fields",
                schema_definition=huge_schema,
            )

    def test_schema_with_deep_nesting_raises(self):
        # Build a schema nested 6 levels deep (max is 5)
        inner = {"leaf": {"type": "string"}}
        for i in range(6):
            inner = {
                f"level_{i}": {
                    "type": "object",
                    "properties": inner,
                }
            }
        with pytest.raises(ValidationError, match="nesting depth exceeds"):
            CreateSchemaRequest(
                schema_id="deep",
                description="Too deep",
                schema_definition=inner,
            )

    def test_schema_with_invalid_field_name(self):
        with pytest.raises(ValidationError, match="Invalid field name"):
            CreateSchemaRequest(
                schema_id="ok_id",
                description="Valid",
                schema_definition={"field with spaces": {"type": "string"}},
            )

    def test_schema_with_valid_nested_object(self):
        schema = {
            "parent": {
                "type": "object",
                "properties": {
                    "child_field": {"type": "string"},
                },
            }
        }
        req = CreateSchemaRequest(
            schema_id="nested",
            description="Nested schema",
            schema_definition=schema,
        )
        assert req.schema_definition == schema

    def test_schema_with_valid_array_of_objects(self):
        schema = {
            "items_list": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "item_name": {"type": "string"},
                    },
                },
            }
        }
        req = CreateSchemaRequest(
            schema_id="array_schema",
            description="Array schema",
            schema_definition=schema,
        )
        assert "items_list" in req.schema_definition

    def test_json_schema_format_with_properties(self):
        """JSON Schema format with top-level 'properties' key is also validated."""
        schema = {
            "properties": {
                "title_field": {"type": "string"},
                "date_field": {"type": "string", "format": "date"},
            }
        }
        req = CreateSchemaRequest(
            schema_id="json_schema",
            description="JSON Schema format",
            schema_definition=schema,
        )
        assert "properties" in req.schema_definition

    def test_exact_100_fields_is_allowed(self):
        schema = {f"field_{i}": {"type": "string"} for i in range(100)}
        req = CreateSchemaRequest(
            schema_id="max_fields",
            description="Exactly 100 fields",
            schema_definition=schema,
        )
        assert len(req.schema_definition) == 100

    def test_nesting_at_depth_5_is_allowed(self):
        """Maximum allowed depth (5 levels) should pass."""
        inner = {"leaf": {"type": "string"}}
        for i in range(5):
            inner = {
                f"level_{i}": {
                    "type": "object",
                    "properties": inner,
                }
            }
        req = CreateSchemaRequest(
            schema_id="depth5",
            description="Max depth",
            schema_definition=inner,
        )
        assert req.schema_definition is not None


# ============================================================================
# UpdateSchemaRequest Validation
# ============================================================================


@pytest.mark.unit
class TestUpdateSchemaRequest:
    def test_none_schema_definition_is_allowed(self):
        req = UpdateSchemaRequest(description="Updated desc")
        assert req.schema_definition is None

    def test_validates_schema_definition_when_provided(self):
        with pytest.raises(ValidationError, match="Schema cannot be empty"):
            UpdateSchemaRequest(schema_definition={})

    def test_valid_update(self):
        req = UpdateSchemaRequest(
            description="New desc",
            schema_definition={"field_a": {"type": "string"}},
        )
        assert req.description == "New desc"

    def test_description_only_update(self):
        req = UpdateSchemaRequest(description="Only description update")
        assert req.schema_definition is None
        assert req.description == "Only description update"


# ============================================================================
# DeleteSchemaResponse
# ============================================================================


@pytest.mark.unit
class TestDeleteSchemaResponse:
    def test_creation(self):
        resp = DeleteSchemaResponse(
            schema_id="test_schema",
            status="deleted",
            message="Schema deleted successfully",
        )
        assert resp.schema_id == "test_schema"
        assert resp.status == "deleted"


# ============================================================================
# SchemaMetadata
# ============================================================================


@pytest.mark.unit
class TestSchemaMetadata:
    def test_minimal_creation(self):
        meta = SchemaMetadata(
            schema_id="test",
            description="Test schema",
            created_at="2024-01-01T00:00:00",
        )
        assert meta.schema_id == "test"
        assert meta.updated_at is None
        assert meta.created_by is None
        assert meta.is_system is False

    def test_full_creation(self):
        meta = SchemaMetadata(
            schema_id="sys_schema",
            description="System schema",
            created_at="2024-01-01T00:00:00",
            updated_at="2024-06-01T00:00:00",
            created_by="admin",
            is_system=True,
        )
        assert meta.is_system is True
        assert meta.created_by == "admin"

    def test_model_dump_roundtrip(self):
        meta = SchemaMetadata(
            schema_id="round",
            description="Roundtrip test",
            created_at="2024-01-01T00:00:00",
        )
        data = meta.model_dump()
        restored = SchemaMetadata(**data)
        assert restored == meta


# ============================================================================
# Constants and Patterns
# ============================================================================


@pytest.mark.unit
class TestConstants:
    def test_system_schemas_are_defined(self):
        assert "ipbox" in SYSTEM_SCHEMAS
        assert "personal_rights" in SYSTEM_SCHEMAS
        assert "swiss_franc_loans" in SYSTEM_SCHEMAS

    def test_schema_name_pattern_allows_valid(self):
        assert SCHEMA_NAME_ALLOWED_PATTERN.match("valid_name-123")
        assert SCHEMA_NAME_ALLOWED_PATTERN.match("CamelCase")

    def test_schema_name_pattern_rejects_invalid(self):
        assert SCHEMA_NAME_ALLOWED_PATTERN.match("has space") is None
        assert SCHEMA_NAME_ALLOWED_PATTERN.match("special@char") is None
        assert SCHEMA_NAME_ALLOWED_PATTERN.match("") is None


# ============================================================================
# Helper Functions
# ============================================================================


@pytest.mark.unit
class TestHelperFunctions:
    @patch("app.schemas.InformationExtractor")
    def test_get_schema_directory_creates_dir(self, mock_extractor, tmp_path):
        mock_extractor.SCHEMA_DIR = "test_schemas"
        with patch("app.schemas.Path") as mock_path_cls:
            mock_base = MagicMock()
            mock_path_cls.return_value = mock_base
            mock_path_cls.__file__ = "fake"
            # We need to patch __file__ indirectly
            with patch("app.schemas.__file__", str(tmp_path / "schemas.py")):
                result = _get_schema_directory()
                # The function should create the directory
                assert result is not None

    def test_get_schema_metadata_path(self):
        with patch("app.schemas._get_schema_directory") as mock_dir:
            mock_dir.return_value = Path("/fake/schemas")
            result = _get_schema_metadata_path("my_schema")
            assert result == Path("/fake/schemas/my_schema.meta.json")

    def test_save_schema_metadata(self, tmp_path):
        meta = SchemaMetadata(
            schema_id="save_test",
            description="Test save",
            created_at="2024-01-01T00:00:00",
        )
        meta_path = tmp_path / "save_test.meta.json"

        with patch("app.schemas._get_schema_metadata_path", return_value=meta_path):
            _save_schema_metadata(meta)

        assert meta_path.exists()
        loaded = json.loads(meta_path.read_text())
        assert loaded["schema_id"] == "save_test"
        assert loaded["description"] == "Test save"

    def test_load_schema_metadata_success(self, tmp_path):
        meta_data = {
            "schema_id": "load_test",
            "description": "Test load",
            "created_at": "2024-01-01T00:00:00",
        }
        meta_path = tmp_path / "load_test.meta.json"
        meta_path.write_text(json.dumps(meta_data))

        with patch("app.schemas._get_schema_metadata_path", return_value=meta_path):
            result = _load_schema_metadata("load_test")

        assert result is not None
        assert result.schema_id == "load_test"

    def test_load_schema_metadata_file_not_found(self, tmp_path):
        meta_path = tmp_path / "nonexistent.meta.json"
        with patch("app.schemas._get_schema_metadata_path", return_value=meta_path):
            result = _load_schema_metadata("nonexistent")
        assert result is None

    def test_load_schema_metadata_invalid_json(self, tmp_path):
        meta_path = tmp_path / "bad.meta.json"
        meta_path.write_text("not valid json {{{")

        with patch("app.schemas._get_schema_metadata_path", return_value=meta_path):
            result = _load_schema_metadata("bad")
        assert result is None


# ============================================================================
# Edge Cases in Schema Validation
# ============================================================================


@pytest.mark.unit
class TestSchemaValidationEdgeCases:
    def test_field_name_with_only_underscores_is_rejected(self):
        """Field names with only underscores are rejected (no alphanumeric chars)."""
        with pytest.raises(ValidationError, match="Invalid field name"):
            CreateSchemaRequest(
                schema_id="edge",
                description="Edge case",
                schema_definition={"___": {"type": "string"}},
            )

    def test_array_without_nested_object_items(self):
        """Array of simple types should pass validation without counting nested fields."""
        schema = {
            "tags": {
                "type": "array",
                "items": {"type": "string"},
            }
        }
        req = CreateSchemaRequest(
            schema_id="simple_array",
            description="Simple array",
            schema_definition=schema,
        )
        assert req.schema_definition == schema

    def test_nested_field_count_accumulates(self):
        """Field count should include nested fields in the total."""
        # 50 top-level + 50 nested = 100 total -> should pass
        nested_props = {f"nested_{i}": {"type": "string"} for i in range(50)}
        schema = {f"top_{i}": {"type": "string"} for i in range(49)}
        schema["parent"] = {"type": "object", "properties": nested_props}
        # Total: 49 + 1 (parent) + 50 (nested) = 100
        req = CreateSchemaRequest(
            schema_id="counting",
            description="Field count test",
            schema_definition=schema,
        )
        assert req.schema_definition is not None

    def test_nested_field_count_exceeds_limit(self):
        """Field count including nested fields exceeding 100 should fail."""
        nested_props = {f"nested_{i}": {"type": "string"} for i in range(51)}
        schema = {f"top_{i}": {"type": "string"} for i in range(50)}
        schema["parent"] = {"type": "object", "properties": nested_props}
        # Total: 50 + 1 (parent) + 51 (nested) = 102
        with pytest.raises(ValidationError, match="exceeds the maximum of 100"):
            CreateSchemaRequest(
                schema_id="too_many",
                description="Over limit",
                schema_definition=schema,
            )

    def test_object_field_without_properties_key(self):
        """Object type without 'properties' shouldn't crash (just count as 1 field)."""
        schema = {
            "metadata": {
                "type": "object",
                "description": "Arbitrary JSON object",
            }
        }
        req = CreateSchemaRequest(
            schema_id="no_props",
            description="Object without properties",
            schema_definition=schema,
        )
        assert req.schema_definition == schema

    def test_array_items_without_object_type(self):
        """Array items that are not objects shouldn't be recursively validated."""
        schema = {
            "scores": {
                "type": "array",
                "items": {"type": "number"},
            }
        }
        req = CreateSchemaRequest(
            schema_id="number_array",
            description="Array of numbers",
            schema_definition=schema,
        )
        assert req.schema_definition == schema
