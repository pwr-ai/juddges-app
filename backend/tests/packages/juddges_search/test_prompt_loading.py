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


@pytest.mark.parametrize("language", ["pl", "en", "PL", None])
@pytest.mark.parametrize("prompt_name", InformationExtractor.list_prompts())
def test_prompt_renders_in_langchain_sandbox(
    prompt_name: str, language: str | None
) -> None:
    # langchain-core renders jinja2 in a sandbox that blocks every attribute
    # and method access (`labels.schema`, `t.get(...)`). Loading a template
    # does not exercise that sandbox; only formatting does, so render each
    # prompt the way InformationExtractor does at extraction time.
    extractor = InformationExtractor(
        model=None,  # type: ignore[arg-type]
        prompt_name=prompt_name,
        schema={"type": "object", "properties": {}},
    )
    rendered = extractor.prompt_template.format(
        extraction_context="CONTEXT",
        additional_instructions="INSTRUCTIONS",
        language=language,
        schema="SCHEMA",
        full_text="FULL TEXT",
    )

    assert "CONTEXT" in rendered
    assert "INSTRUCTIONS" in rendered
    assert "FULL TEXT" in rendered
    if language and language.lower() == "en":
        assert "Judgment text" in rendered
    else:
        assert "Tekst orzeczenia" in rendered
