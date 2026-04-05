"""
CRUD operations for schema management: list, get, create, update, delete endpoints.
"""

import shutil
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from juddges_search.info_extraction.extractor import InformationExtractor
from juddges_search.info_extraction.schema_utils import (
    SchemaProcessingError,
    prepare_schema_from_db,
)
from loguru import logger
from supabase import Client, PostgrestAPIError, StorageException
from werkzeug.utils import secure_filename

from app.core.supabase import supabase_client

from .models import (
    SYSTEM_SCHEMAS,
    CreateSchemaRequest,
    DeleteSchemaResponse,
    SchemaMetadata,
    UpdateSchemaRequest,
)
from .storage import (
    _create_backup,
    _get_archive_directory,
    _get_schema_directory,
    _get_schema_metadata_path,
    _load_schema_metadata,
    _save_schema_metadata,
    _save_schema_to_file,
)

# Column projection for extraction_schemas - avoids pulling any large/unused fields.
_EXTRACTION_SCHEMA_COLS = (
    "id, name, description, type, category, text, dates, "
    "user_id, status, is_verified, created_at, updated_at"
)


def register_crud_routes(router: APIRouter) -> None:
    """Register all CRUD route handlers on the given router."""

    # ========================================================================
    # Supabase Operations for Schema Management
    # ========================================================================

    @router.get("/db")
    async def list_schemas_from_db(
        page: int = Query(1, ge=1, description="Page number (1-based)"),
        page_size: int = Query(
            100, ge=1, le=100, description="Number of schemas per page"
        ),
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
                .select(_EXTRACTION_SCHEMA_COLS)
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
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to list schemas from database: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list schemas from database: {e!s}",
            )

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
        except (PostgrestAPIError, StorageException) as e:
            logger.error(
                f"Failed to get schema {schema_id} from database: {e}", exc_info=True
            )
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
            # Broad catch: schema conversion may raise arbitrary errors from
            # underlying JSON/YAML parsing or pydantic schema processing.
            logger.error(f"Failed to convert schema {schema_id}: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to convert schema: {e!s}",
            )

    # ========================================================================
    # CRUD Operations for Schema Management (DEPRECATED)
    # ========================================================================

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
        except OSError as e:
            logger.error(f"Failed to list schemas: {e}", exc_info=True)
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
        except OSError as e:
            logger.error(f"Failed to get schema {schema_id}: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve schema: {e!s}",
            )

    # ========================================================================
    # CRUD Operations - POST, PUT, DELETE for Custom Schemas
    # ========================================================================

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
        except OSError as e:
            logger.error(f"Failed to create schema: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create schema: {e!s}",
            )

    @router.put("/{schema_id}", response_model=dict[str, Any])
    async def update_schema(
        schema_id: str, params: UpdateSchemaRequest
    ) -> dict[str, Any]:
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
                    validated_schema = (
                        InformationExtractor.prepare_oai_compatible_schema(
                            params.schema_definition
                        )
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
        except OSError as e:
            logger.error(f"Failed to update schema {schema_id}: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update schema: {e!s}",
            )

    @router.delete("/{schema_id}", response_model=DeleteSchemaResponse)
    async def delete_schema(
        schema_id: str, force: bool = False
    ) -> DeleteSchemaResponse:
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
                    archive_dir
                    / f"{schema_id}{schema_file.suffix}.archived_{timestamp}"
                )

                shutil.move(str(schema_file), str(archive_path))
                status_msg = "archived"
                message = (
                    f"Schema '{schema_id}' has been archived to: {archive_path.name}"
                )
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
        except OSError as e:
            logger.error(f"Failed to delete schema {schema_id}: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete schema: {e!s}",
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
        .select(_EXTRACTION_SCHEMA_COLS)
        .eq("id", schema_id)
        .execute()
    )

    if not response.data or len(response.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema with ID '{schema_id}' not found in database",
        )

    return response.data[0]
