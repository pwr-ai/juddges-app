"""Database operations for legal document retrieval and vector search."""

import re
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from loguru import logger
from supabase import PostgrestAPIError, StorageException

from ._base import SupabaseClientMixin

# ---------------------------------------------------------------------------
# Column projection constants
# Real columns from public.judgments. The `embedding` column is deliberately
# excluded here — it's ~6KB per row and callers that need the vector use the
# chunk-search RPC path instead.
# ---------------------------------------------------------------------------
_JUDGMENT_COLS = (
    "id, case_number, jurisdiction, court_name, court_level, "
    "decision_date, publication_date, title, summary, full_text, "
    "judges, case_type, decision_type, outcome, keywords, legal_topics, "
    "cited_legislation, metadata, source_dataset, source_id, source_url, "
    "created_at, updated_at, "
    # Base-schema extraction fields (typed columns on judgments). Surfaced so
    # the document metadata endpoint can render Number of Victims, Appellant,
    # Appeal Outcome, etc. on the document page.
    "base_extraction_status, base_extraction_model, base_extracted_at, "
    "base_keywords, base_neutral_citation_number, base_case_number, "
    "base_date_of_appeal_court_judgment, base_appeal_court_judges_names, "
    "base_case_name, base_offender_representative_name, "
    "base_crown_attorney_general_representative_name, base_conv_court_names, "
    "base_convict_plea_dates, base_convict_offences, base_acquit_offences, "
    "base_did_offender_confess, base_plea_point, base_remand_decision, "
    "base_remand_custody_time, base_sent_court_name, base_sentences_received, "
    "base_sentence_serve, base_what_ancilliary_orders, base_offender_gender, "
    "base_offender_age_offence, base_offender_job_offence, "
    "base_offender_home_offence, base_offender_mental_offence, "
    "base_offender_intox_offence, base_offender_victim_relationship, "
    "base_victim_type, base_num_victims, base_victim_gender, "
    "base_victim_age_offence, base_victim_job_offence, base_victim_home_offence, "
    "base_victim_mental_offence, base_victim_intox_offence, "
    "base_pros_evid_type_trial, base_def_evid_type_trial, base_pre_sent_report, "
    "base_agg_fact_sent, base_mit_fact_sent, base_vic_impact_statement, "
    "base_appellant, base_co_def_acc_num, base_appeal_against, "
    "base_appeal_ground, base_sent_guide_which, base_appeal_outcome, "
    "base_reason_quash_conv, base_reason_sent_excessive, "
    "base_reason_sent_lenient, base_reason_dismiss, "
    "base_extraction_error, base_schema_key, base_schema_version"
)

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


class SupabaseVectorDB(SupabaseClientMixin):
    """Database operations for vector search using pgvector.

    This class provides semantic search capabilities using Supabase's pgvector extension.
    It supports:
    - Pure vector similarity search
    - Hybrid search (vector + full-text + metadata filters)
    - Chunk-level search for RAG applications
    """

    def __init__(self):
        self._init_client("SupabaseVectorDB", postgrest_timeout=60)

    async def search_by_vector(
        self,
        query_embedding: List[float],
        match_count: int = 10,
        match_threshold: float = 0.5,
    ) -> List[Dict[str, Any]]:
        """Pure vector similarity search via `search_judgments_by_embedding` RPC.

        Translates the RPC's slim shape (`id, case_number, title, summary,
        jurisdiction, decision_date, similarity`) into the legacy `document_*`
        keys callers expect, so the API contract above this layer is unchanged.
        """
        try:
            response = self.client.rpc(
                "search_judgments_by_embedding",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": match_threshold,
                    "match_count": match_count,
                },
            ).execute()

            return [
                {
                    # Legacy keys callers read; mapped from the real RPC columns.
                    "document_id": row.get("id"),
                    "supabase_document_id": row.get("id"),
                    "title": row.get("title"),
                    "summary": row.get("summary"),
                    "document_type": "judgment",
                    "date_issued": row.get("decision_date"),
                    "publication_date": row.get("decision_date"),
                    "country": row.get("jurisdiction"),
                    "language": "en" if row.get("jurisdiction") == "UK" else "pl",
                    "document_number": row.get("case_number"),
                    "similarity": row.get("similarity"),
                }
                for row in (response.data or [])
            ]
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Vector search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Vector search failed: {str(e)}")

    async def hybrid_search(
        self,
        query_text: str,
        query_embedding: List[float],
        document_type: Optional[str] = None,
        court_name: Optional[str] = None,
        language: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        country: Optional[str] = None,
        match_count: int = 10,
        vector_weight: float = 0.7,
        text_weight: float = 0.3,
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining vector similarity, full-text search, and metadata filters.

        Args:
            query_text: Text query for full-text search
            query_embedding: 1024-dimensional embedding vector
            document_type: Filter by document type (e.g., "judgment")
            court_name: Filter by court name (partial match)
            language: Filter by language code (e.g., "pl", "en")
            start_date: Filter documents issued after this date (ISO format)
            end_date: Filter documents issued before this date (ISO format)
            country: Filter by country code (e.g., "PL", "UK")
            match_count: Maximum number of results
            vector_weight: Weight for vector similarity (0-1)
            text_weight: Weight for text search (0-1)

        Returns:
            List of documents with combined scores
        """
        try:
            response = self.client.rpc(
                "hybrid_search_documents",
                {
                    "query_text": query_text,
                    "query_embedding": query_embedding,
                    "p_document_type": document_type,
                    "p_court_name": court_name,
                    "p_language": language,
                    "p_start_date": start_date,
                    "p_end_date": end_date,
                    "p_country": country,
                    "match_count": match_count,
                    "vector_weight": vector_weight,
                    "text_weight": text_weight,
                },
            ).execute()

            return response.data or []
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Hybrid search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Hybrid search failed: {str(e)}")

    async def search_chunks(
        self,
        query_embedding: List[float],
        match_count: int = 20,
        match_threshold: float = 0.5,
        include_key_sections_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Chunk-level semantic search for RAG applications.

        Args:
            query_embedding: 1024-dimensional embedding vector
            match_count: Maximum number of chunks to return
            match_threshold: Minimum similarity score (0-1)
            include_key_sections_only: If True, only return key sections (holdings, conclusions)

        Returns:
            List of chunks with similarity scores
        """
        try:
            response = self.client.rpc(
                "search_document_chunks",
                {
                    "query_embedding": query_embedding,
                    "match_count": match_count,
                    "match_threshold": match_threshold,
                    "include_key_sections_only": include_key_sections_only,
                },
            ).execute()

            return response.data or []
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Chunk search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Chunk search failed: {str(e)}")

    async def get_document_chunks(
        self,
        document_id: str,
        include_embeddings: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Get all chunks for a specific document.

        Args:
            document_id: The document ID
            include_embeddings: Whether to include embedding vectors

        Returns:
            List of chunks ordered by chunk_index
        """
        try:
            response = self.client.rpc(
                "get_document_chunks",
                {
                    "p_document_id": document_id,
                    "include_embeddings": include_embeddings,
                },
            ).execute()

            return response.data or []
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to get document chunks: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get chunks: {str(e)}")

    async def get_document_by_id(
        self,
        document_id: str,
        return_vectors: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Fetch a single judgment by its UUID `id` or text `source_id`.

        Returns the raw row dict (judgment column shape). Downstream callers
        translate via `_convert_judgment_to_legal_document`.

        Args:
            document_id: UUID `judgments.id` or text `source_id`.
            return_vectors: When True, includes the `embedding` column
                (~6KB/row). Use only when the caller actually needs the vector
                — e.g. similarity search seeded by an existing row.
        """
        try:
            column = "id" if _UUID_RE.match(document_id) else "source_id"
            cols = _JUDGMENT_COLS + (", embedding" if return_vectors else "")
            response = self.client.table("judgments").select(cols).eq(column, document_id).limit(1).execute()
            return response.data[0] if response.data else None
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to fetch judgment {document_id}: {e}")
            return None

    async def get_documents_by_ids(
        self,
        document_ids: List[str],
    ) -> List[Dict[str, Any]]:
        """Fetch multiple judgments by their UUIDs or source_ids.

        Callers may mix UUID `id` and text `source_id` values in one batch;
        each input is routed to the matching column. Returned rows are
        deduplicated by `judgments.id` (so a caller passing both forms for the
        same row gets it once).
        """
        if not document_ids:
            return []

        uuid_ids = [i for i in document_ids if _UUID_RE.match(i)]
        text_ids = [i for i in document_ids if not _UUID_RE.match(i)]

        try:
            rows_by_id: Dict[str, Dict[str, Any]] = {}
            if uuid_ids:
                r = self.client.table("judgments").select(_JUDGMENT_COLS).in_("id", uuid_ids).execute()
                for row in r.data or []:
                    rows_by_id[row["id"]] = row
            if text_ids:
                r = self.client.table("judgments").select(_JUDGMENT_COLS).in_("source_id", text_ids).execute()
                for row in r.data or []:
                    rows_by_id[row["id"]] = row
            return list(rows_by_id.values())
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to fetch judgments: {e}")
            return []

    async def get_embedding_stats(self) -> Dict[str, Any]:
        """Statistics about embedding coverage on `judgments`.

        Computed directly via two count queries (no `get_embedding_stats` RPC
        exists in this project's schema).
        """
        try:
            total = self.client.table("judgments").select("id", count="exact").execute()
            with_embedding = (
                self.client.table("judgments").select("id", count="exact").not_.is_("embedding", "null").execute()
            )
            total_count = total.count or 0
            covered = with_embedding.count or 0
            return {
                "total_documents": total_count,
                "with_embedding": covered,
                "without_embedding": total_count - covered,
                "coverage_pct": (covered / total_count * 100) if total_count else 0.0,
            }
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to get embedding stats: {e}")
            return {}


# ---------------------------------------------------------------------------
# Singleton management
# ---------------------------------------------------------------------------
_vector_db: Optional[SupabaseVectorDB] = None


def get_vector_db() -> SupabaseVectorDB:
    """Get the shared SupabaseVectorDB instance for vector search operations."""
    global _vector_db
    if _vector_db is None:
        try:
            _vector_db = SupabaseVectorDB()
        except ValueError as e:
            logger.error(f"Vector database not configured: {e}")
            raise HTTPException(status_code=500, detail=f"Vector database configuration error: {str(e)}")
    return _vector_db


def reset_vector_db():
    """Reset the vector database singleton."""
    global _vector_db
    if _vector_db is not None:
        try:
            if hasattr(_vector_db.client, "close"):
                _vector_db.client.close()
        except (PostgrestAPIError, StorageException) as e:
            logger.warning(f"Error closing Vector Supabase client: {e}")
    _vector_db = None


__all__ = [
    "SupabaseVectorDB",
    "get_vector_db",
    "reset_vector_db",
]
