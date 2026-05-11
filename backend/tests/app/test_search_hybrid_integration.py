"""Integration test: hybrid search surfaces a semantic match keyword would miss.

Requires:
- A running Meilisearch (env vars MEILISEARCH_URL + MEILISEARCH_ADMIN_KEY)
- A reachable TEI server (env var TEI_EMBEDDING_URL)
- Marked ``integration`` so it doesn't run in default CI.
"""

from __future__ import annotations

import os
import uuid

import pytest

from app.services.meilisearch_config import setup_meilisearch_index
from app.services.meilisearch_embeddings import attach_embedding
from app.services.search import MeiliSearchService

pytestmark = pytest.mark.integration


@pytest.fixture
async def service():
    import httpx
    from juddges_search.embeddings import embed_texts

    if not os.getenv("MEILISEARCH_URL") or not os.getenv("TEI_EMBEDDING_URL"):
        pytest.skip("MEILISEARCH_URL / TEI_EMBEDDING_URL not configured")

    index_name = f"test_hybrid_{uuid.uuid4().hex[:8]}"
    svc = MeiliSearchService(
        base_url=os.getenv("MEILISEARCH_URL"),
        api_key=os.getenv("MEILISEARCH_ADMIN_KEY") or os.getenv("MEILI_MASTER_KEY"),
        admin_key=os.getenv("MEILISEARCH_ADMIN_KEY") or os.getenv("MEILI_MASTER_KEY"),
        index_name=index_name,
    )

    # Skip if Meilisearch is not reachable (env vars set but service not running)
    try:
        await svc.health()
    except (httpx.ConnectError, httpx.TimeoutException, Exception):
        pytest.skip("Meilisearch not reachable at MEILISEARCH_URL")

    # Skip if TEI embedding server is not functional (env var set but server down/missing)
    import asyncio

    try:
        vec = await asyncio.to_thread(embed_texts, "ping")
        if not vec:
            pytest.skip("TEI embedding server returned empty vector")
    except Exception:
        pytest.skip("TEI embedding server not reachable at TEI_EMBEDDING_URL")

    await setup_meilisearch_index(svc)
    yield svc
    # Cleanup
    async with httpx.AsyncClient() as client:
        await client.delete(
            f"{svc.base_url}/indexes/{index_name}",
            headers=svc._admin_headers(),
        )


async def _build_doc(doc_id: str, **fields) -> dict:
    row = {
        "base_case_name": fields.get("name"),
        "base_keywords": fields.get("keywords") or [],
        "structure_case_identification_summary": fields.get("ident"),
        "structure_facts_summary": fields.get("facts"),
        "structure_operative_part_summary": fields.get("operative"),
    }
    doc = {"id": doc_id, "title": fields.get("title", ""), "case_number": doc_id}
    return await attach_embedding(doc, row)


@pytest.mark.asyncio
async def test_semantic_match_outranks_keyword_only(service):
    """Polish 'złagodzenie wyroku' should surface for English 'sentence reduction'."""
    polish = await _build_doc(
        "pl-1",
        title="Wyrok karny",
        name="X v. State",
        keywords=["złagodzenie wyroku", "karne"],
        facts="Sąd zastosował złagodzenie wyroku z uwagi na szczególne okoliczności.",
    )
    unrelated_en = await _build_doc(
        "en-1",
        title="Contract dispute",
        name="A v. B",
        keywords=["contract", "breach"],
        facts="Defendant failed to deliver goods under the contract.",
    )

    await service.upsert_documents([polish, unrelated_en])
    # Wait for indexing
    import asyncio

    await asyncio.sleep(2.0)

    result = await service.autocomplete("sentence reduction", semantic_ratio=0.5)
    ids = [hit["id"] for hit in result.get("hits", [])]
    assert "pl-1" in ids, f"Polish doc should rank in hybrid results; got {ids}"
    # The Polish doc should rank above the unrelated English contract doc
    assert ids.index("pl-1") < ids.index("en-1") if "en-1" in ids else True
