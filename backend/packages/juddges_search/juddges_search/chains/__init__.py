"""LangChain chains for Juddges Search."""

from juddges_search.chains.schema_generation import (
    generate_schema,
    schema_generation_chain,  # This is now a function that builds the chain lazily
)

__all__ = [
    "generate_schema",
    "schema_generation_chain",  # Callable that returns the chain (lazy init)
]
