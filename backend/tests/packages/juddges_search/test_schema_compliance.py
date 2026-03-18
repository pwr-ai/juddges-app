from typing import Any

import pytest
from juddges_search.info_extraction.extractor import InformationExtractor

schema_ids = [
    schema_id
    for schema_id in InformationExtractor.list_schemas()
    if schema_id != "jurisdiction_mappings"
]
# schema_ids = ["ipbox_v2_with_examples"]

OBLIGATORY_KEYS = ["type", "description"]

# Based on https://ai.google.dev/api/generate-content#generationconfig
GOOGLE_ALLOWED_KEYS = [
    "$schema",
    "$id",
    "$defs",
    "$ref",
    "$anchor",
    "type",
    "format",
    "title",
    "description",
    "enum",
    "items",
    "prefixItems",
    "minItems",
    "maxItems",
    "minimum",
    "maximum",
    "uniqueItems",
    "anyOf",
    "oneOf",
    "properties",
    "additionalProperties",
    "required",
]


@pytest.mark.parametrize("schema_name", schema_ids)
def test_schema_loads(schema_name: str) -> None:
    schema = InformationExtractor.get_schema(schema_name)
    assert schema is not None


@pytest.mark.parametrize("schema_name", schema_ids)
def test_schema_has_not_properties_with_reserved_names(schema_name: str) -> None:
    schema = InformationExtractor.get_schema(schema_name)
    _validate_schema(
        schema=schema,
        allowed_keys=GOOGLE_ALLOWED_KEYS,
        obligatory_keys=OBLIGATORY_KEYS,
    )


def _validate_schema(
    schema: dict[str, Any],
    allowed_keys: list[str],
    obligatory_keys: list[str],
    parents: list[str] | None = None,
    treat_as_fields_list: bool = False,
) -> None:
    parents = parents or []

    if treat_as_fields_list:
        for key in schema:
            if key in allowed_keys:
                pytest.fail(
                    f"Key {'->'.join([*parents, key])} is reserved as special for JSON Schema"
                )
            _validate_schema(
                schema=schema[key],
                allowed_keys=allowed_keys,
                obligatory_keys=obligatory_keys,
                parents=[*parents, key],
                treat_as_fields_list=False,
            )
    else:
        for key in obligatory_keys:
            if key not in schema:
                pytest.fail(
                    f"Key {'->'.join(parents)} does not have obligatory '{key}' field"
                )

        for key in schema:
            if key.startswith("x-"):
                continue
            if key not in allowed_keys:
                pytest.fail(
                    f"Key {'->'.join([*parents, key])} is not allowed to be used in schema"
                )

    if "properties" in schema:
        required_fields = set(schema.get("required", []))
        property_fields = set(schema["properties"].keys())
        assert required_fields <= property_fields

        _validate_schema(
            schema=schema["properties"],
            allowed_keys=allowed_keys,
            obligatory_keys=obligatory_keys,
            parents=[*parents, key],
            treat_as_fields_list=True,
        )
