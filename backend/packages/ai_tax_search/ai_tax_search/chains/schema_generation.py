"""
Single-shot schema generation chain using LangChain LCEL.

Generates OpenAI-compatible JSON Schemas from natural language descriptions
using a single LLM call with structured output parsing.
"""

from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from loguru import logger

from ai_tax_search.chains.callbacks import callbacks, langfuse_handler
from ai_tax_search.info_extraction.oai_schema_validation import (
    OaiSchemaValidationError,
    validate_openai_schema,
)
from ai_tax_search.llms import get_default_llm

# Prompt template for single-shot schema generation
SCHEMA_GENERATION_PROMPT = """You are an expert JSON Schema generator for document information extraction.
Generate a valid JSON Schema based on the user's requirements.

## Schema Context
Schema Name: {{ schema_name }}
{% if schema_description %}
Description: {{ schema_description }}
{% endif %}

{% if extraction_instructions %}
## Extraction Instructions
{{ extraction_instructions }}
{% endif %}

## User's Request
{{ user_request }}

Note: If the user asks questions (ending with "?"), convert them to fields:
- Yes/no questions → boolean field (e.g., "Is there a penalty?" → has_penalty: boolean)
- "What type/kind of...?" → enum field with relevant options
- "What is the...?" → appropriate type (string, number, date)

{% if existing_fields %}
## EXISTING FIELDS (PRESERVE EXACTLY)
Include ALL existing fields unchanged. Only ADD new fields.

Existing fields:
{{ existing_fields }}
{% endif %}

## FIELD DESIGN PRIORITIES (CRITICAL FOR AGGREGATION)
Design fields based on USER'S REQUEST. Optimize for aggregation:

1. **PREFER BOOLEAN fields** for yes/no questions:
   - Example: "has_penalty" (boolean) - not "penalty_description" (string)

2. **PREFER ENUM fields** for categorical data:
   - Example: "status" with enum ["active", "inactive", "pending"]
   - Define 3-7 specific enum values based on the domain

3. **Arrays of enums** for multi-select categories

4. **Use string/number ONLY when necessary**:
   - Identifiers (case_number, document_id)
   - Dates (ruling_date with format: "date")
   - Amounts (tax_amount as number)
   - Truly free-form content (summary, description)

## Technical Requirements
- Root type: "object"
- All properties in "required" array (OpenAI requirement)
- "additionalProperties": false (OpenAI requirement)
- Arrays must define "items" with type schema
- Use snake_case for field names
{% if existing_fields %}
- Mark NEW fields with: "x-ai-generated": true
{% endif %}

## OUTPUT FORMAT
Return ONLY raw JSON. No markdown, no code blocks, no explanation.
Generate fields SPECIFIC to the user's request - do NOT copy examples.

Structure:
{"type": "object", "properties": {<your_fields>}, "required": [<all_field_names>], "additionalProperties": false}

Field format examples (DO NOT copy these - create fields for user's request):
- Boolean: {"type": "boolean", "description": "..."{% if existing_fields %}, "x-ai-generated": true{% endif %}}
- Enum: {"type": "string", "enum": ["opt1", "opt2"], "description": "..."{% if existing_fields %}, "x-ai-generated": true{% endif %}}
- String: {"type": "string", "description": "..."{% if existing_fields %}, "x-ai-generated": true{% endif %}}
- Number: {"type": "number", "description": "..."{% if existing_fields %}, "x-ai-generated": true{% endif %}}
- Array: {"type": "array", "items": {"type": "string"}, "description": "..."{% if existing_fields %}, "x-ai-generated": true{% endif %}}"""

# Create prompt template with jinja2 format
schema_generation_prompt = ChatPromptTemplate.from_template(
    SCHEMA_GENERATION_PROMPT,
    template_format="jinja2",
)

# Get default LLM (uses GPT-4o by default)
model = get_default_llm(use_mini_model=False)


def strip_markdown_json(text: str) -> str:
    """
    Strip markdown code blocks from LLM output to get raw JSON.

    Handles cases where LLM wraps JSON in ```json ... ``` blocks.
    """
    import re

    text = text.strip()

    # Remove ```json ... ``` or ``` ... ``` blocks
    pattern = r'^```(?:json)?\s*\n?(.*?)\n?```$'
    match = re.match(pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        text = match.group(1).strip()

    # Also handle case where there's text before/after the JSON
    # Try to extract just the JSON object
    if not text.startswith('{'):
        # Find the first { and last }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            text = text[start:end + 1]

    return text


def validate_and_fix_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """
    Validate and auto-fix common schema issues.

    Args:
        schema: Raw schema from LLM output

    Returns:
        Validated/fixed schema

    Raises:
        ValueError: If schema cannot be fixed
    """
    # Ensure required structure
    if not isinstance(schema, dict):
        raise ValueError("Schema must be a dictionary")

    # Set required top-level fields
    schema.setdefault("type", "object")
    schema.setdefault("additionalProperties", False)

    # Ensure properties exists
    if "properties" not in schema:
        raise ValueError("Schema must have 'properties' field")

    properties = schema["properties"]
    if not isinstance(properties, dict) or not properties:
        raise ValueError("Schema must have at least one property defined")

    # Auto-generate required array from all properties (OpenAI requirement)
    schema["required"] = list(properties.keys())

    # Validate using OpenAI schema validator
    try:
        validate_openai_schema(schema, raise_on_error=True)
    except OaiSchemaValidationError as e:
        raise ValueError(f"Schema validation failed: {e}")

    return schema


def format_existing_fields(fields: list[dict[str, Any]] | None) -> str:
    """Format existing fields for inclusion in the prompt."""
    if not fields:
        return ""

    lines = []
    for field in fields:
        field_name = field.get("field_name", field.get("name", "unknown"))
        field_type = field.get("field_type", field.get("type", "string"))
        description = field.get("description", "")
        is_required = field.get("is_required", True)
        required_str = "required" if is_required else "optional"
        lines.append(f"- {field_name} ({field_type}, {required_str}): {description}")

    return "\n".join(lines)


def get_existing_field_names(fields: list[dict[str, Any]] | None) -> set[str]:
    """Extract set of existing field names for comparison."""
    if not fields:
        return set()

    names = set()
    for field in fields:
        name = field.get("field_name", field.get("name"))
        if name:
            names.add(name)
    return names


def merge_and_mark_new_fields(
    generated_schema: dict[str, Any],
    existing_fields: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """
    Merge generated schema with existing fields, marking new ones.

    This ensures:
    1. All existing fields are preserved exactly
    2. New fields are marked with x-ai-generated: true
    3. Duplicates are handled (existing fields take precedence)

    Args:
        generated_schema: Schema output from LLM
        existing_fields: List of existing field definitions

    Returns:
        Merged schema with proper markers
    """
    if not existing_fields:
        # No existing fields - mark all as AI-generated
        properties = generated_schema.get("properties", {})
        for field_name, field_def in properties.items():
            if isinstance(field_def, dict):
                field_def["x-ai-generated"] = True
        return generated_schema

    existing_names = get_existing_field_names(existing_fields)
    properties = generated_schema.get("properties", {})

    # Build existing fields as JSON Schema properties for merging
    existing_props = {}
    for field in existing_fields:
        field_name = field.get("field_name", field.get("name"))
        if not field_name:
            continue

        field_type = field.get("field_type", field.get("type", "string"))
        description = field.get("description", "")

        prop = {"type": field_type}
        if description:
            prop["description"] = description

        # Copy any validation rules
        for key in ["enum", "format", "pattern", "minLength", "maxLength",
                    "minimum", "maximum", "minItems", "maxItems"]:
            if key in field:
                prop[key] = field[key]
            # Also check validation_rules nested object
            validation_rules = field.get("validation_rules", {})
            if isinstance(validation_rules, dict) and key in validation_rules:
                prop[key] = validation_rules[key]

        existing_props[field_name] = prop

    # Merge: existing fields take precedence, mark new fields
    merged_properties = {}

    # First, add all existing fields (preserving exact definitions)
    for field_name, field_def in existing_props.items():
        merged_properties[field_name] = field_def

    # Then, add new fields from generated schema (mark as AI-generated)
    for field_name, field_def in properties.items():
        if field_name not in existing_names:
            if isinstance(field_def, dict):
                field_def["x-ai-generated"] = True
            merged_properties[field_name] = field_def

    # Update schema with merged properties
    generated_schema["properties"] = merged_properties
    generated_schema["required"] = list(merged_properties.keys())

    return generated_schema


def prepare_input(inputs: dict[str, Any]) -> dict[str, Any]:
    """Prepare input variables for the prompt template."""
    return {
        "schema_name": inputs.get("schema_name", "InformationExtraction"),
        "schema_description": inputs.get("schema_description", ""),
        "user_request": inputs.get("user_request", ""),
        "existing_fields": format_existing_fields(inputs.get("existing_fields")),
        "extraction_instructions": inputs.get("extraction_instructions", ""),
    }


def build_full_prompt(inputs: dict[str, Any]) -> str:
    """Build the full prompt string for storage/auditability."""
    prepared = prepare_input(inputs)
    return schema_generation_prompt.format(**prepared)


def parse_llm_json_output(message) -> dict[str, Any]:
    """
    Parse LLM output to JSON, handling markdown wrapping.

    Args:
        message: LLM output (AIMessage or string)

    Returns:
        Parsed JSON as dict
    """
    import json

    # Extract text content from message
    if hasattr(message, 'content'):
        text = message.content
    else:
        text = str(message)

    # Strip any markdown formatting
    clean_text = strip_markdown_json(text)

    # Parse JSON
    try:
        return json.loads(clean_text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON from LLM output: {e}")
        logger.debug(f"Raw output: {text[:500]}...")
        raise ValueError(f"Invalid JSON in LLM response: {e}")


# Build the schema generation chain
schema_generation_chain = (
    RunnableLambda(prepare_input).with_config(run_name="prepare_schema_input")
    | schema_generation_prompt.with_config(run_name="schema_generation_prompt")
    | model.with_config(run_name="schema_generation_llm")
    | RunnableLambda(parse_llm_json_output).with_config(run_name="parse_json_output")
    | RunnableLambda(validate_and_fix_schema).with_config(run_name="schema_validator")
).with_config(run_name="schema_generation_chain", callbacks=callbacks)


async def generate_schema(
    user_request: str,
    schema_name: str = "InformationExtraction",
    schema_description: str | None = None,
    existing_fields: list[dict[str, Any]] | None = None,
    extraction_instructions: str | None = None,
) -> dict[str, Any]:
    """
    Generate a JSON Schema from a natural language description.

    Args:
        user_request: Natural language description of extraction needs
        schema_name: Name for the generated schema
        schema_description: Optional description for the schema
        existing_fields: Optional list of existing fields to preserve/extend
        extraction_instructions: Optional user-provided extraction context

    Returns:
        Dictionary containing:
            - schema: Generated OpenAI-compatible JSON Schema with x-ai-generated markers
            - generated_prompt: The full prompt sent to the LLM
            - new_fields: List of field names that were AI-generated
            - existing_field_count: Number of preserved existing fields
            - new_field_count: Number of newly generated fields

    Raises:
        ValueError: If generation or validation fails
    """
    inputs = {
        "user_request": user_request,
        "schema_name": schema_name,
        "schema_description": schema_description or "",
        "existing_fields": existing_fields,
        "extraction_instructions": extraction_instructions or "",
    }

    # Build the full prompt for storage
    generated_prompt = build_full_prompt(inputs)

    existing_names = get_existing_field_names(existing_fields)
    existing_count = len(existing_names)

    logger.info(
        f"Generating schema - name: {schema_name}, "
        f"request length: {len(user_request)}, "
        f"existing fields: {existing_count}, "
        f"instructions length: {len(extraction_instructions or '')}"
    )

    # Configure Langfuse metadata for this trace
    run_config: dict[str, Any] = {
        "run_name": f"schema_generation_{schema_name}",
        "callbacks": callbacks,
        "tags": ["schema-generation", "simple-chain"],
        "metadata": {
            "schema_name": schema_name,
            "existing_field_count": existing_count,
            "has_instructions": bool(extraction_instructions),
        },
    }

    # Add Langfuse-specific session info if handler is available
    if langfuse_handler:
        run_config["metadata"]["langfuse_session"] = f"schema_{schema_name}"
        logger.debug(f"Langfuse tracking enabled for schema generation: {schema_name}")

    # Generate schema using the chain
    raw_schema = await schema_generation_chain.ainvoke(inputs, config=run_config)

    # Merge with existing fields and mark new ones as AI-generated
    schema = merge_and_mark_new_fields(raw_schema, existing_fields)

    # Identify which fields are new (AI-generated)
    all_field_names = set(schema.get("properties", {}).keys())
    new_field_names = list(all_field_names - existing_names)

    logger.info(
        f"Schema generated successfully - "
        f"total: {len(all_field_names)} fields, "
        f"existing: {existing_count}, "
        f"new: {len(new_field_names)}"
    )

    return {
        "schema": schema,
        "generated_prompt": generated_prompt,
        "new_fields": new_field_names,
        "existing_field_count": existing_count,
        "new_field_count": len(new_field_names),
    }
