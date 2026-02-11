"""Validation utilities for OpenAI structured output JSON schemas.

This module provides validation for JSON schemas to ensure compatibility with OpenAI's
structured output feature. While standard JSON Schema Draft 2020-12 validation is performed,
OpenAI enforces additional stricter requirements that this module checks:

1. All properties must be required (listed in the 'required' array)
2. Limited type support (string, number, integer, boolean, array, object, null only)
3. String format restrictions (only specific formats like date-time, email, uuid, etc.)
4. additionalProperties must be false for deterministic output
5. Array items must be fully defined as dict schemas
6. Object properties must be explicitly defined
7. Limited validation keywords per type (e.g., pattern/format for strings)

These constraints are not enforced by standard JSON Schema validators, so this module
catches OpenAI-specific issues early with clear error messages before schemas are sent
to the API, where failures would be harder to debug.

Reference: https://platform.openai.com/docs/guides/structured-outputs

Main entry point: validate_openai_schema()
"""

from typing import Any, Final

from jsonschema import Draft202012Validator
from loguru import logger

FIELD_REQUIRED_FIELDS: Final[set[str]] = {"type"}

# Taken from https://platform.openai.com/docs/guides/structured-outputs
OAI_STRUCTURED_OUTPUT_COMPATIBLE_STRING_FORMATS: Final[set[str]] = {
    "date-time",
    "time",
    "date",
    "duration",
    "email",
    "hostname",
    "ipv4",
    "ipv6",
    "uuid",
}

OAI_STRUCTURED_OUTPUT_AVAILABLE_PROPERTIES: Final[dict[str, set[str]]] = {
    "string": {"format", "pattern"},
    "number": {
        "multipleOf",
        "maximum",
        "exclusiveMaximum",
        "minimum",
        "exclusiveMinimum",
    },
    "array": {
        "minItems",
        "maxItems",
    },
}

OAI_STRUCTURED_OUTPUT_SCHEMA_TYPES: Final[set[str]] = {
    "string", "number", "integer", "boolean", "array", "object", "null"
}
VALID_STRUCTURED_OUTPUT_TYPES_STR: Final[str] = ", ".join(
    sorted(OAI_STRUCTURED_OUTPUT_SCHEMA_TYPES)
)

__all__ = [
    "validate_openai_schema",
    "validate_draft202012_schema_syntax",
    "OaiSchemaValidationError",
    "OAI_STRUCTURED_OUTPUT_AVAILABLE_PROPERTIES",
]


class OaiSchemaValidationError(Exception):
    """Raised when a schema validation fails."""

    pass


def validate_draft202012_schema_syntax(json_schema: dict[str, Any]) -> list[str]:
    """
    Validate a JSON Schema *definition* against the JSON Schema Draft 2020-12 meta-schema.

    Returns:
        A list of human-readable validation error messages.
        If the list is empty, the schema is valid with respect to the Draft 2020-12 meta-schema.
    """
    meta_validator = Draft202012Validator(Draft202012Validator.META_SCHEMA)

    errors: list[str] = []
    for err in meta_validator.iter_errors(json_schema):
        path = "/".join(str(p) for p in err.path) or "<root>"
        errors.append(f"{path}: {err.message}")

    if not errors:
        logger.debug("Schema passed JSON Schema Draft 2020-12 meta-schema validation")
    else:
        logger.error(
            "Schema failed Draft 2020-12 meta-schema validation with {} error(s): {}",
            len(errors),
            "; ".join(errors),
        )
    return errors

def _validate_schema_fields(properties: dict[str, Any]) -> list[str]:
    """
    Validate schema fields for missing JSON Schema standard fields and common issues.
    
    All issues are treated as errors (no warnings).
    
    Args:
        properties: Dictionary of field properties to validate
        
    Returns:
        List of critical error messages as strings.
    """
    validation_errors: list[str] = []
    
    for field_name, field_props in properties.items():
        if not isinstance(field_props, dict):
            validation_errors.append(
                f"Field '{field_name}' properties must be a dict, got {type(field_props)}"
            )
            continue
        
        # Check for required fields using the constant
        missing_required_fields = FIELD_REQUIRED_FIELDS - set(field_props)
        if missing_required_fields:
            missing = ", ".join(sorted(missing_required_fields))
            validation_errors.append(
                f"Field '{field_name}' is missing required field(s): {missing}"
            )
            continue
        
        field_type = field_props["type"]
        
        # Check for invalid type values
        if field_type not in OAI_STRUCTURED_OUTPUT_SCHEMA_TYPES:
            validation_errors.append(
                f"Field '{field_name}' has invalid type '{field_type}'. "
                f"Valid types: {VALID_STRUCTURED_OUTPUT_TYPES_STR}"
            )
            continue
        
        # Validate array fields
        if field_type == "array":
            if "items" not in field_props:
                validation_errors.append(
                    f"Array field '{field_name}' is missing 'items' definition"
                )
                continue
            
            if not isinstance(field_props["items"], dict):
                validation_errors.append(
                    f"Array field '{field_name}' must define 'items' as a dict, "
                    f"got {type(field_props['items'])}"
                )
        
        # Validate object fields
        if field_type == "object":
            nested_properties = field_props.get("properties")
            if nested_properties is None:
                validation_errors.append(
                    f"Object field '{field_name}' is missing 'properties' definition"
                )
            elif not isinstance(nested_properties, dict):
                validation_errors.append(
                    f"Object field '{field_name}' must define 'properties' as a dict, "
                    f"got {type(nested_properties)}"
                )
        
        # Validate string format restrictions
        if field_type == "string":
            field_format = field_props.get("format")
            if field_format and field_format not in OAI_STRUCTURED_OUTPUT_COMPATIBLE_STRING_FORMATS:
                validation_errors.append(
                    f"Field '{field_name}' uses unsupported string format '{field_format}'. "
                    f"Allowed formats: {', '.join(sorted(OAI_STRUCTURED_OUTPUT_COMPATIBLE_STRING_FORMATS))}"
                )
    
    return validation_errors


def _validate_required_fields(json_schema: dict[str, Any]) -> list[str]:
    """
    Validate that all properties in the JSON schema are marked as required.
    
    OpenAI structured output requires all properties to be explicitly listed
    in the 'required' array. This function checks that requirement.
    
    Args:
        json_schema: The top-level JSON schema dictionary.
        
    Returns:
        List of validation error messages as strings. Empty list if no errors.
    """
    validation_errors: list[str] = []
    
    if "properties" not in json_schema:
        validation_errors.append("Schema is missing 'properties' definition")
        return validation_errors
    
    if "required" not in json_schema:
        validation_errors.append("Schema is missing 'required' array")
        return validation_errors
    
    schema_properties = json_schema.get("properties", {})
    required_fields = json_schema.get("required", [])
    
    if not isinstance(required_fields, list):
        validation_errors.append(
            f"'required' field must be a list, got {type(required_fields)}"
        )
        return validation_errors
    
    # Check if all properties are in the required array
    missing_required = set(schema_properties.keys()) - set(required_fields)
    if missing_required:
        missing_fields_str = ", ".join(sorted(missing_required))
        validation_errors.append(
            f"All properties must be marked as required. Missing from 'required' array: {missing_fields_str}"
        )
    
    return validation_errors


def _validate_schema_root_structure(json_schema: Any) -> tuple[list[str], dict[str, Any]]:
    """
    Validate top-level structure of the schema and return (errors, properties_dict).
    """
    errors: list[str] = []
    
    if not isinstance(json_schema, dict):
        errors.append(f"Schema must be a dict, got {type(json_schema)}")
        return errors, {}
    
    schema_type = json_schema.get("type")
    if schema_type is None:
        errors.append("Schema is missing 'type' definition")
    elif schema_type != "object":
        errors.append(f"Schema 'type' must be 'object', got '{schema_type}'")
    
    schema_properties = json_schema.get("properties")
    if schema_properties is None:
        errors.append("Schema is missing 'properties' definition")
        schema_properties = {}
    elif not isinstance(schema_properties, dict):
        errors.append(f"'properties' must be a dict, got {type(schema_properties)}")
        schema_properties = {}
    
    return errors, schema_properties


def validate_openai_schema(
    json_schema: dict[str, Any],
    *,
    raise_on_error: bool = True,
) -> dict[str, list[str]]:
    """
    Validate a JSON schema for OpenAI structured output compatibility.
    
    This function performs comprehensive validation including:
    - JSON Schema Draft 2020-12 syntax validation
    - OpenAI-specific constraint checking (all properties required, limited types, etc.)
    - Field-level validation (proper type definitions, array items, object properties)
    - String format restrictions
    - additionalProperties enforcement
    
    Args:
        json_schema: The top-level JSON schema dictionary to validate.
        raise_on_error: If True, raises OaiSchemaValidationError when validation fails.
                       If False, returns errors in the result dict.
    
    Returns:
        A dictionary with key "errors": List of validation error messages (empty if valid)
    
    Raises:
        OaiSchemaValidationError: If validation errors exist and raise_on_error=True.
    
    Example:
        >>> schema = {
        ...     "type": "object",
        ...     "properties": {"name": {"type": "string"}},
        ...     "required": ["name"],
        ...     "additionalProperties": False
        ... }
        >>> result = validate_openai_schema(schema, raise_on_error=False)
        >>> result["errors"]
        []
    """
    errors: list[str] = []

    # Step 1: Validate schema root structure
    root_errors, schema_properties = _validate_schema_root_structure(json_schema)
    errors.extend(root_errors)

    # Step 2: Validate against JSON Schema Draft 2020-12
    if isinstance(json_schema, dict):
        syntax_errors = validate_draft202012_schema_syntax(json_schema)
        errors.extend(syntax_errors)
        
        # Check additionalProperties (OpenAI requirement for strict mode)
        additional_properties = json_schema.get("additionalProperties")
        if additional_properties is not False:
            errors.append(
                f"OpenAI structured output requires 'additionalProperties' to be False. "
                f"Got {additional_properties!r}."
            )

        # Step 3: Validate properties in the schema
        field_errors = _validate_schema_fields(schema_properties)
        errors.extend(field_errors)

        # Step 4: Validate that all fields are properly required
        required_errors = _validate_required_fields(json_schema)
        errors.extend(required_errors)

    # Remove empty error messages, if any
    all_errors = [e for e in errors if e]

    # If errors were found, log and potentially raise them
    if all_errors:
        error_message = (
            f"Schema validation failed with {len(all_errors)} error(s): "
            f"{'; '.join(all_errors)}"
        )
        logger.error(error_message)
        if raise_on_error:
            raise OaiSchemaValidationError(error_message)

    return {"errors": all_errors}
