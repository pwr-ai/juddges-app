"""
Pydantic models for schema API requests and responses.
"""

import re
from typing import Any

from juddges_search.models import DocumentType
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_NAME_ALLOWED_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")

# System schemas that cannot be deleted (read-only)
SYSTEM_SCHEMAS = {"ipbox", "personal_rights", "swiss_franc_loans"}


# ============================================================================
# CRUD Models
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


# ============================================================================
# Generation Models
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


# ============================================================================
# Compilation Models
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


# ============================================================================
# Versioning Models
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
