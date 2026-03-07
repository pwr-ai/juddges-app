"""Prompt/template management routes for extraction workflows."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Body, HTTPException, Path, Query
from juddges_search.info_extraction.extractor import InformationExtractor
from loguru import logger
from werkzeug.utils import secure_filename

from app.extraction_domain.shared import (
    PROMPTS_DIR,
    archive_prompt,
    create_backup,
    get_prompt_file_path,
    is_system_prompt,
    load_prompt_metadata,
    prompt_exists,
    save_prompt_metadata,
    validate_jinja2_template,
)
from app.models import (
    CreatePromptRequest,
    DeletePromptResponse,
    PromptMetadata,
    PromptResponse,
    UpdatePromptRequest,
)

router = APIRouter()


@router.get(
    "/prompts",
    response_model=list[str],
    summary="List available prompts",
    description="Get a list of all available extraction prompt IDs.",
)
async def list_prompts() -> list[str]:
    """List all available extraction prompt templates."""
    try:
        return InformationExtractor.list_prompts()
    except Exception as e:
        logger.error(f"Error listing prompts: {e!s}")
        raise HTTPException(status_code=500, detail=f"Error listing prompts: {e!s}")


@router.get(
    "/prompts/{prompt_id}",
    response_model=str,
    summary="Get prompt template",
    description="Retrieve a specific prompt template by its ID.",
)
async def get_prompt(prompt_id: str = Path(..., description="Prompt ID")) -> str:
    """Get a specific prompt template."""
    try:
        prompt_id = secure_filename(prompt_id)
        return InformationExtractor.get_prompt_template(prompt_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Prompt '{prompt_id}' not found")
    except Exception as e:
        logger.error(f"Error retrieving prompt {prompt_id}: {e!s}")
        raise HTTPException(status_code=500, detail=f"Error retrieving prompt: {e!s}")


@router.post(
    "/prompts",
    response_model=PromptResponse,
    status_code=201,
    summary="Create custom prompt",
    description="Create a new custom extraction prompt template with Jinja2 syntax.",
)
async def create_prompt(
    request: CreatePromptRequest = Body(...),
) -> PromptResponse:
    """
    Create a new custom prompt template.

    - Validates Jinja2 template syntax
    - Saves template file and metadata
    - Prevents duplicate prompt_id

    Raises:
        - 400: Invalid template syntax or duplicate prompt_id
        - 500: File I/O error
    """
    prompt_id = secure_filename(request.prompt_id)

    # Check if prompt already exists
    if prompt_exists(prompt_id):
        logger.warning(f"Attempted to create duplicate prompt: {prompt_id}")
        raise HTTPException(
            status_code=400, detail=f"Prompt '{prompt_id}' already exists"
        )

    # Validate Jinja2 template syntax
    try:
        validate_jinja2_template(request.template)
    except ValueError as e:
        logger.error(f"Invalid Jinja2 template for prompt {prompt_id}: {e!s}")
        raise HTTPException(status_code=400, detail=str(e))

    # Ensure prompts directory exists
    PROMPTS_DIR.mkdir(parents=True, exist_ok=True)

    # Save template file
    prompt_path = get_prompt_file_path(prompt_id)
    try:
        with open(prompt_path, "w") as f:
            f.write(request.template)
        logger.info(f"Created prompt template file: {prompt_path}")
    except Exception as e:
        logger.error(f"Error writing prompt file {prompt_id}: {e!s}")
        raise HTTPException(
            status_code=500, detail=f"Error saving prompt template: {e!s}"
        )

    # Create and save metadata
    created_at = datetime.now(UTC).isoformat()
    metadata = PromptMetadata(
        prompt_id=prompt_id,
        description=request.description,
        variables=request.variables,
        created_at=created_at,
        is_system=False,
    )

    try:
        save_prompt_metadata(metadata)
    except ValueError as e:
        # Cleanup: remove template file if metadata save fails
        prompt_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(e))

    logger.info(f"Successfully created prompt {prompt_id}")

    return PromptResponse(
        prompt_id=prompt_id,
        description=request.description,
        template=request.template,
        variables=request.variables,
        created_at=created_at,
        is_system=False,
    )


@router.put(
    "/prompts/{prompt_id}",
    response_model=PromptResponse,
    summary="Update prompt",
    description="Update an existing extraction prompt template.",
)
async def update_prompt(
    prompt_id: str = Path(..., description="Prompt ID to update"),
    request: UpdatePromptRequest = Body(...),
) -> PromptResponse:
    """
    Update an existing prompt template.

    - Verifies prompt exists
    - Validates new template if provided
    - Creates backup before updating
    - Updates only provided fields

    Raises:
        - 400: Invalid template syntax or system prompt modification
        - 404: Prompt not found
        - 500: File I/O error
    """
    prompt_id = secure_filename(prompt_id)

    # Check if prompt exists
    if not prompt_exists(prompt_id):
        logger.warning(f"Attempted to update non-existent prompt: {prompt_id}")
        raise HTTPException(status_code=404, detail=f"Prompt '{prompt_id}' not found")

    # Load existing metadata
    try:
        metadata = load_prompt_metadata(prompt_id)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Load existing template
    try:
        existing_template = InformationExtractor.get_prompt_template(prompt_id)
    except Exception as e:
        logger.error(f"Error loading existing template for {prompt_id}: {e!s}")
        raise HTTPException(
            status_code=500, detail=f"Error loading existing template: {e!s}"
        )

    # Validate new template if provided
    new_template = (
        request.template if request.template is not None else existing_template
    )
    if request.template is not None:
        try:
            validate_jinja2_template(request.template)
        except ValueError as e:
            logger.error(f"Invalid Jinja2 template for prompt {prompt_id}: {e!s}")
            raise HTTPException(status_code=400, detail=str(e))

    # Create backup before updating
    try:
        create_backup(prompt_id)
    except ValueError as e:
        logger.error(f"Error creating backup for prompt {prompt_id}: {e!s}")
        raise HTTPException(status_code=500, detail=f"Error creating backup: {e!s}")

    # Update template file if template changed
    if request.template is not None:
        prompt_path = get_prompt_file_path(prompt_id)
        try:
            with open(prompt_path, "w") as f:
                f.write(request.template)
            logger.info(f"Updated prompt template file: {prompt_path}")
        except Exception as e:
            logger.error(f"Error writing prompt file {prompt_id}: {e!s}")
            raise HTTPException(
                status_code=500, detail=f"Error saving prompt template: {e!s}"
            )

    # Update metadata
    updated_at = datetime.now(UTC).isoformat()
    if request.description is not None:
        metadata.description = request.description
    if request.variables is not None:
        metadata.variables = request.variables
    metadata.updated_at = updated_at

    try:
        save_prompt_metadata(metadata)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    logger.info(f"Successfully updated prompt {prompt_id}")

    return PromptResponse(
        prompt_id=prompt_id,
        description=metadata.description,
        template=new_template,
        variables=metadata.variables,
        created_at=metadata.created_at,
        updated_at=updated_at,
        is_system=metadata.is_system,
    )


@router.delete(
    "/prompts/{prompt_id}",
    response_model=DeletePromptResponse,
    summary="Delete prompt",
    description="Delete a custom extraction prompt template (archives instead of hard delete).",
)
async def delete_prompt(
    prompt_id: str = Path(..., description="Prompt ID to delete"),
    force: bool = Query(False, description="Force deletion even if prompt is in use"),
) -> DeletePromptResponse:
    """
    Delete a custom prompt template.

    - Verifies prompt exists
    - Prevents deletion of system prompts
    - Archives instead of hard delete (moves to archive directory)
    - Supports force parameter to bypass checks

    Raises:
        - 400: System prompt cannot be deleted
        - 404: Prompt not found
        - 500: File I/O error
    """
    prompt_id = secure_filename(prompt_id)

    # Check if prompt exists
    if not prompt_exists(prompt_id):
        logger.warning(f"Attempted to delete non-existent prompt: {prompt_id}")
        raise HTTPException(status_code=404, detail=f"Prompt '{prompt_id}' not found")

    # Prevent deletion of system prompts
    if is_system_prompt(prompt_id):
        logger.warning(f"Attempted to delete system prompt: {prompt_id}")
        raise HTTPException(
            status_code=400, detail=f"Cannot delete system prompt '{prompt_id}'"
        )

    # Archive the prompt (move to archive directory instead of deleting)
    try:
        archive_prompt(prompt_id)
        logger.info(f"Successfully archived prompt {prompt_id}")

        return DeletePromptResponse(
            prompt_id=prompt_id,
            status="archived",
            message=f"Prompt '{prompt_id}' has been archived successfully",
        )
    except ValueError as e:
        logger.error(f"Error archiving prompt {prompt_id}: {e!s}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== Schemas Management Endpoints =====
# DEPRECATED: These endpoints are maintained for backward compatibility.
# Use /schemas endpoints instead (see app/schemas.py)


@router.get(
    "/schemas",
    response_model=list[str],
    summary="List available schemas (DEPRECATED)",
    description="**DEPRECATED**: Use GET /schemas instead. This endpoint will be removed in a future version.",
    deprecated=True,
)
async def list_schemas() -> list[str]:
    """
    List all available extraction schemas.

    **DEPRECATED**: Use GET /schemas instead.
    """
    logger.warning(
        "DEPRECATED: GET /extractions/schemas is deprecated. Use GET /schemas instead. "
        "This endpoint will be removed in a future version."
    )
    try:
        return InformationExtractor.list_schemas()
    except Exception as e:
        logger.error(f"Error listing schemas: {e!s}")
        raise HTTPException(status_code=500, detail=f"Error listing schemas: {e!s}")
