from juddges_search.models import DocumentChunk
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, AIMessage


class QuestionDict(BaseModel):
    """Model for structured question input"""

    vector_queries: dict = Field(default_factory=dict)
    term_queries: dict = Field(default_factory=dict)
    ideal_paragraph: str = Field(default="")


class DocumentRetrievalInput(BaseModel):
    """Input parameters for document retrieval."""

    question: str = Field(description="Question text")
    max_documents: int | None = Field(
        description="Maximum number of documents to retrieve",
        default=None,
    )
    score_threshold: float | None = Field(
        description="Similarity score threshold for document retrieval",
        default=None,
    )
    chat_history: list[HumanMessage | AIMessage] | None = Field(
        description="Chat history",
        default=None,
    )
    response_format: str | None = Field(
        description="Response format: 'short' for concise answers, 'detailed' for comprehensive analysis, or 'adaptive' (default) to let LLM decide based on query complexity",
        default="adaptive",
    )
    languages: list[str] | None = Field(
        description="List of language codes to filter documents (e.g., ['pl', 'uk'])",
        default=None,
    )
    document_types: list[str] | None = Field(
        description="List of document types to filter (e.g., ['judgment'])",
        default=None,
    )


class DocumentRetrieval(BaseModel):
    """Input parameters for document retrieval and question answering."""

    question: str | QuestionDict = Field(description="Question text or structured question input")
    max_documents: int | None = Field(
        description="Maximum number of documents to retrieve",
        default=None,
    )
    score_threshold: float | None = Field(
        description="Similarity score threshold for document retrieval",
        default=None,
    )
    chat_history: list[HumanMessage | AIMessage] | None = Field(
        description="Chat history",
        default=None,
    )
    languages: list[str] | None = Field(
        description="List of language codes to filter documents (e.g., ['pl', 'uk'])",
        default=None,
    )
    document_types: list[str] | None = Field(
        description="List of document types to filter (e.g., ['judgment'])",
        default=None,
    )
    response_format: str | None = Field(
        description="Response format: 'short' for concise answers, 'detailed' for comprehensive analysis, or 'adaptive' (default) to let LLM decide based on query complexity",
        default="adaptive",
    )


class Response(BaseModel):
    text: str = Field(description="Response text")
    document_ids: list[str] = Field(description="List of document IDs related to the response")
    format_used: str | None = Field(
        description="Format used for the response: 'short' or 'detailed'. Only present when using adaptive mode.",
        default=None,
    )


class DocumentRetrievalOutput(BaseModel):
    """Output parameters for document retrieval."""

    question: str | QuestionDict = Field(description="Question text or structured question input")
    chunks: list[DocumentChunk] = Field(description="Retrieved document chunks")
    answer: str = Field(description="Generated answer")
    confidence: float = Field(description="Confidence score for the answer")


class DocumentRetrievalChunksOutput(BaseModel):
    """Output parameters for retrieved document chunks."""

    chunks: list[DocumentChunk] = Field(description="Document chunks")
    processed_question: str | QuestionDict = Field(description="Processed/rewritten question")


class Metadata(BaseModel):
    """Metadata for the deal."""

    tags: list[str] = Field(description="Tags for the deal")
    title: str = Field(description="Title for the deal")
    description: str = Field(description="Description for the deal")
