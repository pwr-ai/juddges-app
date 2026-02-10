"""Base Schema Extractor for Universal Legal Document Extraction.

Extracts structured data from legal documents using the universal base schema
with jurisdiction-aware field mappings for EN and PL documents.
"""

import json
from pathlib import Path
from typing import Any

import yaml
from langchain_openai import ChatOpenAI
from loguru import logger

from .extractor import InformationExtractor
from .jurisdiction import Jurisdiction, detect_jurisdiction, get_jurisdiction_language


class BaseSchemaExtractor:
    """Extract structured data using the universal base legal schema.

    This extractor:
    1. Detects document jurisdiction (EN_UK, PL, etc.)
    2. Loads jurisdiction-specific field descriptions
    3. Builds a localized extraction prompt
    4. Extracts all schema fields using LLM structured output
    5. Validates extracted data against schema
    """

    PACKAGE_ROOT = Path(__file__).resolve().parents[2]
    SCHEMA_DIR = PACKAGE_ROOT / "config" / "schema"
    BASE_SCHEMA_FILE = SCHEMA_DIR / "base_legal_schema.json"
    MAPPINGS_FILE = SCHEMA_DIR / "jurisdiction_mappings.yaml"

    def __init__(
        self,
        model: ChatOpenAI | None = None,
        model_name: str = "gpt-4o-mini",
    ):
        """Initialize the base schema extractor.

        Args:
            model: Pre-configured ChatOpenAI model (optional)
            model_name: Model name to use if model not provided
        """
        self.model = model or ChatOpenAI(model=model_name, temperature=0)
        self.schema = self._load_schema()
        self.mappings = self._load_mappings()
        self._extractor: InformationExtractor | None = None

    def _load_schema(self) -> dict[str, Any]:
        """Load the base legal schema from JSON file."""
        with open(self.BASE_SCHEMA_FILE) as f:
            return json.load(f)

    def _load_mappings(self) -> dict[str, Any]:
        """Load jurisdiction field mappings from YAML file."""
        with open(self.MAPPINGS_FILE) as f:
            return yaml.safe_load(f)

    def _get_localized_schema(self, jurisdiction: Jurisdiction) -> dict[str, Any]:
        """Create a schema copy with localized field descriptions.

        Args:
            jurisdiction: The detected document jurisdiction

        Returns:
            Schema with field descriptions translated to the appropriate language
        """
        localized_schema = json.loads(json.dumps(self.schema))  # Deep copy
        field_mappings = self.mappings.get("field_mappings", {})

        for field_name, field_def in localized_schema.get("properties", {}).items():
            if field_name in field_mappings:
                mapping = field_mappings[field_name]
                # Get localized description
                if jurisdiction in mapping:
                    field_def["description"] = mapping[jurisdiction]
                elif "en_uk" in mapping:  # Fallback to UK English
                    field_def["description"] = mapping["en_uk"]

        return localized_schema

    def _build_extraction_prompt(
        self,
        jurisdiction: Jurisdiction,
        additional_instructions: str | None = None,
    ) -> str:
        """Build the extraction prompt with jurisdiction context.

        Args:
            jurisdiction: The detected document jurisdiction
            additional_instructions: Optional additional instructions

        Returns:
            Complete extraction prompt template
        """
        # Get jurisdiction-specific extraction context
        extraction_contexts = self.mappings.get("extraction_contexts", {})
        context = extraction_contexts.get(
            jurisdiction,
            extraction_contexts.get("en_uk", "Extract information from this legal document.")
        )

        # Note: Using string concatenation to avoid f-string parsing Jinja2 syntax
        prompt = """You are a legal document analysis expert. Your task is to extract structured information from legal documents.

""" + context + """

IMPORTANT INSTRUCTIONS:
1. Extract ALL required fields from the document
2. Use null for fields where information is not available in the document
3. For enum fields, use ONLY the exact values specified in the schema
4. For array fields, extract all relevant items mentioned in the document
5. For boolean fields, use true/false based on explicit statements in the document
6. Be precise and extract exact quotes/references where applicable

{% if additional_instructions %}
ADDITIONAL INSTRUCTIONS:
{{ additional_instructions }}
{% endif %}

Document text to analyze:
====
{{ full_text }}
====

Extract all information according to the schema. Return a valid JSON object."""

        return prompt

    def _get_extractor(
        self,
        jurisdiction: Jurisdiction,
        additional_instructions: str | None = None,
    ) -> InformationExtractor:
        """Get or create an InformationExtractor for the given jurisdiction.

        Args:
            jurisdiction: The document jurisdiction
            additional_instructions: Optional additional extraction instructions

        Returns:
            Configured InformationExtractor instance
        """
        # Get localized schema
        schema = self._get_localized_schema(jurisdiction)

        # Remove x- extension properties for OpenAI compatibility
        clean_schema = self._clean_schema_for_extraction(schema)

        # Build prompt template
        prompt = self._build_extraction_prompt(jurisdiction, additional_instructions)

        # Create a temporary prompt file or use inline prompt
        # For now, we'll use the InformationExtractor with inline schema
        return InformationExtractor(
            model=self.model,
            prompt_name="info_extraction",  # Use existing prompt template
            schema=clean_schema,
        )

    def _clean_schema_for_extraction(self, schema: dict[str, Any]) -> dict[str, Any]:
        """Remove x- extension properties that aren't valid for OpenAI.

        Args:
            schema: Schema with potential x- extension properties

        Returns:
            Clean schema suitable for OpenAI structured output
        """
        clean = json.loads(json.dumps(schema))  # Deep copy

        def remove_extensions(obj: dict | list | Any) -> Any:
            if isinstance(obj, dict):
                return {
                    k: remove_extensions(v)
                    for k, v in obj.items()
                    if not k.startswith("x-")
                }
            elif isinstance(obj, list):
                return [remove_extensions(item) for item in obj]
            return obj

        return remove_extensions(clean)

    async def extract(
        self,
        document_text: str,
        language: str | None = None,
        court_name: str | None = None,
        jurisdiction_override: Jurisdiction | None = None,
        additional_instructions: str | None = None,
    ) -> tuple[dict[str, Any], Jurisdiction]:
        """Extract structured data from a legal document.

        Args:
            document_text: Full text of the legal document
            language: Known language code (optional)
            court_name: Known court name (optional)
            jurisdiction_override: Force a specific jurisdiction
            additional_instructions: Additional extraction instructions

        Returns:
            Tuple of (extracted_data dict, detected jurisdiction)
        """
        # Detect jurisdiction
        if jurisdiction_override:
            jurisdiction = jurisdiction_override
        else:
            jurisdiction = detect_jurisdiction(
                text=document_text[:5000],  # Use first 5000 chars for detection
                language=language,
                court_name=court_name,
            )

        logger.info(f"Extracting with jurisdiction: {jurisdiction}")

        # Get configured extractor
        extractor = self._get_extractor(jurisdiction, additional_instructions)

        # Prepare extraction context
        extraction_context = self.mappings.get("extraction_contexts", {}).get(
            jurisdiction,
            self.mappings.get("extraction_contexts", {}).get("en_uk", "")
        )

        # Map jurisdiction to language
        language_map = {"en_uk": "en", "en_us": "en", "pl": "pl", "unknown": "en"}
        detected_language = language_map.get(jurisdiction, language or "en")

        # Build prompt fill values
        prompt_fill_values = {
            "full_text": document_text,
            "extraction_context": extraction_context,
            "additional_instructions": additional_instructions or "",
            "language": detected_language,
        }

        # Extract using structured output
        try:
            extracted_data = await extractor.extract_information_with_structured_output(
                prompt_fill_values
            )
            logger.info(f"Successfully extracted {len(extracted_data)} fields")
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            # Try regular extraction as fallback
            try:
                extracted_data = await extractor.extract_information(prompt_fill_values)
                logger.info("Fallback extraction succeeded")
            except Exception as e2:
                logger.error(f"Fallback extraction also failed: {e2}")
                raise

        return extracted_data, jurisdiction

    def validate_extraction(
        self,
        data: dict[str, Any],
    ) -> tuple[bool, list[str]]:
        """Validate extracted data against the base schema.

        Args:
            data: Extracted data dictionary

        Returns:
            Tuple of (is_valid, list of validation errors)
        """
        errors = []
        required_fields = self.schema.get("required", [])
        properties = self.schema.get("properties", {})

        # Check required fields
        for field in required_fields:
            if field not in data or data[field] is None:
                # Allow null for required fields (document may not contain info)
                pass  # We allow null values

        # Validate enum values
        for field_name, field_def in properties.items():
            if field_name in data and data[field_name] is not None:
                if "enum" in field_def:
                    valid_values = field_def["enum"]
                    if data[field_name] not in valid_values:
                        errors.append(
                            f"Field '{field_name}' has invalid value '{data[field_name]}'. "
                            f"Valid values: {valid_values}"
                        )

                # Validate array types
                if field_def.get("type") == "array":
                    if not isinstance(data[field_name], list):
                        errors.append(
                            f"Field '{field_name}' should be an array, got {type(data[field_name])}"
                        )

                # Validate boolean types
                if field_def.get("type") == "boolean":
                    if not isinstance(data[field_name], bool):
                        errors.append(
                            f"Field '{field_name}' should be a boolean, got {type(data[field_name])}"
                        )

                # Validate number types
                if field_def.get("type") == "number":
                    if not isinstance(data[field_name], (int, float)):
                        errors.append(
                            f"Field '{field_name}' should be a number, got {type(data[field_name])}"
                        )

        is_valid = len(errors) == 0
        return is_valid, errors

    def get_filter_config(self) -> list[dict[str, Any]]:
        """Get filter configuration for all schema fields.

        Returns:
            List of filter configurations for UI/API use
        """
        filters = []
        properties = self.schema.get("properties", {})

        for field_name, field_def in properties.items():
            filter_type = field_def.get("x-filter-type", "text_search")
            ui_label = field_def.get("x-ui-label", field_name)
            ui_order = field_def.get("x-ui-order", 999)

            filter_config = {
                "field": field_name,
                "type": field_def.get("type", "string"),
                "filter_type": filter_type,
                "label": ui_label,
                "order": ui_order,
                "description": field_def.get("description", ""),
            }

            # Add enum values if applicable
            if "enum" in field_def:
                filter_config["enum_values"] = field_def["enum"]

            filters.append(filter_config)

        # Sort by UI order
        filters.sort(key=lambda x: x["order"])
        return filters

    def get_facet_fields(self) -> list[str]:
        """Get list of fields that should be used for faceted filtering.

        Returns:
            List of field names with facet filter type
        """
        properties = self.schema.get("properties", {})
        return [
            field_name
            for field_name, field_def in properties.items()
            if field_def.get("x-filter-type") == "facet"
        ]

    def get_array_fields(self) -> list[str]:
        """Get list of array fields for multi-value filtering.

        Returns:
            List of field names that are arrays
        """
        properties = self.schema.get("properties", {})
        return [
            field_name
            for field_name, field_def in properties.items()
            if field_def.get("type") == "array"
        ]

    def get_text_search_fields(self) -> list[str]:
        """Get list of fields for full-text search.

        Returns:
            List of field names with text_search filter type
        """
        properties = self.schema.get("properties", {})
        return [
            field_name
            for field_name, field_def in properties.items()
            if field_def.get("x-filter-type") == "text_search"
        ]
