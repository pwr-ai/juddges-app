"""Tests for chat chain that exercise the LLM injection seam without hitting OpenAI."""
import os
import pytest
from unittest.mock import patch
from juddges_search.testing import FakeChatModel


@pytest.mark.unit
@patch.dict(os.environ, {"OPENAI_API_KEY": "fake-key-for-import"})
def test_build_chat_chain_uses_injected_llm():
    """Chat chain factory accepts an llm parameter and uses it."""
    from juddges_search.chains.chat import build_chat_chain

    fake_llm = FakeChatModel(responses=['{"answer": "judicial-answer", "sources": []}'])
    fake_classifier = FakeChatModel(responses=["document_search"])  # Always do retrieval for test

    # Pass a no-op retriever that returns the expected structure
    def no_op_retriever(inputs):
        return {
            "context": "",  # Empty context for test
            "question": inputs.get("question", ""),
            "chat_history": inputs.get("chat_history", []),
            "response_format": inputs.get("response_format", "adaptive"),
        }

    chain = build_chat_chain(llm=fake_llm, retriever=no_op_retriever, classifier_llm=fake_classifier)

    # Based on the chat chain structure, it expects DocumentRetrievalInput shape
    result = chain.invoke({"question": "what is res judicata?"})

    # Verify fake LLM was called
    assert len(fake_llm.calls) >= 1
    assert "judicial-answer" in str(result)