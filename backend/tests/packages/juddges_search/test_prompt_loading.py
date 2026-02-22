import pytest
from juddges_search.info_extraction.extractor import InformationExtractor


@pytest.mark.parametrize("prompt_name", InformationExtractor.list_prompts())
def test_prompt_loading(prompt_name: str) -> None:
    prompt = InformationExtractor.get_prompt_template(prompt_name)
    assert prompt is not None


@pytest.mark.parametrize("schema_name", InformationExtractor.list_schemas())
def test_schema_loading(schema_name: str) -> None:
    schema = InformationExtractor.get_schema(schema_name)
    assert schema is not None


@pytest.mark.parametrize(
    "extraction_context_name",
    InformationExtractor.list_extraction_contexts(),
)
def test_extraction_context_loading(extraction_context_name: str) -> None:
    extraction_context = InformationExtractor.get_extraction_context(
        extraction_context_name
    )
    assert extraction_context is not None
