"""
Document chunking script for judgments.

Splits judgments into overlapping text chunks and generates embeddings for each.
Chunks are stored in the document_chunks table for fine-grained semantic search.

Chunking strategy:
- Target chunk size: 400 tokens (~300-500 words)
- Overlap: 100 tokens to maintain context continuity
- Key sections (Uzasadnienie, Sentencja, Judgment, etc.) are marked for prioritized retrieval
- Language is derived from jurisdiction: PL → "pl", UK → "en"

Usage:
    python -m app.ingestion.chunk_documents --batch-size 50 --limit 1000
    python -m app.ingestion.chunk_documents --dry-run
"""

import argparse
import asyncio
import re
import time

import tiktoken
from loguru import logger
from supabase import Client

from app.core.supabase import get_supabase_client
from app.embedding_providers import get_default_model_id, get_embedding_provider

DEFAULT_BATCH_SIZE = 50
MAX_RETRIES = 3
RETRY_DELAY = 2.0

# Chunking parameters
TARGET_CHUNK_SIZE = 400  # tokens
CHUNK_OVERLAP = 100  # tokens
MIN_CHUNK_SIZE = 50  # minimum tokens to create a chunk

# Maximum chunks to embed in a single API call
EMBEDDING_BATCH_SIZE = 200

# Polish legal document section patterns
POLISH_SECTION_PATTERNS = [
    (r"(?i)^(UZASADNIENIE|Uzasadnienie)[\s:]*$", "Uzasadnienie", True),
    (r"(?i)^(SENTENCJA|Sentencja)[\s:]*$", "Sentencja", True),
    (r"(?i)^(WYROK|Wyrok)[\s:]*$", "Wyrok", True),
    (r"(?i)^(POSTANOWIENIE|Postanowienie)[\s:]*$", "Postanowienie", True),
    (r"(?i)^(STAN FAKTYCZNY|Stan faktyczny)[\s:]*$", "Stan faktyczny", True),
    (r"(?i)^(PODSTAWA PRAWNA|Podstawa prawna)[\s:]*$", "Podstawa prawna", True),
    (r"(?i)^(WNIOSKI|Wnioski)[\s:]*$", "Wnioski", True),
    (r"(?i)^(KONKLUZJA|Konkluzja)[\s:]*$", "Konkluzja", True),
]

# UK legal document section patterns
UK_SECTION_PATTERNS = [
    (r"(?i)^(JUDGMENT|Judgment)[\s:]*$", "Judgment", True),
    (r"(?i)^(INTRODUCTION|Introduction)[\s:]*$", "Introduction", True),
    (r"(?i)^(BACKGROUND|Background)[\s:]*$", "Background", True),
    (r"(?i)^(ANALYSIS|Analysis)[\s:]*$", "Analysis", True),
    (r"(?i)^(CONCLUSION|Conclusion)[\s:]*$", "Conclusion", True),
    (r"(?i)^(DECISION|Decision)[\s:]*$", "Decision", True),
    (r"(?i)^(HELD|Held)[\s:]*$", "Held", True),
    (r"(?i)^(RATIO DECIDENDI|Ratio decidendi)[\s:]*$", "Ratio Decidendi", True),
]

# Map jurisdiction codes to language codes
JURISDICTION_TO_LANGUAGE = {
    "PL": "pl",
    "UK": "en",
}


class DocumentChunker:
    """Chunks judgments and generates embeddings for each chunk."""

    def __init__(
        self,
        supabase_client: Client,
        batch_size: int = DEFAULT_BATCH_SIZE,
        dry_run: bool = False,
    ):
        self.supabase = supabase_client
        self.provider = get_embedding_provider()
        self.batch_size = batch_size
        self.dry_run = dry_run
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.stats = {
            "documents_processed": 0,
            "chunks_created": 0,
            "failed": 0,
        }

    def count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken."""
        return len(self.tokenizer.encode(text))

    def detect_section(
        self, line: str, language: str = "pl"
    ) -> tuple[str | None, bool]:
        """
        Detect if a line is a section header.
        Returns (section_title, is_key_section) or (None, False).
        """
        patterns = POLISH_SECTION_PATTERNS if language == "pl" else UK_SECTION_PATTERNS

        for pattern, section_name, is_key in patterns:
            if re.match(pattern, line.strip()):
                return section_name, is_key

        return None, False

    def chunk_document(
        self, text: str, document_id: str, language: str = "pl"
    ) -> list[dict]:
        """
        Chunk a document into overlapping segments.

        Returns list of chunk dictionaries ready for database insertion.
        """
        if not text or len(text.strip()) == 0:
            return []

        chunks = []
        lines = text.split("\n")

        current_chunk: list[str] = []
        current_tokens = 0
        current_section: str | None = None
        is_current_key = False
        chunk_index = 0

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Check for section headers
            section_name, is_key = self.detect_section(line, language)
            if section_name:
                # Save current chunk before starting new section
                if current_chunk and current_tokens >= MIN_CHUNK_SIZE:
                    chunk_text = " ".join(current_chunk)
                    chunks.append(
                        {
                            "document_id": document_id,
                            "chunk_index": chunk_index,
                            "chunk_text": chunk_text,
                            "chunk_type": "section"
                            if current_section
                            else "paragraph_block",
                            "section_title": current_section,
                            "is_key_section": is_current_key,
                            "token_count": current_tokens,
                            "relevance_weight": 1.5 if is_current_key else 1.0,
                            "language": language,
                        }
                    )
                    chunk_index += 1

                # Start new section
                current_section = section_name
                is_current_key = is_key
                current_chunk = [line]
                current_tokens = self.count_tokens(line)
                continue

            line_tokens = self.count_tokens(line)

            # Check if adding this line exceeds target size
            if current_tokens + line_tokens > TARGET_CHUNK_SIZE and current_chunk:
                # Save current chunk
                chunk_text = " ".join(current_chunk)
                chunks.append(
                    {
                        "document_id": document_id,
                        "chunk_index": chunk_index,
                        "chunk_text": chunk_text,
                        "chunk_type": "section"
                        if current_section
                        else "paragraph_block",
                        "section_title": current_section,
                        "is_key_section": is_current_key,
                        "token_count": current_tokens,
                        "relevance_weight": 1.5 if is_current_key else 1.0,
                        "language": language,
                    }
                )
                chunk_index += 1

                # Start new chunk with overlap
                # Take last few lines that fit within overlap window
                overlap_lines: list[str] = []
                overlap_tokens = 0
                for prev_line in reversed(current_chunk):
                    prev_tokens = self.count_tokens(prev_line)
                    if overlap_tokens + prev_tokens <= CHUNK_OVERLAP:
                        overlap_lines.insert(0, prev_line)
                        overlap_tokens += prev_tokens
                    else:
                        break

                current_chunk = [*overlap_lines, line]
                current_tokens = overlap_tokens + line_tokens
            else:
                current_chunk.append(line)
                current_tokens += line_tokens

        # Don't forget the last chunk
        if current_chunk and current_tokens >= MIN_CHUNK_SIZE:
            chunk_text = " ".join(current_chunk)
            chunks.append(
                {
                    "document_id": document_id,
                    "chunk_index": chunk_index,
                    "chunk_text": chunk_text,
                    "chunk_type": "section" if current_section else "paragraph_block",
                    "section_title": current_section,
                    "is_key_section": is_current_key,
                    "token_count": current_tokens,
                    "relevance_weight": 1.5 if is_current_key else 1.0,
                    "language": language,
                }
            )

        return chunks

    async def generate_chunk_embeddings(
        self, chunks: list[dict]
    ) -> list[list[float] | None]:
        """Generate embeddings for a batch of chunks."""
        if not chunks:
            return []

        texts = [chunk["chunk_text"] for chunk in chunks]

        # Split into sub-batches if needed
        all_embeddings: list[list[float] | None] = [None] * len(texts)
        for start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
            batch_texts = texts[start : start + EMBEDDING_BATCH_SIZE]

            for attempt in range(MAX_RETRIES):
                try:
                    embeddings = await self.provider.embed_texts(batch_texts)
                    for j, emb in enumerate(embeddings):
                        all_embeddings[start + j] = emb
                    break
                except Exception as e:
                    if attempt < MAX_RETRIES - 1:
                        logger.warning(
                            f"Chunk embedding failed (attempt {attempt + 1}): {e}"
                        )
                        await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                    else:
                        logger.error(f"Chunk embedding failed: {e}")

        return all_embeddings

    def _get_existing_chunk_doc_ids(self) -> set[str]:
        """Get set of document IDs that already have chunks."""
        try:
            # Supabase PostgREST returns max 1000 rows by default.
            # Paginate to get ALL existing chunk document_ids.
            all_ids: set[str] = set()
            page_size = 1000
            offset = 0
            while True:
                resp = (
                    self.supabase.table("document_chunks")
                    .select("document_id")
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                rows = resp.data or []
                for row in rows:
                    all_ids.add(row["document_id"])
                if len(rows) < page_size:
                    break
                offset += page_size
            return all_ids
        except Exception:
            return set()

    def get_judgments_without_chunks(
        self, limit: int = 50, existing_doc_ids: set[str] | None = None
    ) -> list[dict]:
        """Fetch judgments that don't have chunks yet.

        Scans through the judgments table in pages, skipping those that
        already have chunks, until `limit` unchunked judgments are found.
        """
        if existing_doc_ids is None:
            existing_doc_ids = self._get_existing_chunk_doc_ids()

        needed: list[dict] = []
        scan_offset = 0
        # Fetch larger pages (IDs only) to efficiently skip chunked docs
        scan_page = max(limit * 3, 500)

        while len(needed) < limit:
            # First fetch just IDs to avoid transferring full_text unnecessarily
            id_resp = (
                self.supabase.table("judgments")
                .select("id")
                .order("created_at")
                .range(scan_offset, scan_offset + scan_page - 1)
                .execute()
            )
            id_rows = id_resp.data or []
            if not id_rows:
                break  # No more judgments in the table

            # Filter to IDs that don't have chunks
            unchunked_ids = [
                r["id"] for r in id_rows if r["id"] not in existing_doc_ids
            ]
            scan_offset += scan_page

            if not unchunked_ids:
                continue  # This page was all chunked, scan further

            # Fetch full data for only the unchunked IDs we need
            batch_ids = unchunked_ids[: limit - len(needed)]
            for i in range(0, len(batch_ids), 50):
                sub_ids = batch_ids[i : i + 50]
                data_resp = (
                    self.supabase.table("judgments")
                    .select("id, case_number, jurisdiction, full_text")
                    .in_("id", sub_ids)
                    .execute()
                )
                needed.extend(data_resp.data or [])

        return needed[:limit]

    def save_chunks(self, chunks: list[dict]) -> int:
        """Save chunks to database. Returns number of successful inserts."""
        if self.dry_run or not chunks:
            return len(chunks)

        try:
            # Prepare chunks for insertion
            insert_data = []
            for chunk in chunks:
                data = {
                    "document_id": chunk["document_id"],
                    "chunk_index": chunk["chunk_index"],
                    "chunk_text": chunk["chunk_text"],
                    "chunk_type": chunk["chunk_type"],
                    "section_title": chunk.get("section_title"),
                    "is_key_section": chunk.get("is_key_section", False),
                    "token_count": chunk.get("token_count"),
                    "relevance_weight": chunk.get("relevance_weight", 1.0),
                    "language": chunk.get("language"),
                }
                if chunk.get("embedding"):
                    data["embedding"] = chunk["embedding"]
                insert_data.append(data)

            # Insert in batches of 500 to stay within Supabase limits
            for i in range(0, len(insert_data), 500):
                batch = insert_data[i : i + 500]
                self.supabase.table("document_chunks").insert(batch).execute()

            return len(chunks)
        except Exception as e:
            logger.error(f"Failed to save chunks: {e}")
            return 0

    async def process_document(self, judgment: dict) -> int:
        """Process a single judgment: chunk and embed. Returns chunk count."""
        judgment_id = judgment["id"]
        full_text = judgment.get("full_text", "")
        jurisdiction = judgment.get("jurisdiction", "PL")
        language = JURISDICTION_TO_LANGUAGE.get(jurisdiction, "pl")

        if not full_text:
            logger.warning(
                f"Judgment {judgment_id} ({judgment.get('case_number', 'unknown')}) has no text"
            )
            return 0

        # Chunk the document
        chunks = self.chunk_document(full_text, judgment_id, language)

        if not chunks:
            logger.warning(
                f"No chunks generated for judgment {judgment_id} "
                f"({judgment.get('case_number', 'unknown')})"
            )
            return 0

        # Generate embeddings for chunks
        embeddings = await self.generate_chunk_embeddings(chunks)

        # Add embeddings to chunks
        for i, chunk in enumerate(chunks):
            chunk["embedding"] = embeddings[i]

        # Save chunks
        saved = self.save_chunks(chunks)
        self.stats["chunks_created"] += saved

        return saved

    async def process_batch(self, judgments: list[dict]) -> int:
        """Process a batch of judgments."""
        total_chunks = 0
        for judgment in judgments:
            try:
                chunks = await self.process_document(judgment)
                total_chunks += chunks
                self.stats["documents_processed"] += 1
            except Exception as e:
                logger.error(
                    f"Failed to process judgment {judgment['id']} "
                    f"({judgment.get('case_number', 'unknown')}): {e}"
                )
                self.stats["failed"] += 1
        return total_chunks

    async def run(self, limit: int | None = None) -> dict:
        """Run the chunking process."""
        logger.info("Fetching judgments without chunks...")

        start_time = time.time()
        # Fetch existing chunk doc IDs once, then track incrementally
        existing_ids = self._get_existing_chunk_doc_ids()
        logger.info(
            f"Found {len(existing_ids)} judgments already chunked, skipping them"
        )

        while True:
            remaining = (
                limit - self.stats["documents_processed"] if limit else self.batch_size
            )
            if limit and remaining <= 0:
                break
            batch_limit = min(self.batch_size, remaining)
            judgments = self.get_judgments_without_chunks(
                limit=batch_limit,
                existing_doc_ids=existing_ids,
            )

            if not judgments:
                logger.info("No more judgments to process")
                break

            await self.process_batch(judgments)

            # Track newly processed IDs so we don't re-fetch them
            for j in judgments:
                existing_ids.add(j["id"])

            elapsed = time.time() - start_time
            rate = self.stats["documents_processed"] / elapsed if elapsed > 0 else 0

            logger.info(
                f"Progress: {self.stats['documents_processed']} docs, "
                f"{self.stats['chunks_created']} chunks | "
                f"Rate: {rate:.1f} docs/sec"
            )

        elapsed = time.time() - start_time
        logger.info(f"Chunking completed in {elapsed:.1f} seconds")
        logger.info(f"Final stats: {self.stats}")

        return self.stats


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Chunk judgments and generate chunk embeddings"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Judgments per batch (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum judgments to process (default: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview without making changes",
    )
    args = parser.parse_args()

    # Initialize clients
    supabase_client = get_supabase_client()
    if not supabase_client:
        logger.error("Failed to initialize Supabase client")
        return

    model_id = get_default_model_id()
    logger.info(f"Using embedding model: {model_id}")

    # Run chunker
    chunker = DocumentChunker(
        supabase_client=supabase_client,
        batch_size=args.batch_size,
        dry_run=args.dry_run,
    )

    stats = await chunker.run(limit=args.limit)

    # Print summary
    print("\n" + "=" * 50)
    print("DOCUMENT CHUNKING SUMMARY")
    print("=" * 50)
    print(f"Judgments processed: {stats['documents_processed']}")
    print(f"Chunks created:      {stats['chunks_created']}")
    print(f"Failed:              {stats['failed']}")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
