"""Regression test: streaming the retrieve chain must keep the passthrough inputs.

The query generation step's JSON parser streams partial plain dicts. When those
reached the next `.assign()` step as separate chunks, langchain-core (1.7.x)
could not add them and replaced the accumulated input with the last chunk, so
`create_retriever_input` raised KeyError: 'max_documents' in /chat/stream.
"""

import os
from unittest.mock import patch

import pytest
from langchain_core.runnables import Runnable, RunnableLambda, RunnableParallel


_FINAL = {"vector_queries": {"detailed": "pranie pieniędzy"}}


class _FakeQueryGeneration(Runnable):
    """Mirrors a prompt | llm | JsonOutputParser chain: invoke returns the parsed
    dict, astream yields cumulative partial plain dicts."""

    def invoke(self, input, config=None, **kwargs):
        return _FINAL

    async def ainvoke(self, input, config=None, **kwargs):
        return _FINAL

    async def astream(self, input, config=None, **kwargs):
        yield {}
        yield {"vector_queries": {}}
        yield {"vector_queries": {"detailed": "pranie"}}
        yield _FINAL


@pytest.mark.unit
@pytest.mark.asyncio
@patch.dict(os.environ, {"OPENAI_API_KEY": "fake-key-for-import"})
async def test_streaming_keeps_max_documents_after_query_generation():
    from juddges_search.chains import retrieve

    fake_generation = _FakeQueryGeneration()
    chain = (
        RunnableParallel(
            {
                "question": retrieve.get_question,
                "max_documents": retrieve.get_max_documents,
                "chat_history": retrieve.chat_history_pass_through,
                "languages": retrieve.get_languages,
                "document_types": retrieve.get_document_types,
            }
        )
        .assign(processed_question=retrieve.generate_search_queries)
        .assign(context=RunnableLambda(retrieve.create_retriever_input))
    )

    with patch.object(retrieve, "search_query_generation", fake_generation):
        chunks = [chunk async for chunk in chain.astream({"question": "q", "max_documents": 7, "chat_history": []})]

    processed = [c["processed_question"] for c in chunks if "processed_question" in c]
    assert processed == [_FINAL]

    context = next(c["context"] for c in chunks if "context" in c)
    assert context["max_documents"] == 7
    assert context["question"] == _FINAL
