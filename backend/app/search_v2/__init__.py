"""Test search engine over the Weaviate v2 corpus (issue #867).

``POST /search/v2`` runs hybrid search over ``JudgmentChunks`` in a separate
Weaviate instance, embedded with ``sdadas/mmlw-retrieval-e5-large`` via its own
TEI server, and aggregates chunks to judgments by their best chunk (MaxP).
Nothing else in the app imports this package: the Weaviate client is created
on the first request, and the endpoint answers 503 while the ``WEAVIATE_V2_*``
env is unset.
"""

from app.search_v2.api import router

__all__ = ["router"]
