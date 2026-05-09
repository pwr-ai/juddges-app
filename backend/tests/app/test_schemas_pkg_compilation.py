"""Unit tests for app.schemas_pkg.compilation.

Covers compile_field_to_json_schema, compile_fields_to_json_schema, and
validate_schema_compatibility — the pure functions that turn the visual
editor's flat field list into an OpenAI-compatible JSON Schema and check
the result.
"""

from __future__ import annotations

import pytest

from app.schemas_pkg.compilation import (
    compile_field_to_json_schema,
    compile_fields_to_json_schema,
    validate_schema_compatibility,
)

# ----------------------------------------------------------------------
# compile_field_to_json_schema
# ----------------------------------------------------------------------


@pytest.mark.unit
class TestCompileFieldToJsonSchema:
    def test_string_field_with_description(self):
        field = {
            "field_name": "party_name",
            "field_type": "string",
            "description": "Name of the party",
        }
        result = compile_field_to_json_schema(field)
        assert result == {"type": "string", "description": "Name of the party"}

    def test_field_without_description_omits_key(self):
        field = {"field_name": "x", "field_type": "string"}
        result = compile_field_to_json_schema(field)
        assert result == {"type": "string"}
        assert "description" not in result

    def test_validation_rules_are_merged_into_schema(self):
        field = {
            "field_name": "amount",
            "field_type": "number",
            "validation_rules": {"minimum": 0, "maximum": 100},
        }
        result = compile_field_to_json_schema(field)
        assert result == {"type": "number", "minimum": 0, "maximum": 100}

    def test_array_field_defaults_items_to_string_when_unspecified(self):
        field = {"field_name": "tags", "field_type": "array"}
        result = compile_field_to_json_schema(field)
        assert result == {"type": "array", "items": {"type": "string"}}

    def test_array_field_respects_items_from_validation_rules(self):
        field = {
            "field_name": "tags",
            "field_type": "array",
            "validation_rules": {"items": {"type": "integer"}},
        }
        result = compile_field_to_json_schema(field)
        assert result["items"] == {"type": "integer"}

    def test_array_of_objects_compiles_nested_fields_under_items(self):
        field = {
            "field_name": "parties",
            "field_type": "array",
            "validation_rules": {"items": {"type": "object"}},
        }
        nested = [
            {
                "field_name": "name",
                "field_type": "string",
                "is_required": True,
                "parent_field_path": "parties",
            },
            {
                "field_name": "role",
                "field_type": "string",
                "is_required": False,
                "parent_field_path": "parties",
            },
            {
                "field_name": "unrelated",
                "field_type": "string",
                "parent_field_path": "other_field",
            },
        ]
        result = compile_field_to_json_schema(field, nested)
        assert result["items"]["type"] == "object"
        assert set(result["items"]["properties"].keys()) == {"name", "role"}
        assert result["items"]["required"] == ["name"]
        assert result["items"]["additionalProperties"] is False

    def test_object_field_compiles_nested_properties(self):
        field = {"field_name": "address", "field_type": "object"}
        nested = [
            {
                "field_name": "city",
                "field_type": "string",
                "is_required": True,
                "parent_field_path": "address",
            },
            {
                "field_name": "zip",
                "field_type": "string",
                "is_required": False,
                "parent_field_path": "address",
            },
        ]
        result = compile_field_to_json_schema(field, nested)
        assert result["type"] == "object"
        assert set(result["properties"].keys()) == {"city", "zip"}
        assert result["required"] == ["city"]
        assert result["additionalProperties"] is False

    def test_object_field_with_no_matching_nested_omits_properties(self):
        field = {"field_name": "address", "field_type": "object"}
        nested = [
            {
                "field_name": "city",
                "field_type": "string",
                "parent_field_path": "different_field",
            }
        ]
        result = compile_field_to_json_schema(field, nested)
        # No nested fields matched → no properties block (empty object stub).
        assert "properties" not in result
        assert result == {"type": "object"}


# ----------------------------------------------------------------------
# compile_fields_to_json_schema
# ----------------------------------------------------------------------


@pytest.mark.unit
class TestCompileFieldsToJsonSchema:
    def test_minimal_schema_shape(self):
        fields = [
            {"field_name": "party_name", "field_type": "string", "is_required": True},
            {"field_name": "amount", "field_type": "number", "is_required": False},
        ]
        schema = compile_fields_to_json_schema(fields)

        assert schema["$id"] == "information_extraction_schema"
        assert schema["title"] == "InformationExtraction"
        assert schema["type"] == "object"
        assert schema["additionalProperties"] is False
        assert set(schema["properties"].keys()) == {"party_name", "amount"}
        assert schema["required"] == ["party_name"]

    def test_custom_title_and_description_propagate(self):
        schema = compile_fields_to_json_schema(
            [{"field_name": "x", "field_type": "string"}],
            schema_title="MyTitle",
            schema_description="my desc",
        )
        assert schema["title"] == "MyTitle"
        assert schema["description"] == "my desc"

    def test_top_level_fields_are_sorted_by_position(self):
        fields = [
            {"field_name": "second", "field_type": "string", "position": 2},
            {"field_name": "first", "field_type": "string", "position": 1},
            {"field_name": "third", "field_type": "string", "position": 3},
        ]
        schema = compile_fields_to_json_schema(fields)
        assert list(schema["properties"].keys()) == ["first", "second", "third"]

    def test_nested_fields_are_excluded_from_top_level(self):
        fields = [
            {"field_name": "address", "field_type": "object", "is_required": True},
            {
                "field_name": "city",
                "field_type": "string",
                "parent_field_path": "address",
                "is_required": True,
            },
        ]
        schema = compile_fields_to_json_schema(fields)
        # Only 'address' is top-level; 'city' lives inside it.
        assert list(schema["properties"].keys()) == ["address"]
        assert schema["required"] == ["address"]
        assert schema["properties"]["address"]["properties"]["city"]["type"] == "string"

    def test_required_list_only_contains_required_top_level_fields(self):
        fields = [
            {"field_name": "a", "field_type": "string", "is_required": True},
            {"field_name": "b", "field_type": "string", "is_required": False},
            {"field_name": "c", "field_type": "string"},
        ]
        schema = compile_fields_to_json_schema(fields)
        assert schema["required"] == ["a"]


# ----------------------------------------------------------------------
# validate_schema_compatibility
# ----------------------------------------------------------------------


@pytest.mark.unit
class TestValidateSchemaCompatibility:
    @staticmethod
    def _base_valid_schema() -> dict:
        return {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "..."},
                "amount": {"type": "number"},
            },
            "required": ["name"],
        }

    def test_valid_schema_returns_true_with_no_errors(self):
        ok, errors, warnings = validate_schema_compatibility(self._base_valid_schema())
        assert ok is True
        assert errors == []
        assert warnings == []

    def test_missing_top_level_fields_produces_error(self):
        ok, errors, _ = validate_schema_compatibility({"type": "object"})
        assert ok is False
        assert any("missing required fields" in e for e in errors)
        assert any("properties" in e for e in errors)

    def test_root_type_must_be_object(self):
        schema = {"type": "string", "properties": {}}
        ok, errors, _ = validate_schema_compatibility(schema)
        assert ok is False
        assert any("root type must be 'object'" in e for e in errors)

    def test_properties_must_be_a_dict(self):
        schema = {"type": "object", "properties": ["not", "a", "dict"]}
        ok, errors, _ = validate_schema_compatibility(schema)
        assert ok is False
        assert any("'properties' must be an object/dictionary" in e for e in errors)

    def test_empty_properties_emits_warning(self):
        ok, _, warnings = validate_schema_compatibility(
            {"type": "object", "properties": {}}
        )
        assert ok is True
        assert any("no properties defined" in w for w in warnings)

    def test_required_field_not_in_properties_is_error(self):
        schema = {
            "type": "object",
            "properties": {"a": {"type": "string"}},
            "required": ["a", "missing"],
        }
        ok, errors, _ = validate_schema_compatibility(schema)
        assert ok is False
        assert any("Required field 'missing'" in e for e in errors)

    def test_property_missing_type_is_error(self):
        schema = {"type": "object", "properties": {"x": {"description": "no type"}}}
        ok, errors, _ = validate_schema_compatibility(schema)
        assert ok is False
        assert any("missing 'type'" in e for e in errors)

    def test_invalid_property_type_is_error(self):
        schema = {"type": "object", "properties": {"x": {"type": "datetime"}}}
        ok, errors, _ = validate_schema_compatibility(schema)
        assert ok is False
        assert any("invalid type 'datetime'" in e for e in errors)

    def test_array_without_items_emits_warning(self):
        schema = {"type": "object", "properties": {"tags": {"type": "array"}}}
        ok, _, warnings = validate_schema_compatibility(schema)
        assert ok is True
        assert any("no 'items' definition" in w for w in warnings)

    def test_array_items_missing_type_is_error(self):
        schema = {
            "type": "object",
            "properties": {"tags": {"type": "array", "items": {}}},
        }
        ok, errors, _ = validate_schema_compatibility(schema)
        assert ok is False
        assert any("items missing 'type'" in e for e in errors)

    def test_object_without_nested_properties_emits_warning(self):
        schema = {"type": "object", "properties": {"meta": {"type": "object"}}}
        ok, _, warnings = validate_schema_compatibility(schema)
        assert ok is True
        assert any("no nested properties" in w for w in warnings)

    def test_deep_nesting_emits_warning(self):
        # 6 levels deep -> warning.
        leaf = {"type": "string"}
        nested = leaf
        for _ in range(6):
            nested = {"type": "object", "properties": {"child": nested}}
        schema = {"type": "object", "properties": {"root": nested}}
        ok, _, warnings = validate_schema_compatibility(schema)
        assert ok is True
        assert any("nesting depth" in w for w in warnings)

    def test_too_many_fields_is_error(self):
        properties = {f"f{i}": {"type": "string"} for i in range(101)}
        schema = {"type": "object", "properties": properties}
        ok, errors, _ = validate_schema_compatibility(schema)
        assert ok is False
        assert any("exceeding maximum of 100" in e for e in errors)

    def test_nested_object_in_array_items_is_validated(self):
        # Invalid type inside array's object items should surface as an error.
        schema = {
            "type": "object",
            "properties": {
                "rows": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "bad": {"type": "datetime"},
                        },
                    },
                }
            },
        }
        ok, errors, _ = validate_schema_compatibility(schema)
        assert ok is False
        assert any("invalid type 'datetime'" in e for e in errors)


# ----------------------------------------------------------------------
# End-to-end: compile + validate produces a valid schema
# ----------------------------------------------------------------------


@pytest.mark.unit
def test_compiled_schema_passes_validation():
    fields = [
        {
            "field_name": "party_name",
            "field_type": "string",
            "description": "Name of the party",
            "is_required": True,
            "validation_rules": {"minLength": 1},
            "position": 1,
        },
        {
            "field_name": "amount",
            "field_type": "number",
            "description": "Contract amount",
            "is_required": False,
            "validation_rules": {"minimum": 0},
            "position": 2,
        },
        {
            "field_name": "address",
            "field_type": "object",
            "is_required": True,
            "position": 3,
        },
        {
            "field_name": "city",
            "field_type": "string",
            "is_required": True,
            "parent_field_path": "address",
        },
    ]
    schema = compile_fields_to_json_schema(fields)
    ok, errors, _ = validate_schema_compatibility(schema)
    assert ok, f"Compiled schema rejected by validator: {errors}"
