import pytest
from juddges_search.llm_provider import LLMProvider, get_llm_provider
from juddges_search.testing import FakeChatModel


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


@pytest.mark.unit
def test_fake_chat_model_satisfies_protocol():
    fake = FakeChatModel(responses=["hello"])
    assert isinstance(fake, LLMProvider)


@pytest.mark.unit
def test_fake_chat_model_returns_canned_response_in_order():
    fake = FakeChatModel(responses=["first", "second"])
    assert fake.invoke("ignored").content == "first"
    assert fake.invoke("ignored").content == "second"


@pytest.mark.unit
def test_fake_chat_model_records_calls():
    fake = FakeChatModel(responses=["x"])
    fake.invoke("the prompt")
    assert fake.calls == ["the prompt"]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_fake_chat_model_ainvoke():
    fake = FakeChatModel(responses=["async-response"])
    result = await fake.ainvoke("prompt")
    assert result.content == "async-response"


@pytest.mark.unit
def test_fake_chat_model_raises_when_exhausted():
    fake = FakeChatModel(responses=["only-one"])
    fake.invoke("p1")
    with pytest.raises(IndexError, match="exhausted"):
        fake.invoke("p2")