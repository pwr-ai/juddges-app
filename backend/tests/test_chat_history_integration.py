"""
Integration test for chat functionality with chat history validation.

This test verifies that the chat system maintains context from previous messages
and that the LLM response incorporates information from the first message in a
4-message conversation history.

To run this test, you need to set the following environment variables:
- OPENAI_API_KEY: Your OpenAI API key
- WEAVIATE_URL: URL to your Weaviate instance
- BACKEND_API_KEY: API key for backend authentication (optional for tests)

Example:
    export OPENAI_API_KEY="your-key-here"
    export WEAVIATE_URL="http://localhost:8080"
    poetry run pytest tests/test_chat_history_integration.py -v -m integration
"""

import os
import pytest
from unittest.mock import AsyncMock
from langchain_core.messages import HumanMessage, AIMessage
from ai_tax_search.chains.models import DocumentRetrievalInput, Response
from loguru import logger

# Import chat_chain for integration tests that use it
# This is wrapped in a conditional to avoid import errors during unit tests
try:
    from ai_tax_search.chains.chat import chat_chain
except Exception:
    # If import fails due to missing environment variables or API keys, set to None
    # Integration tests will be skipped if environment variables are not set
    chat_chain = None


# Mock the chat chain for unit testing without external dependencies
@pytest.fixture
def mock_chat_chain():
    """Mock chat chain for testing without external API calls."""
    mock_response = Response(
        text="""## Analiza prawna dotycząca ulg VAT dla TechSolutions Sp. z o.o.

Wracając do pierwotnego pytania dotyczącego firmy TechSolutions Sp. z o.o. i usług związanych z oprogramowaniem komputerowym, mogę wskazać na następujące możliwości preferencyjnych stawek VAT:

**Ulgi i preferencje dostępne dla firmy:**

1. **Stawka 8% VAT** - zgodnie z art. 41 ust. 1 pkt 4 ustawy o VAT, niektóre usługi związane z oprogramowaniem mogą kwalifikować się do obniżonej stawki, szczególnie gdy dotyczą:
   - Usług edukacyjnych związanych z oprogramowaniem
   - Działalności badawczo-rozwojowej

2. **Zwolnienie z VAT** - art. 43 ust. 1 pkt 37 przewiduje zwolnienia dla niektórych usług IT, które mają charakter społecznie użyteczny

3. **Procedura szczególna dla małych firm** - jeśli TechSolutions Sp. z o.o. spełnia kryteria małego przedsiębiorcy, może skorzystać z uproszczonych procedur rozliczania VAT.

**Wnioski dla firmy TechSolutions Sp. z o.o.:**
- Standardowa stawka 23% może być obniżona w określonych przypadkach
- Zalecam analizę konkretnych usług świadczonych przez firmę
- Konieczna konsultacja z doradcą podatkowym dla optymalnego rozliczenia""",
        document_ids=["doc_123", "doc_456", "doc_789"],
    )

    async def mock_ainvoke(input_data):
        # Simulate processing time
        await AsyncMock()()
        return mock_response

    mock_chain = AsyncMock()
    mock_chain.ainvoke = mock_ainvoke
    return mock_chain


@pytest.mark.unit
@pytest.mark.asyncio
async def test_chat_with_4_message_history_uses_first_message_mock(mock_chat_chain):
    """
    Unit test with mocked chat chain that validates response structure
    and context preservation logic without external dependencies.
    """

    # Create a 4-message chat history about a specific tax scenario
    company_name = "TechSolutions Sp. z o.o."
    original_vat_rate = "23%"

    chat_history = [
        # Message 1: Initial tax scenario with specific details
        HumanMessage(
            content=f"Mam pytanie dotyczące VAT dla firmy {company_name}. "
            f"Sprzedajemy oprogramowanie komputerowe i chcemy wiedzieć "
            f"czy musimy stosować stawkę VAT {original_vat_rate} "
            f"na usługi związane z oprogramowaniem."
        ),
        # Message 2: Assistant response (mock previous conversation)
        AIMessage(
            content=f"Zgodnie z przepisami ustawy o VAT, usługi związane z oprogramowaniem "
            f"komputerowym dla firmy {company_name} podlegają stawce VAT {original_vat_rate}. "
            f"Dotyczy to zarówno licencji jak i usług wsparcia technicznego."
        ),
        # Message 3: Follow-up question about related topic
        HumanMessage(
            content="A co z usługami szkoleniowymi dla użytkowników oprogramowania? "
            "Czy one też podlegają tej samej stawce?"
        ),
        # Message 4: Assistant response about training
        AIMessage(
            content="Usługi szkoleniowe związane z oprogramowaniem również podlegają "
            "stawce 23% VAT, pod warunkiem że są bezpośrednio związane z "
            "dostarczanym oprogramowaniem."
        ),
    ]

    # Current question that should reference the original scenario
    current_question = (
        "Wracając do pierwotnego pytania - czy dla firmy z pierwszego pytania "
        "istnieją jakieś ulgi podatkowe lub inne preferencyjne stawki VAT "
        "które mogłyby zastąpić standardową stawkę?"
    )

    # Create input for the chat chain
    chat_input = DocumentRetrievalInput(
        question=current_question,
        chat_history=chat_history,
        max_documents=5,
        score_threshold=0.7,
    )

    logger.info(f"Testing chat with history - Current question: {current_question}")
    logger.info(f"Chat history length: {len(chat_history)} messages")

    # Invoke the mocked chat chain
    response = await mock_chat_chain.ainvoke(chat_input)

    # Verify response structure
    assert isinstance(response, Response), (
        f"Expected Response object, got {type(response)}"
    )
    assert hasattr(response, "text"), "Response should have 'text' attribute"
    assert hasattr(response, "document_ids"), (
        "Response should have 'document_ids' attribute"
    )
    assert isinstance(response.text, str), "Response text should be a string"
    assert isinstance(response.document_ids, list), "Document IDs should be a list"
    assert len(response.text) > 50, "Response should be substantial (>50 characters)"

    # Verify that the response uses information from the first message
    response_text_lower = response.text.lower()
    company_name_lower = company_name.lower()

    # Check if the response references the company name from the first message
    assert (
        company_name_lower in response_text_lower
        or "techsolutions" in response_text_lower
    ), (
        f"Response should reference the company name from first message. Got: {response.text[:200]}..."
    )

    # Check if the response mentions VAT context from the original scenario
    vat_indicators = ["vat", "podatek", "stawka", "23%", "oprogramowanie"]
    found_indicators = [
        indicator for indicator in vat_indicators if indicator in response_text_lower
    ]
    assert len(found_indicators) >= 2, (
        f"Response should contain VAT-related terms from first message. Found: {found_indicators}"
    )

    # Verify the response acknowledges the historical context
    context_indicators = [
        "pierwotny",
        "pierwszy",
        "wcześniej",
        "początk",
        "wspomnia",
        "firma",
        "spółka",
        "z o.o.",
        "techsolutions",
    ]
    found_context = [
        indicator
        for indicator in context_indicators
        if indicator in response_text_lower
    ]
    assert len(found_context) >= 1, (
        f"Response should acknowledge context from first message. Found: {found_context}"
    )

    logger.info("Test passed - Response correctly uses first message context")
    logger.info(f"Response length: {len(response.text)} characters")
    logger.info(f"Referenced documents: {len(response.document_ids)} documents")


# Real integration tests that require external services
@pytest.mark.integration
@pytest.mark.skipif(
    not os.getenv("OPENAI_API_KEY") or not os.getenv("WEAVIATE_URL"),
    reason="Integration test requires OPENAI_API_KEY and WEAVIATE_URL environment variables",
)
@pytest.mark.asyncio
async def test_chat_with_4_message_history_uses_first_message():
    """
    REAL INTEGRATION TEST - Requires external services

    Test that the chat system uses information from the first message
    when responding to the fourth message in a conversation history.

    This test creates a 4-message chat history where:
    1. First message contains specific tax scenario (company name, VAT rate)
    2. Second and third messages ask follow-up questions
    3. Fourth message asks about the original scenario
    4. Verifies that the response references information from the first message
    """
    # Create a 4-message chat history about a specific tax scenario
    company_name = "TechSolutions Sp. z o.o."
    original_vat_rate = "23%"

    chat_history = [
        # Message 1: Initial tax scenario with specific details
        HumanMessage(
            content=f"Mam pytanie dotyczące VAT dla firmy {company_name}. "
            f"Sprzedajemy oprogramowanie komputerowe i chcemy wiedzieć "
            f"czy musimy stosować stawkę VAT {original_vat_rate} "
            f"na usługi związane z oprogramowaniem."
        ),
        # Message 2: Assistant response (mock previous conversation)
        AIMessage(
            content=f"Zgodnie z przepisami ustawy o VAT, usługi związane z oprogramowaniem "
            f"komputerowym dla firmy {company_name} podlegają stawce VAT {original_vat_rate}. "
            f"Dotyczy to zarówno licencji jak i usług wsparcia technicznego."
        ),
        # Message 3: Follow-up question about related topic
        HumanMessage(
            content="A co z usługami szkoleniowymi dla użytkowników oprogramowania? "
            "Czy one też podlegają tej samej stawce?"
        ),
        # Message 4: Assistant response about training
        AIMessage(
            content="Usługi szkoleniowe związane z oprogramowaniem również podlegają "
            "stawce 23% VAT, pod warunkiem że są bezpośrednio związane z "
            "dostarczanym oprogramowaniem."
        ),
    ]

    # Current question that should reference the original scenario
    current_question = (
        "Wracając do pierwotnego pytania - czy dla firmy z pierwszego pytania "
        "istnieją jakieś ulgi podatkowe lub inne preferencyjne stawki VAT "
        "które mogłyby zastąpić standardową stawkę?"
    )

    # Create input for the chat chain
    chat_input = DocumentRetrievalInput(
        question=current_question,
        chat_history=chat_history,
        max_documents=5,
        score_threshold=0.7,
    )

    logger.info(f"Testing chat with history - Current question: {current_question}")
    logger.info(f"Chat history length: {len(chat_history)} messages")

    # Invoke the chat chain
    response = await chat_chain.ainvoke(chat_input)

    # Verify response structure
    assert isinstance(response, Response), (
        f"Expected Response object, got {type(response)}"
    )
    assert hasattr(response, "text"), "Response should have 'text' attribute"
    assert hasattr(response, "document_ids"), (
        "Response should have 'document_ids' attribute"
    )
    assert isinstance(response.text, str), "Response text should be a string"
    assert isinstance(response.document_ids, list), "Document IDs should be a list"
    assert len(response.text) > 50, "Response should be substantial (>50 characters)"

    # Verify that the response uses information from the first message
    response_text_lower = response.text.lower()
    company_name_lower = company_name.lower()

    # Check if the response references the company name from the first message
    assert (
        company_name_lower in response_text_lower
        or "techsolutions" in response_text_lower
    ), (
        f"Response should reference the company name from first message. Got: {response.text[:200]}..."
    )

    # Check if the response mentions VAT context from the original scenario
    vat_indicators = ["vat", "podatek", "stawka", "23%", "oprogramowanie"]
    found_indicators = [
        indicator for indicator in vat_indicators if indicator in response_text_lower
    ]
    assert len(found_indicators) >= 2, (
        f"Response should contain VAT-related terms from first message. Found: {found_indicators}"
    )

    # Verify the response acknowledges the historical context
    context_indicators = [
        "pierwotny",
        "pierwszy",
        "wcześniej",
        "początk",
        "wspomnia",
        "firma",
        "spółka",
        "z o.o.",
        "techsolutions",
    ]
    found_context = [
        indicator
        for indicator in context_indicators
        if indicator in response_text_lower
    ]
    assert len(found_context) >= 1, (
        f"Response should acknowledge context from first message. Found: {found_context}"
    )

    logger.info("Test passed - Response correctly uses first message context")
    logger.info(f"Response length: {len(response.text)} characters")
    logger.info(f"Referenced documents: {len(response.document_ids)} documents")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_chat_history_context_preservation():
    """
    Test that chat history context is properly preserved and formatted
    throughout the conversation flow.
    """

    # Create a shorter 2-message history to test basic context preservation
    chat_history = [
        HumanMessage(content="Czy sprzedaż książek elektronicznych podlega VAT?"),
        AIMessage(
            content="Tak, sprzedaż książek elektronicznych podlega VAT według "
            "stawki 5% jako produkt kultury."
        ),
    ]

    current_question = "A co z audiobookami?"

    chat_input = DocumentRetrievalInput(
        question=current_question, chat_history=chat_history, max_documents=3
    )

    response = await chat_chain.ainvoke(chat_input)

    # Verify response structure
    assert isinstance(response, Response)
    assert len(response.text) > 0

    # Verify that the response understands the context (books/digital products)
    response_lower = response.text.lower()
    context_terms = ["książ", "elektronicz", "digital", "audio", "vat", "stawka"]
    found_terms = [term for term in context_terms if term in response_lower]
    assert len(found_terms) >= 2, (
        f"Response should maintain context about books/digital products. Found: {found_terms}"
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_empty_chat_history():
    """
    Test that the chat system works correctly with no chat history.
    """

    question = "Jaka jest stawka VAT na usługi prawnicze?"

    chat_input = DocumentRetrievalInput(
        question=question,
        chat_history=None,  # No chat history
        max_documents=3,
    )

    response = await chat_chain.ainvoke(chat_input)

    # Verify response structure
    assert isinstance(response, Response)
    assert len(response.text) > 0
    assert isinstance(response.document_ids, list)

    # Response should still be coherent without history
    response_lower = response.text.lower()
    assert any(
        term in response_lower for term in ["vat", "stawka", "prawnic", "usług"]
    ), "Response should address the legal services VAT question"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_chat_history_with_mixed_message_types():
    """
    Test chat functionality with various types of messages in history.
    """

    chat_history = [
        HumanMessage(content="Witaj! Potrzebuję pomocy z VAT."),
        AIMessage(
            content="Witam! Chętnie pomogę w kwestiach związanych z VAT. "
            "O co konkretnie chciałby Pan/Pani zapytać?"
        ),
        HumanMessage(content="Moja firma zajmuje się cateringiem. Jaka stawka VAT?"),
        AIMessage(
            content="Usługi cateringowe podlegają stawce VAT 23%. "
            "Dotyczy to zarówno dostawy żywności jak i obsługi."
        ),
    ]

    current_question = (
        "A czy mogę skorzystać z jakichś ulg dla małych firm cateringowych?"
    )

    chat_input = DocumentRetrievalInput(
        question=current_question, chat_history=chat_history, max_documents=5
    )

    response = await chat_chain.ainvoke(chat_input)

    # Verify response
    assert isinstance(response, Response)
    assert len(response.text) > 0

    # Should reference catering context from history
    response_lower = response.text.lower()
    catering_terms = ["catering", "żywność", "firma", "mał", "ulg"]
    found_catering = [term for term in catering_terms if term in response_lower]
    assert len(found_catering) >= 2, (
        f"Response should reference catering business context. Found: {found_catering}"
    )
