
from langchain_core.runnables import RunnableLambda, RunnableParallel, RunnableSequence
from loguru import logger

from ai_tax_search.chains.callbacks import callbacks
from ai_tax_search.chains.models import (
    DocumentRetrievalChunksOutput,
    DocumentRetrievalInput,
)
from ai_tax_search.chains.rewrite_queries import search_query_generation
from ai_tax_search.retrieval.chunks_search import prepare_retriever
from ai_tax_search.settings import DEFAULT_MAX_RESULTS
from ai_tax_search.utils import sync_wrapper


def chat_history_pass_through(input):
    """
    Extract chat_history from input.
    Input can be either a dict or a Pydantic model (DocumentRetrievalInput).
    """
    logger.debug(f"History pass through input: {input}")

    # Handle both dict and Pydantic model inputs
    if isinstance(input, dict):
        return input.get("chat_history", [])
    else:
        # Pydantic model - use attribute access
        return getattr(input, "chat_history", None) or []


# Create a function to combine processed question with max_documents, languages, and document_types
def create_retriever_input(inputs):
    return {
        "question": inputs["processed_question"],
        "max_documents": inputs["max_documents"],
        "languages": inputs.get("languages"),
        "document_types": inputs.get("document_types"),
    }


def get_max_documents(input):
    """
    Extract max_documents from input.
    Input can be either a dict or a Pydantic model (DocumentRetrievalInput).
    """
    if isinstance(input, dict):
        return input.get("max_documents", DEFAULT_MAX_RESULTS)
    else:
        # Pydantic model - use attribute access
        return getattr(input, "max_documents", None) or DEFAULT_MAX_RESULTS


def get_question(input):
    """
    Extract question from input.
    Input can be either a dict or a Pydantic model (DocumentRetrievalInput).
    """
    if isinstance(input, dict):
        return input["question"]
    else:
        # Pydantic model - use attribute access
        return input.question


def get_languages(input):
    """
    Extract languages from input.
    Input can be either a dict or a Pydantic model (DocumentRetrievalInput).
    """
    if isinstance(input, dict):
        return input.get("languages", None)
    else:
        # Pydantic model - use attribute access
        return getattr(input, "languages", None)


def get_document_types(input):
    """
    Extract document_types from input.
    Input can be either a dict or a Pydantic model (DocumentRetrievalInput).
    """
    if isinstance(input, dict):
        return input.get("document_types", None)
    else:
        # Pydantic model - use attribute access
        return getattr(input, "document_types", None)


retrieve_documents_runnable = (
    RunnableParallel(
        {
            "question": lambda input: get_question(input),
            "max_documents": lambda input: get_max_documents(input),
            "chat_history": lambda input: chat_history_pass_through(input),
            "languages": lambda input: get_languages(input),
            "document_types": lambda input: get_document_types(input),
        }
    )
    .assign(
        processed_question=RunnableSequence(
            RunnableLambda(
                lambda inputs: {
                    "question": inputs["question"],
                    "chat_history": inputs["chat_history"],
                }
            ),
            search_query_generation,
        )
    )
    .assign(
        context=RunnableSequence(
            RunnableLambda(create_retriever_input),
            RunnableLambda(func=sync_wrapper(prepare_retriever), afunc=prepare_retriever),
        ).with_config(run_name="retrieve_documents")
    )
    .with_config(run_name="retrieve_documents_runnable")
)


chain = (
    RunnableSequence(
        retrieve_documents_runnable,
        RunnableLambda(
            lambda inputs: {"chunks": inputs["context"], "processed_question": inputs["processed_question"]}
        ),
    )
    .with_config(run_name="retrieve_chain", callbacks=callbacks)
    .with_types(input_type=DocumentRetrievalInput, output_type=DocumentRetrievalChunksOutput)
)
