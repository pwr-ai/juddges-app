import pytest
from juddges_search.llm_provider import LLMProvider, get_llm_provider


@pytest.mark.unit
def test_get_llm_provider_function_exists():
    """get_llm_provider function should exist and be callable."""
    assert callable(get_llm_provider)


@pytest.mark.unit
def test_llm_provider_protocol_runtime_checkable():
    """LLMProvider protocol should be runtime checkable."""
    class Dummy:
        def invoke(self, messages, **kwargs):
            return "ok"

        async def ainvoke(self, messages, **kwargs):
            return "ok"

    assert isinstance(Dummy(), LLMProvider)