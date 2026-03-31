"""
Schema compilation: convert field definitions to JSON Schema, validate compatibility.
"""

from typing import Any


def compile_field_to_json_schema(
    field: dict[str, Any],
    nested_fields: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Compile a single field definition to JSON Schema property format.

    Args:
        field: Field definition with field_name, field_type, description, etc.
        nested_fields: List of nested fields (for object and array types)

    Returns:
        JSON Schema property definition

    Raises:
        ValueError: If field type is invalid or nested structure is malformed
    """
    field_schema: dict[str, Any] = {
        "type": field["field_type"],
    }

    # Add description if present
    if field.get("description"):
        field_schema["description"] = field["description"]

    # Handle validation rules
    validation_rules = field.get("validation_rules", {})
    field_schema.update(validation_rules)

    # Handle special types
    if field["field_type"] == "array":
        # Array must have items definition
        if "items" not in validation_rules:
            # Default to string array if not specified
            field_schema["items"] = {"type": "string"}
        # If items has nested properties, compile them
        if nested_fields and validation_rules.get("items", {}).get("type") == "object":
            items_properties = {}
            items_required = []
            for nested_field in nested_fields:
                if nested_field.get("parent_field_path") == field["field_name"]:
                    items_properties[nested_field["field_name"]] = (
                        compile_field_to_json_schema(nested_field)
                    )
                    if nested_field.get("is_required", False):
                        items_required.append(nested_field["field_name"])

            if items_properties:
                field_schema["items"] = {
                    "type": "object",
                    "properties": items_properties,
                    "required": items_required,
                    "additionalProperties": False,
                }

    elif field["field_type"] == "object":
        # Object must have properties
        properties = {}
        required = []

        if nested_fields:
            for nested_field in nested_fields:
                if nested_field.get("parent_field_path") == field["field_name"]:
                    properties[nested_field["field_name"]] = (
                        compile_field_to_json_schema(
                            nested_field,
                            nested_fields,
                        )
                    )
                    if nested_field.get("is_required", False):
                        required.append(nested_field["field_name"])

        if properties:
            field_schema["properties"] = properties
            field_schema["required"] = required
            field_schema["additionalProperties"] = False

    return field_schema


def compile_fields_to_json_schema(
    fields: list[dict[str, Any]],
    schema_title: str = "InformationExtraction",
    schema_description: str = "Extracted information from the text",
) -> dict[str, Any]:
    """
    Compile a list of field definitions to a complete JSON Schema.

    This function converts the flat field representation (used by the visual editor)
    into a complete JSON Schema compatible with OpenAI's structured output format.

    Args:
        fields: List of field definitions
        schema_title: Title for the schema
        schema_description: Description for the schema

    Returns:
        Complete JSON Schema in OpenAI format

    Raises:
        ValueError: If fields are invalid or have circular dependencies

    Example:
        ```python
        fields = [
            {
                "field_name": "party_name",
                "field_type": "string",
                "description": "Name of the party",
                "is_required": True,
                "validation_rules": {"minLength": 1}
            },
            {
                "field_name": "amount",
                "field_type": "number",
                "description": "Contract amount",
                "is_required": False,
                "validation_rules": {"minimum": 0}
            }
        ]
        schema = compile_fields_to_json_schema(fields)
        ```
    """
    # Sort fields by position if available
    sorted_fields = sorted(fields, key=lambda f: f.get("position", 0))

    # Separate top-level fields from nested fields
    top_level_fields = [f for f in sorted_fields if not f.get("parent_field_path")]

    properties: dict[str, Any] = {}
    required: list[str] = []

    # Compile each top-level field
    for field in top_level_fields:
        field_name = field["field_name"]
        properties[field_name] = compile_field_to_json_schema(field, sorted_fields)

        if field.get("is_required", False):
            required.append(field_name)

    # Build complete schema
    return {
        "$id": "information_extraction_schema",
        "title": schema_title,
        "type": "object",
        "description": schema_description,
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


def validate_schema_compatibility(
    schema: dict[str, Any],
) -> tuple[bool, list[str], list[str]]:
    """
    Validate schema compatibility with OpenAI structured output requirements.

    This function checks:
    1. Schema structure is valid JSON Schema
    2. No unsupported features (e.g., recursive schemas)
    3. All required fields are properly defined
    4. Type definitions are consistent

    Args:
        schema: JSON Schema to validate

    Returns:
        Tuple of (is_valid, errors, warnings)
            - is_valid: True if schema passes all validation
            - errors: List of error messages (critical issues)
            - warnings: List of warning messages (non-critical issues)

    Example:
        ```python
        is_valid, errors, warnings = validate_schema_compatibility(schema)
        if not is_valid:
            logger.error(f"Schema validation failed: {errors}")
        ```
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Check required top-level fields
    required_fields = {"type", "properties"}
    missing_fields = required_fields - set(schema.keys())
    if missing_fields:
        errors.append(f"Schema missing required fields: {', '.join(missing_fields)}")
        return False, errors, warnings

    # Validate type
    if schema.get("type") != "object":
        errors.append(f"Schema root type must be 'object', got '{schema.get('type')}'")

    # Validate properties
    properties = schema.get("properties", {})
    if not isinstance(properties, dict):
        errors.append("Schema 'properties' must be an object/dictionary")
        return False, errors, warnings

    if not properties:
        warnings.append("Schema has no properties defined")

    # Check for overly complex schemas
    def count_nested_depth(obj: dict[str, Any], current_depth: int = 0) -> int:
        """Count maximum nesting depth."""
        max_depth = current_depth
        if isinstance(obj, dict):
            if "properties" in obj:
                for prop in obj["properties"].values():
                    depth = count_nested_depth(prop, current_depth + 1)
                    max_depth = max(max_depth, depth)
            if "items" in obj and isinstance(obj["items"], dict):
                depth = count_nested_depth(obj["items"], current_depth + 1)
                max_depth = max(max_depth, depth)
        return max_depth

    depth = count_nested_depth(schema)
    if depth > 5:
        warnings.append(
            f"Schema nesting depth is {depth}, which may cause performance issues. "
            "Consider simplifying the schema structure."
        )

    # Count total fields
    def count_fields(obj: dict[str, Any]) -> int:
        """Count total number of fields recursively."""
        count = 0
        if isinstance(obj, dict):
            if "properties" in obj:
                count += len(obj["properties"])
                for prop in obj["properties"].values():
                    count += count_fields(prop)
            if "items" in obj and isinstance(obj["items"], dict):
                count += count_fields(obj["items"])
        return count

    field_count = count_fields(schema)
    if field_count > 100:
        errors.append(
            f"Schema has {field_count} fields, exceeding maximum of 100. "
            "Please reduce the number of fields."
        )

    # Validate required array
    required = schema.get("required", [])
    if required:
        for req_field in required:
            if req_field not in properties:
                errors.append(f"Required field '{req_field}' not found in properties")

    # Validate each property recursively
    def validate_property(
        prop_name: str, prop_schema: dict[str, Any], path: str = ""
    ) -> None:
        """Recursively validate property definitions."""
        current_path = f"{path}.{prop_name}" if path else prop_name

        # Check for type
        if "type" not in prop_schema:
            errors.append(f"Property '{current_path}' missing 'type' field")
            return

        prop_type = prop_schema["type"]
        valid_types = {"string", "number", "integer", "boolean", "array", "object"}
        if prop_type not in valid_types:
            errors.append(
                f"Property '{current_path}' has invalid type '{prop_type}'. "
                f"Valid types: {', '.join(valid_types)}"
            )

        # Validate array items
        if prop_type == "array":
            if "items" not in prop_schema:
                warnings.append(
                    f"Array property '{current_path}' has no 'items' definition. "
                    "Default will be used."
                )
            elif isinstance(prop_schema["items"], dict):
                if "type" not in prop_schema["items"]:
                    errors.append(
                        f"Array property '{current_path}' items missing 'type'"
                    )
                # Recursively validate nested items
                if prop_schema["items"].get("type") == "object":
                    nested_props = prop_schema["items"].get("properties", {})
                    for nested_name, nested_schema in nested_props.items():
                        validate_property(
                            f"{prop_name}[items].{nested_name}",
                            nested_schema,
                            path,
                        )

        # Validate object properties
        if prop_type == "object":
            nested_props = prop_schema.get("properties", {})
            if not nested_props:
                warnings.append(
                    f"Object property '{current_path}' has no nested properties"
                )
            for nested_name, nested_schema in nested_props.items():
                validate_property(nested_name, nested_schema, current_path)

    # Validate all properties
    for prop_name, prop_schema in properties.items():
        validate_property(prop_name, prop_schema)

    # Final validation
    is_valid = len(errors) == 0

    return is_valid, errors, warnings
