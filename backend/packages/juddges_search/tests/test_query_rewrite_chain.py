"""query_rewrite_chain unit tests with a fake LLM.

These tests inject a fake structured-output runnable so the chain factory
can be exercised without hitting OpenAI. We work around the fact that
LangChain's stock FakeListChatModel does not implement
`with_structured_output` by wrapping it manually with a JSON-parsing
RunnableLambda that returns a parsed Pydantic model.
"""

from typing import Any

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.runnables import Runnable, RunnableLambda

from juddges_search.chains.query_rewrite import build_query_rewrite_chain
from juddges_search.chains.query_rewrite_models import QueryRewriteResult


def _structured(llm: FakeListChatModel) -> Runnable:
    """Wrap a chat-message-returning fake LLM so it emits QueryRewriteResult.

    Mirrors what `ChatOpenAI.with_structured_output(QueryRewriteResult)`
    does at runtime (parse JSON content into the Pydantic model) without
    requiring the fake to implement tool/function calling.
    """

    def _parse(msg: Any) -> QueryRewriteResult:
        content = msg.content if hasattr(msg, "content") else str(msg)
        return QueryRewriteResult.model_validate_json(content)

    return llm | RunnableLambda(_parse)


@pytest.mark.unit
def test_chain_invokes_with_today_and_returns_pydantic():
    canned = QueryRewriteResult(
        rewritten_query="VAT digital services tax",
        jurisdiction="PL",
        keywords=["VAT", "digital services"],
    ).model_dump_json(by_alias=True)
    llm = _structured(FakeListChatModel(responses=[canned]))

    chain = build_query_rewrite_chain(structured_llm=llm)
    out = chain.invoke(
        {
            "query": "podatek VAT od usług cyfrowych",
            "today": "2026-05-12",
        }
    )

    assert isinstance(out, QueryRewriteResult)
    assert out.jurisdiction == "PL"
    assert out.keywords == ["VAT", "digital services"]


@pytest.mark.unit
def test_chain_passes_languages_hint_in_prompt():
    captured: list[str] = []

    class CapturingLLM(FakeListChatModel):
        def _generate(self, messages, *args, **kwargs):  # type: ignore[override]
            captured.append("\n".join(m.content for m in messages))
            return super()._generate(messages, *args, **kwargs)

    canned = QueryRewriteResult(rewritten_query="x").model_dump_json(by_alias=True)
    chain = build_query_rewrite_chain(structured_llm=_structured(CapturingLLM(responses=[canned])))

    chain.invoke({"query": "test", "today": "2026-05-12", "languages_hint": ["pl"]})

    prompt_text = captured[0]
    assert "pl" in prompt_text.lower()
    assert "2026-05-12" in prompt_text
