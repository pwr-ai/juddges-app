from juddges_search.chains.models import DocumentRetrievalInput, Response
from juddges_search.chains.retrieve import retrieve_documents_runnable
from juddges_search.chains.callbacks import callbacks
from juddges_search.llm_provider import get_llm_provider, LLMProvider
from juddges_search.prompts.formatters.documents import format_documents_with_metadata
from juddges_search.prompts.formatters.chat_history import format_chat_history_as_string
from juddges_search.prompts.legal import (
    LEGAL_SYSTEM_PROMPT,
    LEGAL_INSTRUCTION_PROMPT,
    SHORT_FORMAT_INSTRUCTIONS,
    DETAILED_FORMAT_INSTRUCTIONS,
    ADAPTIVE_FORMAT_INSTRUCTIONS,
    SHORT_RESPONSE_EXAMPLE,
    DETAILED_RESPONSE_EXAMPLE,
)
from juddges_search import __version__
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.runnables import RunnableLambda, RunnableSequence, RunnableBranch, Runnable
from loguru import logger
from typing import Any


def _build_legal_prompt(response_format: str = "adaptive") -> str:
    """
    Build the complete legal chat prompt based on response format.

    Args:
        response_format: Either 'short', 'detailed', or 'adaptive' (default)
                        'adaptive' lets the LLM decide based on query complexity

    Returns:
        Complete prompt string combining system, instructions, format specs, and examples
    """
    if response_format == "adaptive":
        # Use adaptive format - LLM decides between short and detailed
        format_instructions = ADAPTIVE_FORMAT_INSTRUCTIONS
        # No example needed - format selection criteria are in instructions
        example = ""
    elif response_format == "short":
        format_instructions = SHORT_FORMAT_INSTRUCTIONS
        example = SHORT_RESPONSE_EXAMPLE
    else:  # detailed
        format_instructions = DETAILED_FORMAT_INSTRUCTIONS
        example = DETAILED_RESPONSE_EXAMPLE

    prompt_parts = [LEGAL_SYSTEM_PROMPT, "", LEGAL_INSTRUCTION_PROMPT, "", format_instructions]

    if example:
        prompt_parts.extend(["", example])

    prompt_parts.extend(["", "JSON:"])

    return "\n".join(prompt_parts)


# Create prompt templates for all response formats
LEGAL_CHAT_PROMPT_SHORT = _build_legal_prompt("short")
LEGAL_CHAT_PROMPT_DETAILED = _build_legal_prompt("detailed")
LEGAL_CHAT_PROMPT_ADAPTIVE = _build_legal_prompt("adaptive")

# Model instantiation moved to build_chat_chain factory

# Create chat prompt templates for all response formats
# Using default f-string format instead of jinja2 to avoid conflicts with JSON curly braces in examples
chat_prompt_short = ChatPromptTemplate.from_template(LEGAL_CHAT_PROMPT_SHORT)
chat_prompt_detailed = ChatPromptTemplate.from_template(LEGAL_CHAT_PROMPT_DETAILED)
chat_prompt_adaptive = ChatPromptTemplate.from_template(LEGAL_CHAT_PROMPT_ADAPTIVE)


def _get_value(inputs, key: str, default=None):
    """
    Get value from inputs, supporting both dict and Pydantic models.

    Args:
        inputs: Either a dict or Pydantic model
        key: Key/attribute name to retrieve
        default: Default value if key not found

    Returns:
        Value from inputs or default
    """
    if isinstance(inputs, dict):
        return inputs.get(key, default)
    else:
        return getattr(inputs, key, default)


def _select_prompt_by_format(inputs) -> ChatPromptTemplate:
    """
    Select the appropriate prompt template based on response_format parameter.

    Args:
        inputs: Dictionary or Pydantic model containing response_format key

    Returns:
        ChatPromptTemplate for the specified format
    """
    response_format = _get_value(inputs, "response_format", "adaptive")

    if response_format == "short":
        return chat_prompt_short
    elif response_format == "detailed":
        return chat_prompt_detailed
    else:  # adaptive (default)
        return chat_prompt_adaptive


def _classify_query_type(inputs, classifier_llm: LLMProvider | None = None) -> str:
    """
    Classify user query using a nano LLM to determine if document retrieval is needed.

    Query types:
    - 'reformulation': User asks to rewrite/rephrase previous response
    - 'format_change': User asks to change format (short/detailed)
    - 'general_knowledge': General legal question not requiring document search
    - 'document_search': Requires searching legal documents (default)

    Args:
        inputs: Dictionary or Pydantic model containing 'question' and optionally 'chat_history'
        classifier_llm: Optional LLM for classification. If None, uses default mini model.

    Returns:
        Query type string
    """
    question = _get_value(inputs, "question", "").strip()

    classification_prompt = f"""Classify the following user query into ONE of these categories:

- reformulation: User asks to rewrite/rephrase/paraphrase previous response
- format_change: User asks to change format (shorter/longer/more detailed/more concise)
- general_knowledge: ONLY for basic definitional questions like "What is VAT?" or "Explain tax deduction concept" - pure theory without practical application
- document_search: DEFAULT - Use for ANY question about:
  * Specific legal rules, conditions, or requirements (e.g., "When can I deduct VAT?", "Kiedy przysługuje prawo do odliczenia?")
  * Court judgments, rulings, or case law
  * Tax interpretations or administrative guidance
  * Practical legal advice or application of law
  * Criminal law, sentencing, or judicial decisions
  * Any question that would benefit from citing specific legal documents

IMPORTANT: When in doubt, choose 'document_search'. Legal questions about specific rights, obligations, conditions, or procedures should ALWAYS use 'document_search'.

User query: "{question}"

Respond with ONLY the category name (reformulation, format_change, general_knowledge, or document_search)."""

    if classifier_llm is None:
        from juddges_search.llms import get_default_llm

        nano_model = get_default_llm(use_mini_model=True)
    else:
        nano_model = classifier_llm

    try:
        classification = nano_model.invoke(classification_prompt).content.strip().lower()

        # Validate the classification
        valid_types = ["reformulation", "format_change", "general_knowledge", "document_search"]
        if classification in valid_types:
            logger.info(f"Query classified as '{classification}': {question}")
            return classification
        else:
            logger.warning(f"Invalid classification '{classification}', defaulting to 'document_search'")
            return "document_search"
    except Exception as e:
        logger.error(f"Error in query classification: {e}, defaulting to 'document_search'")
        return "document_search"


def _handle_query_without_retrieval(inputs) -> dict:
    """
    Handle queries that don't require document retrieval.
    Returns inputs with empty context for direct LLM processing.

    Args:
        inputs: Original input (dict or Pydantic model) with question and chat_history

    Returns:
        Dict with empty context and formatted chat history
    """
    # Convert Pydantic model to dict if needed
    if not isinstance(inputs, dict):
        inputs = inputs.model_dump()

    return {
        **inputs,
        "context": "",
        "chat_history": format_chat_history_as_string(inputs)
        if inputs.get("chat_history")
        else "Brak wcześniejszej rozmowy.",
        "response_format": inputs.get("response_format", "adaptive"),
    }


def _route_to_appropriate_prompt(inputs: dict):
    """
    Route inputs to the appropriate prompt template based on response_format.

    Args:
        inputs: Formatted inputs with context, chat_history, question, response_format

    Returns:
        Prompt output ready for LLM
    """
    prompt_template = _select_prompt_by_format(inputs)
    return prompt_template.invoke(inputs)


def build_chat_chain(
    *,
    llm: LLMProvider | None = None,
    retriever: Runnable | None = None,
    classifier_llm: LLMProvider | None = None,
) -> Runnable[Any, Any]:
    """
    Build a chat chain with injected dependencies for testing.

    Args:
        llm: LLM provider for main chat. If None, uses default LLM provider.
        retriever: Document retriever. If None, uses default retrieve_documents_runnable.
        classifier_llm: LLM for query classification. If None, uses default mini model.

    Returns:
        Complete chat chain runnable
    """
    # Use defaults if not provided
    if llm is None:
        llm = get_llm_provider()
    if retriever is None:
        retriever = retrieve_documents_runnable

    # Create classification function with injected LLM
    def _should_skip_retrieval_with_llm(inputs) -> bool:
        """Check if retrieval should be skipped using the injected classifier LLM."""
        query_type = _classify_query_type(inputs, classifier_llm=classifier_llm)
        return query_type in ["reformulation", "format_change", "general_knowledge"]

    # Enhanced document retrieval and formatting that includes chat history context
    retrieve_and_format_with_chat_runnable = (
        retriever
        | RunnableLambda(
            lambda inputs: {
                **inputs,
                "context": format_documents_with_metadata(inputs["context"]),
                "chat_history": format_chat_history_as_string(inputs)
                if inputs.get("chat_history")
                else "Brak wcześniejszej rozmowy.",
                "response_format": inputs.get("response_format", "adaptive"),
            }
        )
    ).with_config(run_name="retrieve_and_format_with_chat_runnable")

    # Branching logic for retrieval
    retrieval_branch = RunnableBranch(
        # If should skip retrieval, handle without document search
        (
            _should_skip_retrieval_with_llm,
            RunnableLambda(_handle_query_without_retrieval).with_config(
                run_name="skip_retrieval_handler", tags=["no-retrieval", "direct-response"]
            ),
        ),
        # Otherwise, perform full retrieval
        retrieve_and_format_with_chat_runnable,
    ).with_config(run_name="retrieval_routing_branch")

    # Build the complete chain
    return (
        RunnableSequence(
            retrieval_branch,
            RunnableLambda(_route_to_appropriate_prompt).with_config(
                run_name="legal_prompt_router", tags=["prompt-selection", "format-routing"]
            ),
            llm.with_config(run_name="legal_chat_llm_call", tags=["gpt5", "legal-assistant", "juddges"]),
            JsonOutputParser().with_config(
                run_name="legal_chat_json_parser", tags=["json-output", "structured-response"]
            ),
        )
        .with_config(
            run_name="legal_chat_assistant",
            callbacks=callbacks,
            tags=["legal-ai", "juddges", "chat-with-history", "wust-project", "legal-judgments"],
            metadata={
                "version": __version__,
                "purpose": "Legal judgments analysis for Polish tax law and criminal law with chat history and intelligent retrieval routing",
                "project": "Juddges - WUST",
                "domain": "legal-judgments-multi-domain",
                "features": [
                    "chat_history",
                    "document_retrieval",
                    "legal_citations",
                    "format_routing",
                    "intelligent_retrieval_routing",
                    "query_classification",
                ],
            },
        )
        .with_types(input_type=DocumentRetrievalInput, output_type=Response)
    )




# Main chat chain - preserve compatibility for LangServe
chat_chain = build_chat_chain()
