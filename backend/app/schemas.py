"""
Unified Schemas API - RESTful resource-based endpoints for schema management.

This module provides:
1. CRUD operations for schemas (list, create, get, update, delete)
2. AI-powered schema generation via conversational agent
3. CRUD operations for extraction_schemas database table
"""

import asyncio
import json
import re
import shutil
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, Query, Request, status
from juddges_search.info_extraction.extractor import InformationExtractor
from juddges_search.info_extraction.oai_schema_validation import validate_openai_schema
from juddges_search.info_extraction.schema_utils import (
    SchemaProcessingError,
    prepare_schema_from_db,
)
from juddges_search.llms import get_default_llm
from juddges_search.models import DocumentType
from langgraph.types import Command
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, field_validator
from schema_generator_agent.agents.agent_state import AgentState
from schema_generator_agent.agents.schema_generator import (
    SchemaGenerator,
    load_prompts,
)
from supabase import Client
from werkzeug.utils import secure_filename

from app.core.supabase import supabase_client

router = APIRouter(prefix="/schemas", tags=["schemas"])

# Standard column sets to avoid SELECT * on tables with vector columns
EXTRACTION_SCHEMA_COLUMNS = (
    "id, name, text, type, category, description, user_id, is_public, "
    "version, status, created_at, updated_at"
)
SCHEMA_VERSION_COLUMNS = (
    "id, schema_id, version_number, schema_snapshot, field_snapshot, "
    "change_type, change_summary, changed_fields, diff_from_previous, user_id, created_at"
)

# Session storage for AI generation: session_id -> (agent, created_at)
_generation_sessions: dict[str, tuple[SchemaGenerator, datetime]] = {}
SCHEMA_NAME_ALLOWED_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


async def cleanup_expired_sessions():
    """Background task to clean up expired generation sessions."""
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        now = datetime.now(UTC)
        expired = [
            sid
            for sid, (_, created) in _generation_sessions.items()
            if now - created > timedelta(hours=1)
        ]
        for sid in expired:
            del _generation_sessions[sid]
            logger.info(f"Cleaned up expired generation session: {sid}")


# ============================================================================
# Supabase Operations for Schema Management
# ============================================================================


@router.get("/db")
async def list_schemas_from_db(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(100, ge=1, le=100, description="Number of schemas per page"),
) -> dict[str, Any]:
    """
    List all schemas from the Supabase extraction_schemas table with pagination.

    This endpoint queries the database for all schemas and returns their metadata with pagination.

    Returns:
        Dictionary with 'data' (list of schemas) and 'pagination' (metadata)

    Raises:
        HTTPException: If database query fails

    Example:
        ```
        GET /schemas/db?page=1&page_size=20
        ```
    """
    try:
        if not supabase_client:
            logger.error("Supabase client not initialized")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database service unavailable",
            )

        # Get total count
        count_response = (
            supabase_client.table("extraction_schemas")
            .select("id", count="exact")
            .execute()
        )
        total = count_response.count or 0

        # Calculate pagination
        offset = (page - 1) * page_size
        total_pages = (total + page_size - 1) // page_size if total > 0 else 1

        # Build query - get schemas ordered by creation date (newest first) with pagination
        response = (
            supabase_client.table("extraction_schemas")
            .select(EXTRACTION_SCHEMA_COLUMNS)
            .order("created_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )

        schemas = response.data if response.data else []
        logger.info(
            f"Listed {len(schemas)} schemas from database (page {page}, total: {total})"
        )

        return {
            "data": schemas,
            "pagination": {
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list schemas from database: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list schemas from database: {e!s}",
        )


def _fetch_schema_from_db(
    schema_id: str, client: Client | None = None
) -> dict[str, Any]:
    """Fetch schema from database by ID."""
    db_client = client or supabase_client

    if not db_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    response = (
        db_client.table("extraction_schemas")
        .select(EXTRACTION_SCHEMA_COLUMNS)
        .eq("id", schema_id)
        .execute()
    )

    if not response.data or len(response.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema with ID '{schema_id}' not found in database",
        )

    return response.data[0]


@router.get("/db/{schema_id}", response_model=dict[str, Any])
async def get_schema_from_db(schema_id: str) -> dict[str, Any]:
    """
    Get a specific schema from the Supabase extraction_schemas table by ID.

    This endpoint retrieves a schema from the database by its UUID.
    The schema definition is stored in the 'text' field as JSONB.

    Args:
        schema_id: UUID of the schema in the database

    Returns:
        Schema record with all fields including id, name, description, type,
        category, text (schema definition), dates, user_id, timestamps, etc.

    Raises:
        HTTPException: If schema not found or database query fails

    Example:
        ```
        GET /schemas/db/123e4567-e89b-12d3-a456-426614174000
        ```
    """
    try:
        schema = _fetch_schema_from_db(schema_id)
        logger.info(f"Retrieved schema from database: {schema_id}")
        return schema
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get schema {schema_id} from database: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve schema from database: {e!s}",
        )


@router.get(
    "/db/{schema_id}/converted",
    response_model=dict[str, Any],
    responses={
        404: {"description": "Schema not found in Supabase database."},
        500: {
            "description": "Schema conversion failed due to invalid stored schema or unexpected server error.",
            "content": {
                "application/json": {
                    "example": {
                        "detail": 'Schema conversion failed: Field \'title\' must be defined as a JSON object (e.g. {"type": "string", ...}).'
                    }
                }
            },
        },
    },
)
async def get_converted_schema_from_db(
    schema_id: str,
    strict: bool = Query(
        default=True, description="Use strict mode for schema conversion"
    ),
    language: str = Query(
        default="pl", description="Language for schema conversion (pl or en)"
    ),
) -> dict[str, Any]:
    """
    Get a schema from the database and return it converted using prepare_schema_from_db.

    This endpoint is for verification purposes to check how the schema is converted
    for use with InformationExtractor. It fetches the schema from the database
    and applies the same conversion that prepare_schema_from_db uses.

    Args:
        schema_id: UUID of the schema in the database
        strict: Whether to use strict mode for schema conversion (default: True)
        language: Language for schema conversion, either "pl" or "en" (default: "pl")

    Returns:
        Converted schema in OpenAI structured output format

    Raises:
        HTTPException: If schema not found, conversion fails, or database query fails

    Example:
        ```
        GET /schemas/db/123e4567-e89b-12d3-a456-426614174000/converted?strict=true&language=pl
        ```
    """
    try:
        # Fetch schema from database
        schema = _fetch_schema_from_db(schema_id)
        logger.info(f"Retrieved schema from database for conversion: {schema_id}")

        # Prepare schema using prepare_schema_from_db
        converted_schema = prepare_schema_from_db(
            schema, language=language, strict=strict
        )
        logger.info(f"Successfully converted schema {schema_id}")

        return converted_schema
    except HTTPException:
        raise
    except SchemaProcessingError as e:
        logger.error(f"Schema conversion failed for {schema_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Schema conversion failed: {e!s}",
        )
    except ValueError as e:
        logger.error(f"Schema conversion failed for {schema_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Schema conversion failed: {e!s}",
        )
    except Exception as e:
        logger.error(f"Failed to convert schema {schema_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to convert schema: {e!s}",
        )


# ============================================================================
# CRUD Operations for Schema Management (DEPRECATED)
# ============================================================================


@router.get("", response_model=list[str], deprecated=True)
async def list_schemas() -> list[str]:
    """
    List all available schemas from file system.

    .. deprecated:: Use GET /schemas/db instead to list schemas from Supabase database.

    Returns:
        List of schema IDs available in the system
    """
    try:
        schemas = InformationExtractor.list_schemas()
        logger.info(f"Listed {len(schemas)} schemas")
        return schemas
    except Exception as e:
        logger.error(f"Failed to list schemas: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list schemas: {e!s}",
        )


@router.get("/{schema_id}", response_model=dict[str, Any], deprecated=True)
async def get_schema(schema_id: str) -> dict[str, Any]:
    """
    Get a specific schema definition by ID from file system.

    .. deprecated:: Use GET /schemas/db/{schema_id} instead to get schema from Supabase database.

    Args:
        schema_id: Unique identifier of the schema

    Returns:
        Schema definition in JSON Schema format

    Raises:
        HTTPException: If schema not found or invalid
    """
    try:
        # Sanitize schema_id for security
        schema_id = secure_filename(schema_id)
        schema = InformationExtractor.get_schema(schema_id)
        logger.info(f"Retrieved schema: {schema_id}")
        return schema
    except ValueError as e:
        logger.warning(f"Schema not found: {schema_id} - {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema '{schema_id}' not found: {e!s}",
        )
    except Exception as e:
        logger.error(f"Failed to get schema {schema_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve schema: {e!s}",
        )


# ============================================================================
# CRUD Operations - POST, PUT, DELETE for Custom Schemas
# ============================================================================


class CreateSchemaRequest(BaseModel):
    """Request model for creating a new custom schema."""

    model_config = ConfigDict(protected_namespaces=())

    schema_id: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"^[a-zA-Z0-9_-]+$",
        description="Unique identifier for the schema (alphanumeric, underscore, hyphen only)",
    )
    description: str = Field(
        min_length=1,
        max_length=500,
        description="Brief description of the schema purpose",
    )
    schema_definition: dict[str, Any] = Field(
        description="Schema definition in YAML internal format or JSON Schema draft-07 format",
    )

    @field_validator("schema_definition")
    @classmethod
    def validate_schema_structure(cls, v: dict[str, Any]) -> dict[str, Any]:
        """
        Validate schema structure to prevent malformed or excessively complex schemas.

        Validates:
        - Maximum number of fields (100)
        - Maximum nesting depth (5 levels)
        - Field name format (alphanumeric + underscores)
        - No empty schema definitions

        Args:
            v: Schema dictionary to validate

        Returns:
            Validated schema dictionary

        Raises:
            ValueError: If schema fails validation checks
        """
        if not v:
            raise ValueError("Schema cannot be empty")

        # Count total fields and check naming
        def count_fields_and_validate(
            schema_dict: dict, current_depth: int = 0, path: str = "root"
        ) -> int:
            """Recursively count fields and validate structure."""
            if current_depth > 5:
                raise ValueError(
                    f"Schema nesting depth exceeds maximum of 5 levels at path: {path}. "
                    "Please simplify your schema structure."
                )

            field_count = 0
            for field_name, field_spec in schema_dict.items():
                # Validate field name format (alphanumeric + underscores)
                if not isinstance(field_name, str):
                    raise ValueError(
                        f"Field name must be a string at path: {path}.{field_name}"
                    )

                if not field_name.replace("_", "").replace("-", "").isalnum():
                    raise ValueError(
                        f"Invalid field name '{field_name}' at path: {path}. "
                        "Field names must contain only alphanumeric characters, underscores, or hyphens."
                    )

                field_count += 1

                # Check if field_spec is a dictionary (nested structure)
                if isinstance(field_spec, dict):
                    # Check for nested objects or arrays
                    field_type = field_spec.get("type", "")

                    if field_type == "object" and "properties" in field_spec:
                        # Recursively validate nested object
                        nested_count = count_fields_and_validate(
                            field_spec["properties"],
                            current_depth + 1,
                            f"{path}.{field_name}",
                        )
                        field_count += nested_count

                    elif field_type == "array" and "items" in field_spec:
                        # Check array items for nested structures
                        items = field_spec["items"]
                        if (
                            isinstance(items, dict)
                            and items.get("type") == "object"
                            and "properties" in items
                        ):
                            nested_count = count_fields_and_validate(
                                items["properties"],
                                current_depth + 1,
                                f"{path}.{field_name}[items]",
                            )
                            field_count += nested_count

            return field_count

        try:
            # Handle both internal format and JSON Schema format
            if "properties" in v:
                # JSON Schema format with properties
                total_fields = count_fields_and_validate(
                    v["properties"], 0, "schema.properties"
                )
            else:
                # Internal YAML format (flat structure)
                total_fields = count_fields_and_validate(v, 0, "schema")

            # Check maximum field count
            if total_fields > 100:
                raise ValueError(
                    f"Schema contains {total_fields} fields, which exceeds the maximum of 100 fields. "
                    "Please reduce the number of fields or split into multiple schemas."
                )

            logger.info(
                f"Schema validation passed: {total_fields} fields, valid structure"
            )
            return v

        except ValueError:
            # Re-raise validation errors
            raise
        except Exception as e:
            # Catch unexpected errors during validation
            logger.error(f"Unexpected error during schema validation: {e}")
            raise ValueError(
                f"Schema validation failed due to unexpected error: {e!s}. "
                "Please check your schema format."
            )


class UpdateSchemaRequest(BaseModel):
    """Request model for updating an existing schema."""

    model_config = ConfigDict(protected_namespaces=())

    description: str | None = Field(
        default=None,
        min_length=1,
        max_length=500,
        description="Updated description",
    )
    schema_definition: dict[str, Any] | None = Field(
        default=None,
        description="Updated schema definition",
    )

    @field_validator("schema_definition")
    @classmethod
    def validate_schema_structure(
        cls, v: dict[str, Any] | None
    ) -> dict[str, Any] | None:
        """
        Validate schema structure if provided (same validation as CreateSchemaRequest).

        Args:
            v: Schema dictionary to validate (optional)

        Returns:
            Validated schema dictionary or None

        Raises:
            ValueError: If schema fails validation checks
        """
        if v is None:
            return v

        # Reuse the same validation logic as CreateSchemaRequest
        return CreateSchemaRequest.validate_schema_structure(v)


class DeleteSchemaResponse(BaseModel):
    """Response model for schema deletion."""

    schema_id: str = Field(description="ID of the deleted schema")
    status: str = Field(description="Status: 'deleted' or 'archived'")
    message: str = Field(description="Informational message")


class SchemaMetadata(BaseModel):
    """Metadata stored alongside custom schemas."""

    schema_id: str
    description: str
    created_at: str
    updated_at: str | None = None
    created_by: str | None = None
    is_system: bool = False


# System schemas that cannot be deleted (read-only)
SYSTEM_SCHEMAS = {"ipbox", "personal_rights", "swiss_franc_loans"}


def _get_schema_directory() -> Path:
    """Get the schemas directory path."""
    # Use the SCHEMA_DIR from InformationExtractor (for deprecated file-based schemas)
    base_dir = Path(__file__).parent.parent
    schema_dir = base_dir / InformationExtractor.SCHEMA_DIR
    schema_dir.mkdir(parents=True, exist_ok=True)
    return schema_dir


def _get_archive_directory() -> Path:
    """Get or create the archive directory for deleted schemas."""
    archive_dir = _get_schema_directory() / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)
    return archive_dir


def _get_schema_metadata_path(schema_id: str) -> Path:
    """Get the path to the metadata JSON file for a schema."""
    return _get_schema_directory() / f"{schema_id}.meta.json"


def _save_schema_metadata(metadata: SchemaMetadata) -> None:
    """Save schema metadata to a JSON file."""
    meta_path = _get_schema_metadata_path(metadata.schema_id)
    with open(meta_path, "w") as f:
        json.dump(metadata.model_dump(), f, indent=2)
    logger.info(f"Saved metadata for schema: {metadata.schema_id}")


def _load_schema_metadata(schema_id: str) -> SchemaMetadata | None:
    """Load schema metadata from JSON file."""
    meta_path = _get_schema_metadata_path(schema_id)
    if not meta_path.exists():
        return None

    try:
        with open(meta_path) as f:
            data = json.load(f)
        return SchemaMetadata(**data)
    except Exception as e:
        logger.warning(f"Failed to load metadata for {schema_id}: {e}")
        return None


def _save_schema_to_file(schema_id: str, schema: dict[str, Any]) -> None:
    """Save schema to YAML file."""
    schema_path = _get_schema_directory() / f"{schema_id}.yaml"

    with open(schema_path, "w") as f:
        yaml.dump(
            schema, f, default_flow_style=False, sort_keys=False, allow_unicode=True
        )

    logger.info(f"Saved schema to file: {schema_path}")


def _create_backup(schema_id: str) -> None:
    """Create a timestamped backup of an existing schema."""
    schema_dir = _get_schema_directory()

    # Find the existing schema file
    existing_files = [
        f
        for f in schema_dir.iterdir()
        if f.stem == schema_id and f.suffix in InformationExtractor.SCHEMA_EXTENSIONS
    ]

    if existing_files:
        original_file = existing_files[0]
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        backup_path = (
            schema_dir / f"{schema_id}{original_file.suffix}.backup_{timestamp}"
        )

        shutil.copy2(original_file, backup_path)
        logger.info(f"Created backup: {backup_path}")


@router.post("", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_schema(params: CreateSchemaRequest) -> dict[str, Any]:
    """
    Create a new custom schema.

    This endpoint allows users to upload and save custom schemas for information extraction.
    Schemas are validated before being saved to ensure compatibility with OpenAI's structured output.

    Args:
        params: Schema creation parameters including schema_id, description, and schema definition

    Returns:
        Created schema with metadata

    Raises:
        HTTPException: If schema_id already exists, schema is invalid, or validation fails

    Example:
        ```
        POST /schemas
        {
            "schema_id": "my_custom_schema",
            "description": "Schema for extracting contract information",
            "schema_definition": {
                "contract_type": {
                    "type": "string",
                    "description": "Type of contract",
                    "required": true
                },
                "parties": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of contracting parties",
                    "required": true
                }
            }
        }
        ```
    """
    try:
        # Sanitize schema_id
        schema_id = secure_filename(params.schema_id)

        # Check if schema already exists
        try:
            existing_schema = InformationExtractor.get_schema(schema_id)
            if existing_schema:
                logger.warning(f"Schema already exists: {schema_id}")
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Schema '{schema_id}' already exists. Use PUT to update.",
                )
        except ValueError:
            # Schema doesn't exist, which is what we want
            pass

        # Validate schema structure using InformationExtractor validation
        try:
            validated_schema = InformationExtractor.prepare_oai_compatible_schema(
                params.schema_definition
            )
            logger.info(f"Schema validated successfully: {schema_id}")
        except ValueError as e:
            logger.error(f"Schema validation failed for {schema_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid schema structure: {e!s}",
            )

        # Save schema to YAML file (using internal format)
        _save_schema_to_file(schema_id, params.schema_definition)

        # Create and save metadata
        metadata = SchemaMetadata(
            schema_id=schema_id,
            description=params.description,
            created_at=datetime.now(UTC).isoformat(),
            is_system=False,
        )
        _save_schema_metadata(metadata)

        logger.info(f"Created custom schema: {schema_id}")

        return {
            "schema_id": schema_id,
            "description": params.description,
            "schema": validated_schema,
            "created_at": metadata.created_at,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create schema: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create schema: {e!s}",
        )


@router.put("/{schema_id}", response_model=dict[str, Any])
async def update_schema(schema_id: str, params: UpdateSchemaRequest) -> dict[str, Any]:
    """
    Update an existing schema.

    This endpoint allows users to update the description or schema definition of an existing custom schema.
    A backup of the original schema is created before any modifications.

    Args:
        schema_id: Unique identifier of the schema to update
        params: Update parameters (description and/or schema definition)

    Returns:
        Updated schema with metadata

    Raises:
        HTTPException: If schema not found, is a system schema, or validation fails

    Example:
        ```
        PUT /schemas/my_custom_schema
        {
            "description": "Updated description for contract extraction",
            "schema_definition": {
                "contract_type": {
                    "type": "string",
                    "description": "Type of contract (updated)",
                    "required": true
                }
            }
        }
        ```
    """
    try:
        # Sanitize schema_id
        schema_id = secure_filename(schema_id)

        # Check if schema is a system schema (read-only)
        if schema_id in SYSTEM_SCHEMAS:
            logger.warning(f"Attempted to update system schema: {schema_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot update system schema '{schema_id}'. System schemas are read-only.",
            )

        # Verify schema exists
        try:
            existing_schema = InformationExtractor.get_schema(schema_id)
        except ValueError as e:
            logger.warning(f"Schema not found for update: {schema_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Schema '{schema_id}' not found: {e!s}",
            )

        # Load existing metadata
        metadata = _load_schema_metadata(schema_id)
        if metadata is None:
            # Create metadata if it doesn't exist (for legacy schemas)
            metadata = SchemaMetadata(
                schema_id=schema_id,
                description="Legacy schema",
                created_at=datetime.now(UTC).isoformat(),
                is_system=False,
            )

        # Check if at least one field is provided
        if params.description is None and params.schema_definition is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one field (description or schema_definition) must be provided for update",
            )

        # Create backup before modification
        _create_backup(schema_id)

        # Update schema if provided
        if params.schema_definition is not None:
            try:
                validated_schema = InformationExtractor.prepare_oai_compatible_schema(
                    params.schema_definition
                )
                _save_schema_to_file(schema_id, params.schema_definition)
                logger.info(f"Updated schema definition for: {schema_id}")
            except ValueError as e:
                logger.error(f"Schema validation failed for {schema_id}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid schema structure: {e!s}",
                )
        else:
            # Re-validate existing schema for consistency
            validated_schema = existing_schema

        # Update description if provided
        if params.description is not None:
            metadata.description = params.description

        # Update metadata timestamp
        metadata.updated_at = datetime.now(UTC).isoformat()
        _save_schema_metadata(metadata)

        logger.info(f"Updated schema: {schema_id}")

        return {
            "schema_id": schema_id,
            "description": metadata.description,
            "schema": validated_schema,
            "updated_at": metadata.updated_at,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update schema {schema_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update schema: {e!s}",
        )


@router.delete("/{schema_id}", response_model=DeleteSchemaResponse)
async def delete_schema(schema_id: str, force: bool = False) -> DeleteSchemaResponse:
    """
    Delete a custom schema.

    This endpoint archives (soft delete) or permanently deletes a custom schema.
    System schemas cannot be deleted. By default, schemas are archived to the archive directory
    for potential recovery.

    Args:
        schema_id: Unique identifier of the schema to delete
        force: If True, permanently delete; if False (default), archive the schema

    Returns:
        Deletion status and message

    Raises:
        HTTPException: If schema not found or is a system schema

    Example:
        ```
        DELETE /schemas/my_custom_schema?force=false
        ```
    """
    try:
        # Sanitize schema_id
        schema_id = secure_filename(schema_id)

        # Check if schema is a system schema
        if schema_id in SYSTEM_SCHEMAS:
            logger.warning(f"Attempted to delete system schema: {schema_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete system schema '{schema_id}'. System schemas are read-only.",
            )

        # Verify schema exists
        schema_dir = _get_schema_directory()
        schema_files = [
            f
            for f in schema_dir.iterdir()
            if f.stem == schema_id
            and f.suffix in InformationExtractor.SCHEMA_EXTENSIONS
        ]

        if not schema_files:
            logger.warning(f"Schema not found for deletion: {schema_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Schema '{schema_id}' not found",
            )

        schema_file = schema_files[0]

        if force:
            # Permanent deletion
            schema_file.unlink()
            status_msg = "deleted"
            message = f"Schema '{schema_id}' has been permanently deleted"
            logger.warning(f"Permanently deleted schema: {schema_id}")
        else:
            # Archive (soft delete)
            archive_dir = _get_archive_directory()
            timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
            archive_path = (
                archive_dir / f"{schema_id}{schema_file.suffix}.archived_{timestamp}"
            )

            shutil.move(str(schema_file), str(archive_path))
            status_msg = "archived"
            message = f"Schema '{schema_id}' has been archived to: {archive_path.name}"
            logger.info(f"Archived schema: {schema_id} to {archive_path}")

        # Handle metadata file
        meta_path = _get_schema_metadata_path(schema_id)
        if meta_path.exists():
            if force:
                meta_path.unlink()
            else:
                # Archive metadata as well
                archive_meta_path = (
                    archive_dir / f"{schema_id}.meta.json.archived_{timestamp}"
                )
                shutil.move(str(meta_path), str(archive_meta_path))

        return DeleteSchemaResponse(
            schema_id=schema_id,
            status=status_msg,
            message=message,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete schema {schema_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete schema: {e!s}",
        )


# ============================================================================
# AI-Powered Schema Generation
# ============================================================================


class SchemaGenerationRequest(BaseModel):
    """Request to start a new AI-powered schema generation session."""

    model_config = ConfigDict(use_enum_values=True)

    prompt: str = Field(
        description="User prompt describing the schema requirements",
        min_length=1,
        max_length=10000,
    )
    current_schema: dict[str, Any] = Field(
        default_factory=dict,
        description="Initial schema to start with (optional)",
    )
    document_type: DocumentType = Field(
        description="Type of document the schema will be used for"
    )
    collection_id: str | None = Field(
        default=None,
        description="Associated collection ID (optional)",
    )


class SchemaGenerationResponse(BaseModel):
    """Response from schema generation session."""

    session_id: str = Field(description="Unique session identifier")
    status: str = Field(description="Current session status")
    current_schema: dict[str, Any] | None = Field(
        default=None,
        description="Current schema state",
    )
    messages: list[Any] = Field(
        default_factory=list,
        description="Conversation history",
    )
    problem_definition: str | None = Field(
        default=None,
        description="Extracted problem definition",
    )
    confidence_score: float | None = Field(
        default=None,
        description="Confidence score of the generated schema (0.0-1.0)",
    )
    session_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Session metadata (creation time, etc.)",
    )


class SchemaRefinementRequest(BaseModel):
    """Request to refine an existing schema generation session with user feedback."""

    user_feedback: str = Field(
        description="User feedback to refine the schema",
        min_length=1,
        max_length=10000,
    )


def get_or_create_generation_agent(
    session_id: str,
    document_type: DocumentType,
    request: Request,
) -> SchemaGenerator:
    """
    Get existing agent or create new one for the generation session.

    Args:
        session_id: Unique session identifier
        document_type: Type of document for schema generation
        request: FastAPI request object (for accessing app state)

    Returns:
        SchemaGenerator instance
    """
    if session_id in _generation_sessions:
        logger.info(f"Reusing existing generation agent for session: {session_id}")
        return _generation_sessions[session_id][0]

    logger.info(f"Creating new generation agent for session: {session_id}")
    llm = get_default_llm(use_mini_model=True)
    prompts = load_prompts(document_type=document_type)

    agent = SchemaGenerator(
        llm,
        document_type,
        prompts["problem_definer_helper_prompt"],
        prompts["problem_definer_prompt"],
        prompts["schema_generator_prompt"],
        prompts["schema_assessment_prompt"],
        prompts["schema_refiner_prompt"],
        prompts["query_generator_prompt"],
        prompts["schema_data_assessment_prompt"],
        prompts["schema_data_assessment_merger_prompt"],
        prompts["schema_data_refiner_prompt"],
        use_interrupt=True,
        graph_compilation_kwargs={"checkpointer": request.app.state.checkpointer},
    )

    _generation_sessions[session_id] = (agent, datetime.now(UTC))
    return agent


@router.post(
    "/generate",
    response_model=SchemaGenerationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_schema_generation(
    params: SchemaGenerationRequest,
    request: Request,
) -> dict[str, Any]:
    """
    Start a new AI-powered schema generation session.

    This endpoint initializes a conversational agent that helps users create
    schemas through an iterative refinement process.

    Args:
        params: Schema generation parameters including initial prompt
        request: FastAPI request object

    Returns:
        Initial session state with session_id for future refinements

    Example:
        ```
        POST /schemas/generate
        {
            "prompt": "Create a schema for extracting drug-related information from court judgments",
            "document_type": "judgment",
            "collection_id": "drug-cases-2024"
        }
        ```
    """
    try:
        session_id = str(uuid.uuid4())
        logger.info(f"Starting schema generation session: {session_id}")

        agent = get_or_create_generation_agent(
            session_id=session_id,
            document_type=DocumentType(params.document_type),
            request=request,
        )

        initial_state = AgentState(
            messages=[],
            user_input=params.prompt,
            problem_help=None,
            user_feedback=None,
            problem_definition=None,
            query=None,
            current_schema=params.current_schema,
            schema_history=[],
            refinement_rounds=0,
            assessment_result=None,
            merged_data_assessment=None,
            data_refinement_rounds=0,
            conversation_id=session_id,
            collection_id=params.collection_id,
            confidence_score=None,
            session_metadata={"created_at": datetime.now(UTC).isoformat()},
        )

        response = await agent.graph.ainvoke(
            input=initial_state,
            config={"configurable": {"thread_id": session_id}},
        )

        # Add session metadata to response
        response["session_id"] = session_id
        response["status"] = "active"

        logger.info(f"Schema generation session {session_id} initialized successfully")
        return response

    except Exception as e:
        logger.error(f"Failed to start schema generation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start schema generation: {e!s}",
        )


@router.post("/generate/{session_id}/refine", response_model=SchemaGenerationResponse)
async def refine_schema(
    session_id: str,
    params: SchemaRefinementRequest,
    request: Request,
) -> dict[str, Any]:
    """
    Refine an existing schema generation session with user feedback.

    This endpoint allows users to provide feedback and continue the iterative
    schema refinement process.

    Args:
        session_id: Unique session identifier from the initial generation
        params: Refinement parameters with user feedback
        request: FastAPI request object

    Returns:
        Updated session state with refined schema

    Raises:
        HTTPException: If session not found or invalid

    Example:
        ```
        POST /schemas/generate/{session_id}/refine
        {
            "user_feedback": "Add a field for drug quantity in grams"
        }
        ```
    """
    try:
        if session_id not in _generation_sessions:
            logger.warning(f"Generation session not found: {session_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Generation session '{session_id}' not found. Start a new session with POST /schemas/generate",
            )

        logger.info(f"Refining schema generation session: {session_id}")
        agent, _ = _generation_sessions[session_id]

        response = await agent.graph.ainvoke(
            Command(resume=params.user_feedback),
            config={"configurable": {"thread_id": session_id}},
        )

        # Update confidence score from assessment if available
        if response.get("merged_data_assessment"):
            response["confidence_score"] = response["merged_data_assessment"].get(
                "confidence_score", 0.8
            )

        response["session_id"] = session_id
        response["status"] = "active"

        logger.info(f"Schema generation session {session_id} refined successfully")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to refine schema for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refine schema: {e!s}",
        )


@router.get("/generate/{session_id}", response_model=SchemaGenerationResponse)
async def get_generation_session(session_id: str) -> dict[str, Any]:
    """
    Get the current state of a schema generation session.

    Args:
        session_id: Unique session identifier

    Returns:
        Current session state including schema and conversation history

    Raises:
        HTTPException: If session not found
    """
    try:
        if session_id not in _generation_sessions:
            logger.warning(f"Generation session not found: {session_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Generation session '{session_id}' not found",
            )

        logger.info(f"Retrieving generation session: {session_id}")
        _agent, created_at = _generation_sessions[session_id]

        # Return basic session metadata
        # Note: Full state would require querying the agent's checkpoint
        return {
            "session_id": session_id,
            "status": "active",
            "session_metadata": {
                "created_at": created_at.isoformat(),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get generation session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve session: {e!s}",
        )


@router.delete("/generate/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_generation_session(session_id: str) -> None:
    """
    Cancel and delete a schema generation session.

    This cleans up resources associated with the session.

    Args:
        session_id: Unique session identifier

    Raises:
        HTTPException: If session not found
    """
    try:
        if session_id not in _generation_sessions:
            logger.warning(f"Generation session not found: {session_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Generation session '{session_id}' not found",
            )

        logger.info(f"Cancelling generation session: {session_id}")
        del _generation_sessions[session_id]
        logger.info(f"Generation session {session_id} cancelled successfully")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel generation session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel session: {e!s}",
        )


# ============================================================================
# Visual Schema Editor Endpoints - Field Validation and Compilation
# ============================================================================


class SchemaFieldBase(BaseModel):
    """Base model for schema field definitions."""

    model_config = ConfigDict(protected_namespaces=())

    field_name: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"^[a-zA-Z][a-zA-Z0-9_]*$",
        description="Field name (must start with letter, alphanumeric + underscore)",
    )
    field_type: str = Field(
        description="Field type: string, number, integer, boolean, array, object",
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
        description="Field description",
    )
    is_required: bool = Field(
        default=False,
        description="Whether field is required",
    )
    validation_rules: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional validation rules (pattern, min, max, enum, etc.)",
    )

    @field_validator("field_type")
    @classmethod
    def validate_field_type(cls, v: str) -> str:
        """Validate that field_type is one of the supported types."""
        valid_types = {"string", "number", "integer", "boolean", "array", "object"}
        if v not in valid_types:
            raise ValueError(
                f"Invalid field_type '{v}'. Must be one of: {', '.join(valid_types)}"
            )
        return v

    @field_validator("validation_rules")
    @classmethod
    def validate_validation_rules(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Validate that validation_rules contains only valid JSON Schema keywords."""
        # Valid JSON Schema validation keywords
        valid_keywords = {
            # String validation
            "minLength",
            "maxLength",
            "pattern",
            "format",
            # Number validation
            "minimum",
            "maximum",
            "exclusiveMinimum",
            "exclusiveMaximum",
            "multipleOf",
            # Array validation
            "minItems",
            "maxItems",
            "uniqueItems",
            "items",
            # Object validation
            "properties",
            "additionalProperties",
            "minProperties",
            "maxProperties",
            # Common validation
            "enum",
            "const",
            "default",
        }

        invalid_keys = set(v.keys()) - valid_keywords
        if invalid_keys:
            raise ValueError(
                f"Invalid validation rule keywords: {', '.join(invalid_keys)}. "
                f"Valid keywords: {', '.join(sorted(valid_keywords))}"
            )

        return v


class SchemaFieldCreate(SchemaFieldBase):
    """Request model for creating a schema field."""

    parent_field_path: str | None = Field(
        default=None,
        description="Parent field path for nested fields (e.g., 'party' for 'party.name')",
    )
    position: int = Field(
        default=0,
        ge=0,
        description="Position/order of the field in the schema",
    )


class SchemaFieldUpdate(BaseModel):
    """Request model for updating a schema field."""

    model_config = ConfigDict(protected_namespaces=())

    field_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        pattern=r"^[a-zA-Z][a-zA-Z0-9_]*$",
        description="Updated field name",
    )
    field_type: str | None = Field(
        default=None,
        description="Updated field type",
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
        description="Updated field description",
    )
    is_required: bool | None = Field(
        default=None,
        description="Updated required status",
    )
    validation_rules: dict[str, Any] | None = Field(
        default=None,
        description="Updated validation rules",
    )
    position: int | None = Field(
        default=None,
        ge=0,
        description="Updated position",
    )

    @field_validator("field_type")
    @classmethod
    def validate_field_type(cls, v: str | None) -> str | None:
        """Validate field_type if provided."""
        if v is None:
            return v
        valid_types = {"string", "number", "integer", "boolean", "array", "object"}
        if v not in valid_types:
            raise ValueError(
                f"Invalid field_type '{v}'. Must be one of: {', '.join(valid_types)}"
            )
        return v


class SchemaCompileRequest(BaseModel):
    """Request model for compiling fields to JSON Schema."""

    model_config = ConfigDict(protected_namespaces=())

    fields: list[dict[str, Any]] = Field(
        description="List of schema fields to compile",
        min_length=1,
    )
    schema_title: str = Field(
        default="InformationExtraction",
        description="Title for the compiled schema",
    )
    schema_description: str = Field(
        default="Extracted information from the text",
        description="Description for the compiled schema",
    )

    @field_validator("fields")
    @classmethod
    def validate_fields_structure(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Validate that each field has required properties."""
        required_keys = {"field_name", "field_type"}
        for idx, field in enumerate(v):
            missing_keys = required_keys - set(field.keys())
            if missing_keys:
                raise ValueError(
                    f"Field at index {idx} missing required keys: {', '.join(missing_keys)}"
                )
        return v


class SchemaValidationResponse(BaseModel):
    """Response model for schema validation."""

    model_config = ConfigDict(protected_namespaces=())

    valid: bool = Field(description="Whether schema is valid")
    errors: list[str] = Field(
        default_factory=list,
        description="Validation error messages",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Validation warning messages",
    )
    compiled_schema: dict[str, Any] | None = Field(
        default=None,
        description="Compiled JSON Schema if validation succeeded",
    )
    field_count: int | None = Field(
        default=None,
        description="Total number of fields in the schema",
    )


# Helper functions for field-to-schema conversion


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


# ============================================================================
# Schema Version Management Endpoints
# ============================================================================


class SchemaVersionSummary(BaseModel):
    """Summary of a schema version for listing."""

    id: str
    version_number: int
    change_type: str
    change_summary: str | None
    changed_fields: list[str] | None
    user_id: str | None
    created_at: str


class SchemaVersionDetail(BaseModel):
    """Full details of a schema version."""

    id: str
    schema_id: str
    version_number: int
    schema_snapshot: dict[str, Any]
    field_snapshot: list[dict[str, Any]]
    change_type: str
    change_summary: str | None
    changed_fields: list[str] | None
    diff_from_previous: dict[str, Any] | None
    user_id: str | None
    created_at: str


class VersionComparisonResponse(BaseModel):
    """Response from comparing two schema versions."""

    schema_id: str
    version_a: int
    version_b: int
    added_fields: list[dict[str, Any]]
    removed_fields: list[dict[str, Any]]
    modified_fields: list[dict[str, Any]]


class RollbackRequest(BaseModel):
    """Request for rolling back to a schema version."""

    change_summary: str | None = Field(
        default=None, description="Optional note explaining why rolling back"
    )


class RollbackResponse(BaseModel):
    """Response from a version rollback."""

    schema_id: str
    previous_version: int
    new_version: int
    restored_from_version: int
    new_version_id: str
    change_summary: str


@router.get("/db/{schema_id}/versions")
async def list_schema_versions(
    schema_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    """
    List all versions for a schema with pagination.

    Returns version history with summary information, ordered by version number
    (newest first).

    Args:
        schema_id: UUID of the schema
        page: Page number (1-based)
        page_size: Items per page

    Returns:
        Dictionary with versions list and pagination info
    """
    if not supabase_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        # Get current version number from main schema
        schema_response = (
            supabase_client.table("extraction_schemas")
            .select("schema_version")
            .eq("id", schema_id)
            .single()
            .execute()
        )

        if not schema_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Schema '{schema_id}' not found",
            )

        current_version = schema_response.data.get("schema_version", 1)

        # Get total count
        count_response = (
            supabase_client.table("schema_versions")
            .select("id", count="exact")
            .eq("schema_id", schema_id)
            .execute()
        )

        total = count_response.count or 0

        # Get paginated versions
        offset = (page - 1) * page_size
        versions_response = (
            supabase_client.table("schema_versions")
            .select(
                "id, version_number, change_type, change_summary, changed_fields, user_id, created_at"
            )
            .eq("schema_id", schema_id)
            .order("version_number", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )

        versions = [
            SchemaVersionSummary(
                id=v["id"],
                version_number=v["version_number"],
                change_type=v["change_type"],
                change_summary=v.get("change_summary"),
                changed_fields=v.get("changed_fields"),
                user_id=v.get("user_id"),
                created_at=v["created_at"],
            ).model_dump()
            for v in (versions_response.data or [])
        ]

        return {
            "schema_id": schema_id,
            "current_version": current_version,
            "versions": versions,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list schema versions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list versions: {e!s}",
        )


@router.get("/db/{schema_id}/versions/{version_number}")
async def get_schema_version(
    schema_id: str,
    version_number: int,
) -> SchemaVersionDetail:
    """
    Get full details of a specific schema version.

    Args:
        schema_id: UUID of the schema
        version_number: The version number to retrieve

    Returns:
        Full version details including schema and field snapshots
    """
    if not supabase_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        response = (
            supabase_client.table("schema_versions")
            .select(SCHEMA_VERSION_COLUMNS)
            .eq("schema_id", schema_id)
            .eq("version_number", version_number)
            .single()
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Version {version_number} not found for schema '{schema_id}'",
            )

        v = response.data
        return SchemaVersionDetail(
            id=v["id"],
            schema_id=v["schema_id"],
            version_number=v["version_number"],
            schema_snapshot=v.get("schema_snapshot", {}),
            field_snapshot=v.get("field_snapshot", []),
            change_type=v["change_type"],
            change_summary=v.get("change_summary"),
            changed_fields=v.get("changed_fields"),
            diff_from_previous=v.get("diff_from_previous"),
            user_id=v.get("user_id"),
            created_at=v["created_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get schema version: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get version: {e!s}",
        )


@router.get("/db/{schema_id}/versions/compare")
async def compare_schema_versions(
    schema_id: str,
    version_a: int = Query(..., description="First version to compare"),
    version_b: int = Query(..., description="Second version to compare"),
) -> VersionComparisonResponse:
    """
    Compare two schema versions to see differences.

    Args:
        schema_id: UUID of the schema
        version_a: First version number
        version_b: Second version number

    Returns:
        Comparison showing added, removed, and modified fields
    """
    if not supabase_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        # Fetch both versions
        response_a = (
            supabase_client.table("schema_versions")
            .select("field_snapshot")
            .eq("schema_id", schema_id)
            .eq("version_number", version_a)
            .single()
            .execute()
        )

        response_b = (
            supabase_client.table("schema_versions")
            .select("field_snapshot")
            .eq("schema_id", schema_id)
            .eq("version_number", version_b)
            .single()
            .execute()
        )

        if not response_a.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Version {version_a} not found",
            )

        if not response_b.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Version {version_b} not found",
            )

        fields_a = {
            f["field_path"]: f for f in (response_a.data.get("field_snapshot") or [])
        }
        fields_b = {
            f["field_path"]: f for f in (response_b.data.get("field_snapshot") or [])
        }

        paths_a = set(fields_a.keys())
        paths_b = set(fields_b.keys())

        # Calculate differences
        added_paths = paths_b - paths_a
        removed_paths = paths_a - paths_b
        common_paths = paths_a & paths_b

        added_fields = [fields_b[p] for p in added_paths]
        removed_fields = [fields_a[p] for p in removed_paths]

        # Find modified fields (same path, different content)
        modified_fields = []
        for path in common_paths:
            field_a = fields_a[path]
            field_b = fields_b[path]

            # Check for meaningful changes
            changes = []
            if field_a.get("field_type") != field_b.get("field_type"):
                changes.append(
                    {
                        "property": "field_type",
                        "old": field_a.get("field_type"),
                        "new": field_b.get("field_type"),
                    }
                )
            if field_a.get("description") != field_b.get("description"):
                changes.append(
                    {
                        "property": "description",
                        "old": field_a.get("description"),
                        "new": field_b.get("description"),
                    }
                )
            if field_a.get("is_required") != field_b.get("is_required"):
                changes.append(
                    {
                        "property": "is_required",
                        "old": field_a.get("is_required"),
                        "new": field_b.get("is_required"),
                    }
                )

            if changes:
                modified_fields.append(
                    {
                        "field_path": path,
                        "field_name": field_b.get("field_name"),
                        "changes": changes,
                    }
                )

        return VersionComparisonResponse(
            schema_id=schema_id,
            version_a=version_a,
            version_b=version_b,
            added_fields=added_fields,
            removed_fields=removed_fields,
            modified_fields=modified_fields,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to compare versions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compare versions: {e!s}",
        )


@router.post("/db/{schema_id}/versions/{version_number}/rollback")
async def rollback_schema_version(
    schema_id: str,
    version_number: int,
    request: RollbackRequest = None,
) -> RollbackResponse:
    """
    Rollback schema to a specific version.

    This creates a new version with the content from the specified version,
    maintaining the audit trail. The rollback is performed using a database
    function for atomicity.

    Args:
        schema_id: UUID of the schema
        version_number: The version number to rollback to
        request: Optional rollback request with change summary

    Returns:
        Rollback result with new version details
    """
    if not supabase_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        # Get current version before rollback
        schema_response = (
            supabase_client.table("extraction_schemas")
            .select("schema_version")
            .eq("id", schema_id)
            .single()
            .execute()
        )

        if not schema_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Schema '{schema_id}' not found",
            )

        previous_version = schema_response.data.get("schema_version", 1)

        # Call the database rollback function
        result = supabase_client.rpc(
            "rollback_to_version",
            {
                "p_schema_id": schema_id,
                "p_version_number": version_number,
            },
        ).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Rollback failed - no result returned",
            )

        new_version_id = result.data

        # Get the new version number
        new_schema = (
            supabase_client.table("extraction_schemas")
            .select("schema_version")
            .eq("id", schema_id)
            .single()
            .execute()
        )

        new_version = (
            new_schema.data.get("schema_version", previous_version + 1)
            if new_schema.data
            else previous_version + 1
        )

        change_summary = request.change_summary if request else None
        summary = change_summary or f"Rolled back to version {version_number}"

        logger.info(
            f"Schema {schema_id} rolled back from version {previous_version} "
            f"to version {version_number} (new version: {new_version})"
        )

        return RollbackResponse(
            schema_id=schema_id,
            previous_version=previous_version,
            new_version=new_version,
            restored_from_version=version_number,
            new_version_id=new_version_id,
            change_summary=summary,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to rollback schema version: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to rollback: {e!s}",
        )
