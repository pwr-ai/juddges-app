import json
import warnings
from copy import deepcopy
from pathlib import Path
from typing import Any, Literal

import httpx
import jsonschema
import litellm
import yaml
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_openai import ChatOpenAI
from loguru import logger
from openai import RateLimitError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_random_exponential,
)
from tqdm import tqdm

from .oai_schema_validation import validate_openai_schema, OaiSchemaValidationError
from ai_tax_search.chains.callbacks import callbacks

T_language = Literal["pl", "en"]


class InformationExtractor:
    PACKAGE_ROOT = Path(__file__).resolve().parents[2]
    PROMPT_TEMPLATE_DIR = PACKAGE_ROOT / "config" / "prompts"
    SCHEMA_DIR = PACKAGE_ROOT / "config" / "schema"
    EXTRACTION_CONTEXT_DIR = PACKAGE_ROOT / "config" / "extraction_contexts"
    SCHEMA_EXTENSIONS: list[str] = [".yaml", ".yml", ".json"]
    SCHEMA_REQUIRED_FIELDS: list[str] = [
        "type",
        "description",
        "required",
    ]

    def __init__(
        self,
        model: ChatOpenAI,
        prompt_name: str,
        schema_name: str | None = None,
        schema: dict[str, Any] | None = None,
    ):
        self.model = model
        self.prompt_name = prompt_name
        self.schema_name = schema_name
        self.prompt = self.get_prompt_template(prompt_name)
        self.prompt_template = ChatPromptTemplate.from_template(
            self.prompt,
            template_format="jinja2",
        )

        if (schema_name is not None) and (schema is not None):
            raise ValueError("Either schema_name or schema must be provided (not both)")
        if schema_name is not None:
            self.schema = self.get_schema(schema_name)
        elif schema is not None:
            self.schema = schema
        else:
            raise ValueError("Either schema_name or schema must be provided")

    async def extract_information(
        self,
        prompt_fill_values: dict[str, Any],
    ) -> dict[str, Any]:
        """Extract information via the regular call to chat API."""
        chain = self.prompt_template | self.model | JsonOutputParser()
        return await chain.ainvoke(
            prompt_fill_values,
            config={"callbacks": callbacks, "run_name": "extraction_information"},
        )

    @retry(
        retry=retry_if_exception_type((RateLimitError, httpx.ConnectError, httpx.TimeoutException, ConnectionError)),
        stop=stop_after_attempt(5),
        wait=wait_random_exponential(multiplier=1, min=1, max=60),
    )
    async def extract_information_with_structured_output(
        self,
        prompt_fill_values: dict[str, Any],
    ) -> dict[str, Any]:
        """Extract information via the call to chat API with structured output."""
        if "schema" in prompt_fill_values:
            raise ValueError("Schema cannot be provided in prompt_fill_values, using structured output")
        prompt_fill_values["schema"] = None
        model = self.model.with_structured_output(
            self.schema,
            method="json_schema",
            strict=True,
        )
        chain = self.prompt_template | model
        return await chain.ainvoke(
            prompt_fill_values,
            config={"callbacks": callbacks, "run_name": "extraction_information_structured"},
        )

    def estimate_prompt_cost(self, prompts: list[str], verbose: bool = False) -> float:
        total_cost = sum(
            litellm.completion_cost(
                model=self.model.model_name,
                prompt=prompt,
            )
            for prompt in tqdm(prompts, desc="Estimating prefill cost", disable=not verbose)
        )
        return total_cost

    @classmethod
    def list_prompts(cls) -> list[str]:
        return [f.stem for f in cls.PROMPT_TEMPLATE_DIR.glob("*.jinja2")]

    @classmethod
    def get_prompt_template(cls, prompt_name: str) -> str:
        with (cls.PROMPT_TEMPLATE_DIR / f"{prompt_name}.jinja2").open("r") as f:
            return f.read()

    @classmethod
    def list_schemas(cls) -> list[str]:
        return [f.stem for f in cls.SCHEMA_DIR.iterdir() if f.suffix in cls.SCHEMA_EXTENSIONS]

    @classmethod
    def get_schema(cls, schema_name: str) -> dict[str, Any]:
        schema_files = [
            f for f in cls.SCHEMA_DIR.iterdir() if f.stem == schema_name and f.suffix in cls.SCHEMA_EXTENSIONS
        ]
        if len(schema_files) > 1:
            raise ValueError(f"Schema name {schema_name} found ambiguous")
        if len(schema_files) == 0:
            raise ValueError(f"Schema name {schema_name} not found")

        schema_file, *_ = schema_files
        if schema_file.suffix == ".yaml":
            with open(schema_file, "r") as f:
                schema = yaml.safe_load(f)
        elif schema_file.suffix == ".json":
            with open(schema_file, "r") as f:
                schema = json.load(f)
        else:
            raise ValueError(f"Schema file {schema_file} has unknown extension")

        return cls.prepare_oai_compatible_schema(schema)

    @classmethod
    def list_extraction_contexts(cls) -> list[str]:
        return [f.stem for f in cls.EXTRACTION_CONTEXT_DIR.iterdir() if f.suffix == ".yaml"]

    @classmethod
    def get_extraction_context(cls, extraction_context_name: str) -> dict[str, Any]:
        with (cls.EXTRACTION_CONTEXT_DIR / f"{extraction_context_name}.yaml").open("r") as f:
            extraction_context = yaml.safe_load(f)

        assert set(extraction_context.keys()) == {"language", "extraction_context", "additional_instructions"}

        return extraction_context
    
    @classmethod
    def get_additional_instructions(cls, language: str = "pl") -> str:
        """
        Load additional extraction instructions from YAML files.
        
        These are the default/generic extraction instructions that ship with the package.
        They provide base guidelines for data extraction that can be combined with
        user-specific instructions.
        
        Args:
            language: Language code ("pl" or "en"), defaults to "pl"
            
        Returns:
            Additional extraction instructions as string
            
        Raises:
            ValueError: If language is not supported
            FileNotFoundError: If instruction file doesn't exist
        """
        if language not in {"pl", "en"}:
            logger.warning(f"Unsupported language '{language}', falling back to 'pl'")
            language = "pl"
        
        instruction_file = cls.PROMPT_TEMPLATE_DIR / f"info_extraction_additional_instructions_{language}.yaml"
        
        if not instruction_file.exists():
            raise FileNotFoundError(
                f"Base instruction file not found: {instruction_file}. "
                f"Expected language: {language}"
            )
        
        with open(instruction_file, "r") as f:
            instructions_data = yaml.safe_load(f)
        
        if not isinstance(instructions_data, dict) or "content" not in instructions_data:
            raise ValueError(
                f"Invalid instruction file format: {instruction_file}. "
                f"Expected YAML with 'content' field."
            )
        
        return instructions_data["content"]

    @staticmethod
    def prepare_oai_compatible_schema(schema: dict[str, Any]) -> dict[str, Any]:
        """
        Matches the proper format of the schema and normalizes it to the OpenAI JSON Schema format.
        
        This method handles schemas loaded from YAML files (internal format) and converts them
        to OpenAI structured output format. The YAML internal format uses field-level 'required'
        flags which are converted to OpenAI's top-level 'required' array format.
        
        Note: This is currently the primary way to prepare YAML schemas for extraction.
        Future refactoring may move this logic to a standalone function in schema_utils.
        """
        match schema:
            case {
                "title": _,
                "description": _,
                "type": _,
                "required": _,
                "additionalProperties": _,
                "properties": _,
                **__,
            }:
                return schema
            case _:
                # Try to validate and convert internal format
                # This allows schemas from the database to be converted to OpenAI format
                try:
                    InformationExtractor.validate_yaml_schema(schema)
                    schema = deepcopy(schema)
                    required = []
                    for field_name, field_schema in schema.items():
                        if "required" in field_schema:
                            del field_schema["required"]
                        required.append(field_name)

                    return {
                        "$id": "information_extraction_schema",
                        "title": "InformationExtraction",
                        "type": "object",
                        "description": "Extracted information from the text",
                        "required": required,
                        "properties": schema,
                    }
                except (ValueError, KeyError) as e:
                    # If validation fails, try to convert schema by extracting 'required' flags
                    # This handles schemas from database that have 'required' at property level
                    try:
                        schema_copy = deepcopy(schema)
                        required = []
                        properties = {}

                        for field_name, field_schema in schema_copy.items():
                            if isinstance(field_schema, dict):
                                # Extract 'required' flag if present
                                if field_schema.get("required", False):
                                    required.append(field_name)
                                # Remove 'required' from property schema
                                field_schema_clean = {k: v for k, v in field_schema.items() if k != "required"}
                                properties[field_name] = field_schema_clean
                            else:
                                properties[field_name] = field_schema

                        return {
                            "$id": "information_extraction_schema",
                            "title": "InformationExtraction",
                            "type": "object",
                            "description": "Extracted information from the text",
                            "required": required,
                            "properties": properties,
                        }
                    except Exception:
                        # Last resort: pass schema as-is to LLM API
                        return schema

    @staticmethod
    def validate_yaml_schema(schema: dict[str, Any]) -> None:
        """
        TODO: Needs refactoring to support YAML schema validation with OpenAI compatibility.
        
        Validates the schema written in YAML internal format.
        
        This method needs to be refactored/extended to work with validate_openai_schema()
        from oai_schema_validation module. Currently validate_openai_schema() works with
        JSON schemas, but this method handles YAML-specific internal format that needs
        to be converted first.
        
        TODO: Extend oai_schema_validation to support YAML format schemas, or create
              a conversion layer that transforms YAML internal format to JSON format
              before validation.
        """
        warnings.warn(
            "validate_yaml_schema() needs refactoring. "
            "TODO: Extend validation to support YAML format with OpenAI compatibility checks.",
            PendingDeprecationWarning,
            stacklevel=2,
        )
        # NOTE: this validation is not sufficient as APIs may enforce constraints additional to JSONSchema
        # Test internal format of the schema
        for field_name, field_schema in schema.items():
            for required_field in InformationExtractor.SCHEMA_REQUIRED_FIELDS:
                if required_field not in field_schema:
                    raise ValueError(
                        f"Field {required_field} not found for key '{field_name}', and is necessary for all keys."
                    )
            if field_schema["type"] == "array":
                if "items" not in field_schema:
                    raise ValueError(f"Field '{field_name}' has array type but no items")
                if "type" not in field_schema["items"]:
                    raise ValueError(f"Field '{field_name}' has array type but no items type")

        # Test with JSON Schema validator
        try:
            jsonschema.Draft202012Validator.check_schema(schema)
        except jsonschema.exceptions.SchemaError as e:
            raise ValueError(f"Invalid schema: {e}") from e
