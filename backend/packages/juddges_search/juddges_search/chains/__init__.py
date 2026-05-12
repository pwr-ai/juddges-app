"""LangChain chains for Juddges Search."""

from juddges_search.chains.query_rewrite import (
    build_query_rewrite_chain,
    query_rewrite_chain,
)
from juddges_search.chains.query_rewrite_models import QueryRewriteResult
from juddges_search.chains.schema_generation import (
    generate_schema,
    schema_generation_chain,  # This is now a function that builds the chain lazily
)

__all__ = [
    "build_query_rewrite_chain",
    "generate_schema",
    "query_rewrite_chain",
    "QueryRewriteResult",
    "schema_generation_chain",  # Callable that returns the chain (lazy init)
]
