import json
import re
import warnings
from typing import Any, Final

from loguru import logger

from .oai_schema_validation import (
    OAI_STRUCTURED_OUTPUT_AVAILABLE_PROPERTIES,
    OaiSchemaValidationError,
    validate_openai_schema,
)


class SchemaProcessingError(Exception):
    """Raised when schema processing fails due to invalid or missing required fields."""
    pass

# Fields in db that are required for the schema to be valid
SCHEMA_DB_REQUIRED_FIELDS: Final[set[str]] = {
    "name",
    "description",
    "text",
}

def parse_array_items(field_values: dict[str, Any] | None, language: str) -> dict[str, Any]:
    """
    DEPRECATED: This conversion utility should not be needed in the future.
    
    Parse array items schema, supporting simple types, simple objects, and objects with nested properties.
    
    TODO: Remove this function once all schemas are validated and stored in OpenAI format
          at the time they are added to the database. Schemas should pass validation
          via validate_openai_schema() during creation, eliminating the need for conversion.
    
    Example:
    {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
            "sku": { "type": "string" },
            "qty": { "type": "number" }
            }
        }
    }    
    Args:
        field_values: The items schema from the array field (can be None for default)
        language: Language code ("pl" or "en") for localized error messages
        
    Returns:
        Parsed items schema dict
        
    Raises:
        SchemaProcessingError: If items schema is invalid
    """
    if field_values is None:
        return {"type": "string"}
    
    # Only parse if it's an object with properties
    if not isinstance(field_values, dict) or field_values.get("type") != "object" or "properties" not in field_values:
        return field_values
        
    items_properties = field_values.get("properties", {})
    parsed_properties = {}
    required_fields = []
    
    for prop_name, prop_config in items_properties.items():
        if not isinstance(prop_config, dict):
            raise SchemaProcessingError(
                f"Array item property '{prop_name}' must be a dict. Got {type(prop_config)}: {prop_config}"
            )
        if "type" not in prop_config:
            raise SchemaProcessingError(
                f"Array item property '{prop_name}' is missing required 'type' field. Property config: {prop_config}"
            )
        
        # Parse property (simple or nested)
        if "properties" in prop_config:
            parsed_properties[prop_name] = parse_field_with_nested_fields(prop_config, language)
        else:
            parsed_properties[prop_name] = parse_field_without_nested_fields(prop_config, language)
        
        # OpenAI requires all properties listed in required
        required_fields.append(prop_name)
    
    return {
        "type": "object",
        "properties": parsed_properties,
        "required": required_fields,
        "additionalProperties": field_values.get("additionalProperties", False),
    }

def parse_field_without_nested_fields(values: dict[str, Any], language: str) -> dict[str, Any]:
    """
    DEPRECATED: This conversion utility should not be needed in the future.
    
    TODO: Remove this function once all schemas are validated and stored in OpenAI format
          at the time they are added to the database.
    """
    logger.info("Parsing field without nested fields")
    
    # Type field is REQUIRED - cannot parse field correctly without it
    if "type" not in values:
        logger.error(f"Field is missing required 'type' field. Cannot parse field correctly without type. Field values: {values}")
        raise SchemaProcessingError(
            f"Field is missing required 'type' field. Cannot parse field correctly without type. "
            f"Field values: {values}"
        )
    
    field_type = values["type"]
    properties: dict[str, Any] = {
        "type": field_type,
        "description": values.get("description", ""),
    }
    # Detect if the field is enum
    if "enum" in values:
        properties["enum"] = values["enum"]

    # We want to use only supported fields
    if field_type in OAI_STRUCTURED_OUTPUT_AVAILABLE_PROPERTIES:
        for field in OAI_STRUCTURED_OUTPUT_AVAILABLE_PROPERTIES[field_type]:
            if field in values:
                properties[field] = values[field]

    # Handle array items - support simple types, simple objects, and objects with nested properties
    if properties["type"] == "array":
        properties["items"] = parse_array_items(values.get("items"), language)    
    
    # OpenAI structured output does not support examples, so we add them to the description
    if "examples" in values:
        examples_label = "Przykłady" if language == "pl" else "Examples"
        properties["description"] += f"\n{examples_label}: {values['examples']}"

    return properties

def parse_field_with_nested_fields(values: dict[str, Any], language: str) -> dict[str, Any]:
    """
    DEPRECATED: This conversion utility should not be needed in the future.
    
    TODO: Remove this function once all schemas are validated and stored in OpenAI format
          at the time they are added to the database.
    """
    logger.info("Parsing field with nested fields")
    
    # Type field is REQUIRED - cannot parse field correctly without it
    if "type" not in values:
        logger.error(f"Field with nested properties is missing required 'type' field. Cannot parse field correctly without type. Field values: {values}")
        raise SchemaProcessingError(
            f"Field with nested properties is missing required 'type' field. Cannot parse field correctly without type. "
            f"Field values: {values}"
        )
    
    # It is standard for nested fields to be of type "object", but preserve input type in case of custom handling.
    properties: dict[str, Any] = {"type": values.get("type", "object")}
    
    # Extract required field names from nested properties
    nested_properties = values.get("properties", {})
    if not isinstance(nested_properties, dict):
        logger.error(f"nested_properties is not a dict, got {type(nested_properties)}: {nested_properties}")
        raise ValueError(f"Field with nested properties must have 'properties' as a dict, got {type(nested_properties)}")
    
    required_field_names = list(nested_properties.keys())
    properties["required"] = required_field_names
    
    properties["additionalProperties"] = values.get("additionalProperties", False)
    
    # Parse nested properties - each must have type field
    parsed_nested_properties = {}
    for prop_name, prop_config in nested_properties.items():
        if not isinstance(prop_config, dict):
            raise SchemaProcessingError(
                f"Nested property '{prop_name}' must be a dict. Got {type(prop_config)}: {prop_config}"
            )
        if "type" not in prop_config:
            raise SchemaProcessingError(
                f"Nested property '{prop_name}' is missing required 'type' field. Cannot parse field correctly without type. "
                f"Property config: {prop_config}"
            )
        parsed_nested_properties[prop_name] = parse_field_without_nested_fields(prop_config, language)
    
    properties["properties"] = parsed_nested_properties
    
    logger.debug(f"parse_field_with_nested_fields returning properties with {len(properties.get('properties', {}))} nested fields, {len(required_field_names)} required")
    return properties


def convert_schema_to_oai_structured_output(schema: dict[str, Any], language: str, strict: bool = True) -> dict[str, Any]:
    """
    DEPRECATED: Convert a schema from database format to OpenAI structured output format.
    
    This function exists to handle legacy schemas that were stored in database without
    proper validation. In the future, schemas should be validated using validate_openai_schema()
    at the time they are created/added, making this conversion unnecessary.
    
    TODO: Deprecate this function once schema validation is enforced at creation time.
          All schemas should be stored in valid OpenAI format from the start.
          
    Migration path:
    1. Add validation in schema creation endpoints (POST /schemas/db)
    2. Migrate existing schemas to OpenAI format
    3. Remove conversion logic and use schemas as-is
    
    Args:
        schema: Schema dict from database with 'name', 'description', 'text' fields
        language: Language code ("pl" or "en") for localized instructions
        strict: Whether to use strict mode for OpenAI structured output
        
    Returns:
        Schema converted to OpenAI structured output format
    """
    warnings.warn(
        "convert_schema_to_oai_structured_output() is deprecated. "
        "TODO: Validate schemas at creation time instead of converting them later.",
        PendingDeprecationWarning,
        stacklevel=2,
    )
    logger.info(f"Starting schema conversion.")

    # Validate language
    if language not in {"pl", "en"}:
        logger.error(f"language must be 'pl' or 'en', got: {language}")
        raise SchemaProcessingError(f"language must be 'pl' or 'en', got: {language}")
    
    # Validate schema state in database
    if not all(field in schema for field in SCHEMA_DB_REQUIRED_FIELDS):
        missing = [f for f in SCHEMA_DB_REQUIRED_FIELDS if f not in schema]
        logger.error(f"Schema is missing required fields: {missing}")
        raise SchemaProcessingError(f"Schema is missing required fields: {', '.join(SCHEMA_DB_REQUIRED_FIELDS)}")

    # Schema values are stored in "text" field
    text_schema = schema["text"]
    
    # Ensure text_schema is a dict
    if not isinstance(text_schema, dict):
        logger.error(f"Schema 'text' field is not a dict, got {type(text_schema)}: {text_schema}")
        raise SchemaProcessingError(f"Schema 'text' field must be a dict or JSON string, got {type(text_schema)}")
    
    logger.debug(f"text_schema is a dict with {len(text_schema)} fields")

    # Handle schemas that are already in JSON Schema format (have "type" and "properties" at root)
    # These schemas have structure like: {"type": "object", "properties": {...}, ...}
    # vs the expected internal format: {"field_name": {"type": "string", ...}, ...}
    if text_schema.get("type") == "object" and "properties" in text_schema:
        logger.info("Detected JSON Schema format in 'text' field, extracting properties")
        text_schema = text_schema["properties"]
        if not isinstance(text_schema, dict):
            logger.error(f"Schema 'text.properties' field is not a dict, got {type(text_schema)}")
            raise SchemaProcessingError(f"Schema 'text.properties' must be a dict, got {type(text_schema)}")

    # Currently name is not taken from the schema, because OpenAI requires specific naming format.
    # However it is still required by OpenAI structured output
    # So we use a safe default schema name
    structured_output = {
        "name": "information_extraction_schema",  # Default name for the schema that follows OpenAI structured output format
        "description": schema.get("description", ""),
        "strict": strict,
        "schema": {
            "type": "object",
            "additionalProperties": False,
        }
    }
    properties: dict[str, Any] = {}
    required_fields: list[str] = []
    for field, field_values in text_schema.items():
        logger.debug(f"Processing field '{field}'. field_values type: {type(field_values)}")
        
        if not isinstance(field_values, dict):
            logger.error(f"Field '{field}' is not a dict after parsing, got {type(field_values)}: {field_values}")
            raise SchemaProcessingError(f"Field '{field}' must be a dict or JSON string, got {type(field_values)}")
        
        logger.debug(f"Field '{field}' is a dict with keys: {list(field_values.keys())}")
    
        if "properties" not in field_values:
            properties[field] = parse_field_without_nested_fields(field_values, language)
        elif field_values.get("type") == "object":
            properties[field] = parse_field_with_nested_fields(field_values, language)
        else:
            field_type = (
                field_values.get("type") if isinstance(field_values, dict) else type(field_values).__name__
            )
            logger.error(
                f"Failed to parse field '{field}' with type '{field_type}'. Field values: {field_values}"
            )
            raise SchemaProcessingError(
                f"Failed to parse field '{field}' with type '{field_type}'. Field values: {field_values}"
            )
        # Add all fields to required - OpenAI structured output requires all properties to be in required array
        required_fields.append(field)
        logger.debug(f"Successfully processed field '{field}'")
    
    structured_output["schema"]["properties"] = properties
    structured_output["schema"]["required"] = required_fields
    
    # Validate the final schema for OpenAI structured output compatibility
    # This performs JSON Schema validation and field-level validation
    # Raises OaiSchemaValidationError if validation errors are found
    try: 
        validate_openai_schema(structured_output["schema"])
    except OaiSchemaValidationError as e:
        logger.error(f"Failed to convert schema to OpenAI structured output schema: {e}")
        raise SchemaProcessingError(f"Failed to convert schema to OpenAI structured output schema: {e}") from e
    
    return structured_output


def prepare_schema_from_db(schema: dict[str, Any], language: str = "pl", strict: bool = True) -> dict[str, Any]:
    """
    Prepare a schema from database format for use with InformationExtractor.
    
    This function validates the schema and converts it to OpenAI structured output format,
    handling both already-converted schemas and schemas that need conversion.
    
    TODO: Once schema validation is enforced at creation time, this function should
          only validate (not convert) schemas, or be simplified to just return the schema.
          
    Migration strategy:
    - Enforce validate_openai_schema() when schemas are created/updated via API
    - Migrate all existing database schemas to OpenAI format
    - Remove conversion fallback logic (convert_schema_to_oai_structured_output call)
    - Keep only validation check or simplify to direct schema usage
    
    Args:
        schema: Schema dict from Supabase with 'name', 'description', 'text' fields
        language: Language code ("pl" or "en") for localized instructions (default: "pl")
        strict: Whether to use strict mode for OpenAI structured output (default: True)
        
    Returns:
        Prepared schema in OpenAI structured output format, ready for use with InformationExtractor
        
    Raises:
        SchemaProcessingError: If schema validation or conversion fails
        OaiSchemaValidationError: If the schema is not compatible with OpenAI structured output
        
    Example:
        >>> schema = {"name": "my_schema", "description": "...", "text": {...}}
        >>> prepared = prepare_schema_from_db(schema, language="pl")
        >>> extractor = InformationExtractor(model=llm, prompt_name="prompt", schema=prepared)
    """
    logger.info(f"Preparing schema from database format")
    
    try:
        # First, try to validate as-is (in case it's already in OpenAI format)
        validate_openai_schema(schema)
        logger.info("Schema is already in valid OpenAI format, using as-is")
        return schema
    except OaiSchemaValidationError as e:
        logger.info(f"Schema needs conversion to OpenAI format: {e}")
        # Convert schema using the conversion utility (DEPRECATED - schemas should be pre-validated)
        return convert_schema_to_oai_structured_output(schema, language=language, strict=strict)


