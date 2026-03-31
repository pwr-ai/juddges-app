"""
Unified Schemas API - RESTful resource-based endpoints for schema management.

This package provides:
1. CRUD operations for schemas (list, create, get, update, delete)
2. AI-powered schema generation via conversational agent
3. CRUD operations for extraction_schemas database table
4. Schema compilation and validation
5. Schema version management
"""

from typing import Any

from fastapi import APIRouter, HTTPException, status
from juddges_search.info_extraction.oai_schema_validation import validate_openai_schema
from loguru import logger

from app.core.supabase import supabase_client

from .compilation import (
    compile_field_to_json_schema,
    compile_fields_to_json_schema,
    validate_schema_compatibility,
)
from .crud import _fetch_schema_from_db, register_crud_routes
from .generation import (
    _generation_sessions,
    cleanup_expired_sessions,
    register_generation_routes,
)
from .models import (
    SCHEMA_NAME_ALLOWED_PATTERN,
    SYSTEM_SCHEMAS,
    CreateSchemaRequest,
    DeleteSchemaResponse,
    SchemaCompileRequest,
    SchemaFieldBase,
    SchemaFieldCreate,
    SchemaFieldUpdate,
    SchemaMetadata,
    SchemaValidationResponse,
    UpdateSchemaRequest,
)
from .storage import (
    _get_schema_directory,
    _get_schema_metadata_path,
    _load_schema_metadata,
    _save_schema_metadata,
)
from .versioning import register_versioning_routes

router = APIRouter(prefix="/schemas", tags=["schemas"])

# Register routes from sub-modules
register_crud_routes(router)
register_generation_routes(router)
register_versioning_routes(router)


# ============================================================================
# Compilation endpoints (kept here since they bridge compilation + validation)
# ============================================================================


@router.get("/db/{schema_id}/validate-openai", response_model=dict[str, Any])
async def validate_openai_schema_endpoint(schema_id: str) -> dict[str, Any]:
    """
    TEMPORARY endpoint to validate a schema from the database using validate_openai_schema.

    This endpoint fetches a schema by ID from the database, converts it to OpenAI format,
    and validates it using validate_openai_schema with detailed error and warning information.

    Args:
        schema_id: UUID of the schema in the database

    Returns:
        Dictionary with validation result:
        - valid: bool indicating if schema is valid
        - message: str with validation result message
        - schema_id: str with the schema ID that was validated
        - errors: list[str] with detailed validation errors (if any)
        - warnings: list[str] with validation warnings (if any)

    Raises:
        HTTPException: If schema not found or conversion fails

    Example:
        ```
        GET /api/schemas/db/123e4567-e89b-12d3-a456-426614174000/validate-openai
        ```
    """
    try:
        schema = _fetch_schema_from_db(schema_id)
        logger.info(f"Retrieved schema from database for validation: {schema_id}")

        errors: list[str] = []
        name = schema.get("name")
        if isinstance(name, str) and not SCHEMA_NAME_ALLOWED_PATTERN.fullmatch(name):
            errors.append("Schema name may only contain letters, numbers, and spaces.")

        text_section = schema.get("text")
        if text_section is None:
            errors.append("Schema is missing 'text' field with property definitions.")
        elif not isinstance(text_section, dict):
            errors.append(f"'text' field must be a dict, got {type(text_section)}")
        else:
            for field_name, field_definition in text_section.items():
                if not isinstance(field_definition, dict):
                    errors.append(
                        f"Field '{field_name}' definition must be a dict, got {type(field_definition)}"
                    )
                    continue
                if not field_definition.get("required", False):
                    errors.append(
                        f"Field '{field_name}' must have 'required': true in DB schema definition."
                    )

        # Choose best candidate for validator (without converting)
        if isinstance(schema.get("schema"), dict):
            validator_input = schema["schema"]
            validator_source = "schema"
        elif isinstance(schema.get("properties"), dict):
            validator_input = schema
            validator_source = "root"
        elif isinstance(text_section, dict):
            validator_input = text_section
            validator_source = "text"
        else:
            validator_input = schema
            validator_source = "raw"

        validation_result = validate_openai_schema(
            validator_input,
            raise_on_error=False,
        )

        combined_errors = errors + validation_result["errors"]
        warnings = validation_result["warnings"]
        is_valid = len(combined_errors) == 0
        message = (
            "Schema is valid and compatible with OpenAI structured output"
            if is_valid
            else f"Schema validation failed with {len(combined_errors)} error(s)"
        )

        return {
            "valid": is_valid,
            "message": message,
            "schema_id": schema_id,
            "errors": combined_errors,
            "warnings": warnings,
            "validator_source": validator_source,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Unexpected error during schema validation for {schema_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate schema: {e!s}",
        )


@router.post("/compile", response_model=SchemaValidationResponse)
async def compile_schema_fields(params: SchemaCompileRequest) -> dict[str, Any]:
    """
    Compile visual editor fields to a complete JSON Schema.

    This endpoint converts the flat field representation used by the visual editor
    into a complete JSON Schema compatible with OpenAI's structured output format.
    The compilation process:
    1. Converts field definitions to JSON Schema properties
    2. Handles nested objects and arrays
    3. Applies validation rules
    4. Validates the resulting schema

    Args:
        params: Compilation request with field list and schema metadata

    Returns:
        Validation response with compiled schema

    Raises:
        HTTPException: If compilation fails or fields are invalid

    Example:
        ```
        POST /api/schemas/compile
        {
            "fields": [
                {
                    "field_name": "party_name",
                    "field_type": "string",
                    "description": "Name of the party",
                    "is_required": true,
                    "validation_rules": {"minLength": 1}
                },
                {
                    "field_name": "amount",
                    "field_type": "number",
                    "description": "Contract amount",
                    "is_required": false,
                    "validation_rules": {"minimum": 0}
                }
            ],
            "schema_title": "ContractExtraction",
            "schema_description": "Extract contract information"
        }
        ```
    """
    try:
        logger.info(
            f"Compiling {len(params.fields)} fields to JSON Schema - "
            f"title: {params.schema_title}"
        )

        # Compile fields to JSON Schema
        try:
            compiled_schema = compile_fields_to_json_schema(
                params.fields,
                params.schema_title,
                params.schema_description,
            )
            logger.info("Fields compiled successfully")
        except ValueError as e:
            logger.warning(f"Field compilation failed: {e}")
            return {
                "valid": False,
                "errors": [f"Compilation error: {e!s}"],
                "warnings": [],
                "compiled_schema": None,
                "field_count": len(params.fields),
            }

        # Validate the compiled schema
        is_valid, errors, warnings = validate_schema_compatibility(compiled_schema)

        # Count top-level fields
        field_count = len(compiled_schema.get("properties", {}))

        if is_valid:
            logger.info(
                f"Schema compilation and validation passed - "
                f"{field_count} top-level fields, {len(warnings)} warnings"
            )
        else:
            logger.warning(
                f"Compiled schema validation failed - "
                f"{len(errors)} errors, {len(warnings)} warnings"
            )

        return {
            "valid": is_valid,
            "errors": errors,
            "warnings": warnings,
            "compiled_schema": compiled_schema if is_valid else None,
            "field_count": field_count,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during schema compilation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compile schema: {e!s}",
        )


# Re-export everything that external code needs
__all__ = [
    "SCHEMA_NAME_ALLOWED_PATTERN",
    "SYSTEM_SCHEMAS",
    "CreateSchemaRequest",
    "DeleteSchemaResponse",
    "SchemaCompileRequest",
    "SchemaFieldBase",
    "SchemaFieldCreate",
    "SchemaFieldUpdate",
    "SchemaMetadata",
    "SchemaValidationResponse",
    "UpdateSchemaRequest",
    "_fetch_schema_from_db",
    "_generation_sessions",
    "_get_schema_directory",
    "_get_schema_metadata_path",
    "_load_schema_metadata",
    "_save_schema_metadata",
    "cleanup_expired_sessions",
    "compile_field_to_json_schema",
    "compile_fields_to_json_schema",
    "router",
    "validate_schema_compatibility",
]
