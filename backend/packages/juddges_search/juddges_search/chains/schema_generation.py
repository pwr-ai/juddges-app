"""
Single-shot schema generation chain using LangChain LCEL.

Generates OpenAI-compatible JSON Schemas from natural language descriptions
using a single LLM call with structured output parsing.
"""

import copy
import json
import re
from functools import lru_cache
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from loguru import logger

from juddges_search.chains.callbacks import callbacks, langfuse_handler
from juddges_search.info_extraction.oai_schema_validation import (
    OaiSchemaValidationError,
    validate_openai_schema,
)
from juddges_search.llms import get_default_llm

# Generic metadata every judgment already carries (core + base layers, see
# docs/reference/JUDGMENT_FIELDS.md). Listed in the prompt so the model does not
# re-generate them unless the user asks.
BASE_METADATA_FIELDS = (
    "court name, court level, jurisdiction, case number, decision date, "
    "publication date, title, summary, judges, case type, decision type, "
    "overall outcome, keywords, legal topics, cited legislation"
)

# Prompt template for single-shot schema generation. Output is requested as a
# JSON object (the LLM runs in JSON mode, which requires the word JSON here);
# the x-ai-generated marker is set in code by merge_and_mark_new_fields.
SCHEMA_GENERATION_PROMPT = """You design JSON Schemas for extracting structured data from court judgments.
The judgments are Polish and English/UK court decisions used for legal case-law research.
An LLM extractor reads ONE judgment and fills every field of the schema; the filled
values are then aggregated, filtered and compared across thousands of judgments.
Respond with a single JSON object that is the JSON Schema (no other text).

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

If the user asks questions (ending with "?"), convert them to fields:
- Yes/no questions -> boolean field (e.g. "Is there a penalty?" -> penalty_imposed: boolean)
- "What type/kind of...?" -> enum field with relevant options
- "What is the...?" -> the most aggregatable type (enum, number, date); string only for names/identifiers

{% if existing_fields %}
## EXISTING FIELDS (PRESERVE EXACTLY)
The schema already contains these fields. Do NOT change, rename or repeat them; they are
kept as they are. Only ADD new fields. For every concept in the request, add several
complementary new fields (see decomposition below) and do not duplicate the meaning of
an existing field.

Existing fields:
{{ existing_fields }}
{% endif %}

## GOAL: MANY AGGREGATABLE FIELDS
Every field should be something that can be counted, grouped, filtered or compared across
judgments. Preferred types, in this order: boolean, enum, array of enums, number
(integer/number), date (string with format "date"). Avoid free-form text.

1. **Breadth.** A broad request must yield a rich schema: roughly 15-40 fields for a broad
   topic. When extending an existing schema, add several new fields (3-8) for each
   requested concept.
2. **Decompose instead of describing.** Never use one free-text field for a topic. Split the
   topic into several boolean / enum / number / date / array-of-enum fields that together
   cover it. Illustration only (do NOT copy it; build fields for THIS request):
   instead of `penalty_description: string` use `penalty_imposed: boolean`,
   `penalty_type: enum[...]`, `penalty_amount: number`, `penalty_suspended: boolean`,
   `penalty_duration_months: number`.
3. **Free text only for true names/identifiers** (e.g. a case reference, a party name) or when
   no sensible categorisation exists. Even then, add categorical companion fields next
   to it.
4. **Enums.** Use domain-specific values that fit Polish and UK case law (typical courts,
   procedures, remedies, outcomes, legal bases). 3-10 values, snake_case or short English
   labels. Include "other" when the list cannot be exhaustive and "not_stated" (or
   "unclear") whenever the judgment may not say. Use arrays of enums for multi-select
   categories (e.g. several grounds, several claim types).
5. **Numbers and dates.** Use "number" or "integer" for amounts, counts, durations (put the
   unit in the field name, e.g. `_pln`, `_months`) and string with "format": "date" for dates.
6. **Booleans only for questions the judgment nearly always answers.** When the information
   is often absent, use an enum with `yes` / `no` / `not_stated` instead of a boolean.
   For a number or date that may be absent, add a companion boolean such as
   `<field>_stated` so the value can be ignored when it is false.
7. Do not generate these generic metadata fields, every judgment already has them: {{ base_metadata_fields }}.
   Add them only if the user explicitly asks.

## Field descriptions
The `description` is the instruction for the extractor. State what to look for in the
judgment, which part of it, and what to return when the judgment does not say (e.g.
"Return not_stated if the judgment does not mention costs.", "false if not mentioned").
Descriptions must be specific, one or two sentences.

## Technical Requirements
- Root type: "object", with "properties", "required" and "additionalProperties": false
- All properties listed in "required" (OpenAI structured output requirement)
- "type" must be a single string (string, number, integer, boolean, array, object); never a list such as ["string", "null"]
- Arrays must define "items" with a type schema; arrays of enums use "items": {"type": "string", "enum": [...]}
- Enums are {"type": "string", "enum": [...]}
- Use snake_case English field names; enum values are short lowercase snake_case English labels
"""

# Create prompt template with jinja2 format
schema_generation_prompt = ChatPromptTemplate.from_template(
    SCHEMA_GENERATION_PROMPT,
    template_format="jinja2",
)


SCHEMA_MAX_COMPLETION_TOKENS = 16000


# Lazy-load LLM to avoid requiring API key at import time
def _get_model():
    """Default LLM in JSON mode.

    ``json_object`` (not strict ``json_schema``): the output is itself an arbitrary
    JSON Schema, which strict structured output cannot describe. ``bind`` leaves the
    shared cached client untouched. The completion budget is raised because 15-40
    fields with instruction-style descriptions (plus reasoning tokens) overrun the
    4000-token default.
    """
    llm = get_default_llm(use_mini_model=False, max_completion_tokens=SCHEMA_MAX_COMPLETION_TOKENS)
    return llm.bind(response_format={"type": "json_object"})


def strip_markdown_json(text: str) -> str:
    """
    Strip markdown code blocks from LLM output to get raw JSON.

    Handles cases where LLM wraps JSON in ```json ... ``` blocks.
    """
    text = text.strip()

    # Remove ```json ... ``` or ``` ... ``` blocks
    pattern = r"^```(?:json)?\s*\n?(.*?)\n?```$"
    match = re.match(pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        text = match.group(1).strip()

    # Also handle case where there's text before/after the JSON
    # Try to extract just the JSON object
    if not text.startswith("{"):
        # Find the first { and last }
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]

    return text


def _collapse_type_union(prop: Any) -> None:
    """In-place: ``"type": ["boolean", "null"]`` -> ``"type": "boolean"``."""
    if isinstance(prop, dict) and isinstance(prop.get("type"), list):
        non_null = [t for t in prop["type"] if t != "null"]
        prop["type"] = non_null[0] if non_null else "string"


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

    # Downstream consumers (validator, editor, aggregation) read "type" as a string;
    # collapse a nullable union such as ["string", "null"] to its non-null member.
    for prop in properties.values():
        _collapse_type_union(prop)
        if isinstance(prop, dict) and isinstance(prop.get("items"), dict):
            _collapse_type_union(prop["items"])

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
        details = ""
        enum_values = field.get("enum") or (field.get("validation_rules") or {}).get("enum")
        items = field.get("items")
        if enum_values:
            details += f" enum={list(enum_values)}"
        if isinstance(items, dict):
            details += f" items={items.get('type', 'string')}"
            if items.get("enum"):
                details += f" enum={list(items['enum'])}"
        lines.append(f"- {field_name} ({field_type}, {required_str}){details}: {description}")

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


_WRAPPER_KEYS = frozenset({"field_name", "name", "field_type", "is_required", "validation_rules"})
_VALIDATION_RULE_KEYS = (
    "enum",
    "format",
    "pattern",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
)


def _existing_field_to_property(field: dict[str, Any]) -> dict[str, Any]:
    """Turn an existing-field payload into a JSON Schema property, losslessly.

    The payload is the full property definition plus the legacy wrapper keys
    (``field_name``/``field_type``/``is_required``/``validation_rules``); the
    wrapper keys are dropped, everything else is copied as is.
    """
    prop = {k: copy.deepcopy(v) for k, v in field.items() if k not in _WRAPPER_KEYS}
    if "type" not in prop:
        prop["type"] = field.get("field_type", "string")
    if not prop.get("description"):
        prop.pop("description", None)

    validation_rules = field.get("validation_rules")
    if isinstance(validation_rules, dict):
        for key in _VALIDATION_RULE_KEYS:
            if key in validation_rules:
                prop[key] = validation_rules[key]
    return prop


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

    # Rebuild each existing field as a JSON Schema property, keeping its full
    # definition (enum, items, format, nested properties, ...).
    existing_props = {}
    for field in existing_fields:
        field_name = field.get("field_name", field.get("name"))
        if not field_name:
            continue
        existing_props[field_name] = _existing_field_to_property(field)

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
        "base_metadata_fields": BASE_METADATA_FIELDS,
    }


def build_full_prompt(inputs: dict[str, Any]) -> str:
    """Build the full prompt string for storage/auditability."""
    prepared = prepare_input(inputs)
    return schema_generation_prompt.format(**prepared)


def parse_llm_json_output(message) -> dict[str, Any]:
    """
    Parse the LLM output (JSON mode) into a dict.

    JSON mode returns a bare JSON object, so a plain ``json.loads`` is tried first;
    the markdown-stripping path stays as a defensive fallback (e.g. a proxy or model
    that ignores ``response_format``).
    """
    text = message.content if hasattr(message, "content") else str(message)
    if isinstance(text, list):  # content blocks
        text = "".join(block.get("text", "") if isinstance(block, dict) else str(block) for block in text)

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("LLM output is not bare JSON despite JSON mode; falling back to lenient parse")
        try:
            parsed = json.loads(strip_markdown_json(text))
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from LLM output: {e}")
            logger.debug(f"Raw output: {text[:500]}...")
            raise ValueError(f"Invalid JSON in LLM response: {e}")

    if not isinstance(parsed, dict):
        raise ValueError("Invalid JSON in LLM response: expected a JSON object")
    return parsed


@lru_cache(maxsize=1)
def _build_schema_generation_chain():
    """Build the schema generation chain once (lazy, memoised).

    The chain is pure — prompt template, a cached ChatOpenAI client, and
    stateless parsers — so it is safe to build a single instance and reuse it
    across requests instead of reconstructing (and re-resolving the LLM
    client) on every call.
    """
    return (
        RunnableLambda(prepare_input).with_config(run_name="prepare_schema_input")
        | schema_generation_prompt.with_config(run_name="schema_generation_prompt")
        | _get_model().with_config(run_name="schema_generation_llm")
        | RunnableLambda(parse_llm_json_output).with_config(run_name="parse_json_output")
        | RunnableLambda(validate_and_fix_schema).with_config(run_name="schema_validator")
    ).with_config(run_name="schema_generation_chain", callbacks=callbacks)


# Backward compatibility: Export chain builder as schema_generation_chain
# Code that imports this will get a callable that returns the chain
schema_generation_chain = _build_schema_generation_chain


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

    # Generate schema using the chain (build chain lazily to avoid requiring API key at import)
    chain = _build_schema_generation_chain()
    raw_schema = await chain.ainvoke(inputs, config=run_config)

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
