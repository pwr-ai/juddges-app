from juddges_search.info_extraction.base_schema_extractor import BaseSchemaExtractor
from juddges_search.info_extraction.extractor import InformationExtractor


def test_prepare_structured_output_schema_normalizes_title_characters():
    schema = {
        "title": "Polish Base Schema",
        "type": "object",
        "properties": {"field": {"type": "string"}},
        "required": ["field"],
    }

    normalized = InformationExtractor.prepare_structured_output_schema(schema)

    assert normalized["title"] == "Polish_Base_Schema"


def test_prepare_structured_output_schema_sets_default_safe_title_when_missing():
    schema = {
        "type": "object",
        "properties": {"field": {"type": "string"}},
        "required": ["field"],
    }

    normalized = InformationExtractor.prepare_structured_output_schema(schema)

    assert normalized["title"] == "information_extraction_schema"


def test_base_schema_cleaner_removes_unique_items_for_openai_compatibility():
    extractor = BaseSchemaExtractor()
    schema = {
        "type": "object",
        "properties": {
            "sentence_serve": {
                "type": "array",
                "uniqueItems": True,
                "items": {"type": "string"},
                "x-ui-label": "Sentence Serve",
            }
        },
        "required": ["sentence_serve"],
    }

    cleaned = extractor._clean_schema_for_extraction(schema)

    sentence_serve = cleaned["properties"]["sentence_serve"]
    assert "uniqueItems" not in sentence_serve
    assert "x-ui-label" not in sentence_serve
