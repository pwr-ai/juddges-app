"""
Embedding generation script for legal documents.

This script generates embeddings for documents stored in the legal_documents table
using OpenAI's text-embedding-3-small model (1536 dimensions).

Usage:
    python -m backend.app.ingestion.embed_documents --batch-size 100 --limit 1000
    python -m backend.app.ingestion.embed_documents --dry-run  # Preview without changes
"""

import argparse
import asyncio
import os
import time

from backend.app.core.supabase import get_supabase_client
from loguru import logger
from openai import AsyncOpenAI
from supabase import Client

# Configuration — dimensions must match DB schema (vector(768))
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = int(os.getenv("EMBEDDING_DIMENSION", "768"))
DEFAULT_BATCH_SIZE = 100
MAX_RETRIES = 3
RETRY_DELAY = 2.0  # seconds


class EmbeddingGenerator:
    """Generates embeddings for legal documents."""

    def __init__(
        self,
        supabase_client: Client,
        openai_client: AsyncOpenAI,
        batch_size: int = DEFAULT_BATCH_SIZE,
        dry_run: bool = False,
    ):
        self.supabase = supabase_client
        self.openai = openai_client
        self.batch_size = batch_size
        self.dry_run = dry_run
        self.stats = {
            "total_processed": 0,
            "successful": 0,
            "failed": 0,
            "skipped": 0,
            "tokens_used": 0,
        }

    async def generate_embedding(self, text: str) -> list[float] | None:
        """Generate embedding for a single text using OpenAI API."""
        if not text or len(text.strip()) == 0:
            return None

        for attempt in range(MAX_RETRIES):
            try:
                response = await self.openai.embeddings.create(
                    input=text,
                    model=EMBEDDING_MODEL,
                    dimensions=EMBEDDING_DIMENSIONS,
                )
                self.stats["tokens_used"] += response.usage.total_tokens
                return response.data[0].embedding
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    logger.warning(
                        f"Embedding generation failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}"
                    )
                    await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                else:
                    logger.error(
                        f"Embedding generation failed after {MAX_RETRIES} attempts: {e}"
                    )
                    return None
        return None

    async def generate_batch_embeddings(
        self, texts: list[str]
    ) -> list[list[float] | None]:
        """Generate embeddings for a batch of texts."""
        # Filter out empty texts but keep track of positions
        valid_indices = []
        valid_texts = []
        for i, text in enumerate(texts):
            if text and len(text.strip()) > 0:
                valid_indices.append(i)
                valid_texts.append(text)

        if not valid_texts:
            return [None] * len(texts)

        for attempt in range(MAX_RETRIES):
            try:
                response = await self.openai.embeddings.create(
                    input=valid_texts,
                    model=EMBEDDING_MODEL,
                    dimensions=EMBEDDING_DIMENSIONS,
                )
                self.stats["tokens_used"] += response.usage.total_tokens

                # Map embeddings back to original positions
                results = [None] * len(texts)
                for i, embedding_obj in enumerate(response.data):
                    original_idx = valid_indices[i]
                    results[original_idx] = embedding_obj.embedding

                return results
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    logger.warning(
                        f"Batch embedding failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}"
                    )
                    await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                else:
                    logger.error(
                        f"Batch embedding failed after {MAX_RETRIES} attempts: {e}"
                    )
                    return [None] * len(texts)
        return None

    def get_documents_without_embeddings(
        self, limit: int | None = None, offset: int = 0
    ) -> list[dict]:
        """Fetch documents that don't have embeddings yet."""
        query = (
            self.supabase.table("legal_documents")
            .select("supabase_document_id, document_id, full_text, summary")
            .is_("embedding", "null")
            .order("supabase_document_id")
            .range(offset, offset + (limit or 10000) - 1)
        )

        response = query.execute()
        return response.data if response.data else []

    def get_total_documents_without_embeddings(self) -> int:
        """Get count of documents without embeddings."""
        response = (
            self.supabase.table("legal_documents")
            .select("supabase_document_id", count="exact")
            .is_("embedding", "null")
            .execute()
        )
        return response.count or 0

    def update_document_embedding(
        self,
        supabase_document_id: int,
        embedding: list[float],
        summary_embedding: list[float] | None = None,
    ) -> bool:
        """Update a document with its embedding."""
        if self.dry_run:
            return True

        try:
            update_data = {"embedding": embedding}
            if summary_embedding:
                update_data["summary_embedding"] = summary_embedding

            self.supabase.table("legal_documents").update(update_data).eq(
                "supabase_document_id", supabase_document_id
            ).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to update document {supabase_document_id}: {e}")
            return False

    async def process_batch(self, documents: list[dict]) -> int:
        """Process a batch of documents and return number of successful updates."""
        if not documents:
            return 0

        # Extract texts for embedding
        full_texts = [doc.get("full_text", "") or "" for doc in documents]
        summaries = [doc.get("summary", "") or "" for doc in documents]

        # Generate embeddings
        full_text_embeddings = await self.generate_batch_embeddings(full_texts)
        summary_embeddings = await self.generate_batch_embeddings(summaries)

        # Update documents
        successful = 0
        for i, doc in enumerate(documents):
            embedding = full_text_embeddings[i]
            summary_embedding = summary_embeddings[i]

            if embedding is None:
                self.stats["failed"] += 1
                logger.warning(
                    f"No embedding generated for document {doc['supabase_document_id']}"
                )
                continue

            if self.update_document_embedding(
                doc["supabase_document_id"],
                embedding,
                summary_embedding,
            ):
                successful += 1
                self.stats["successful"] += 1
            else:
                self.stats["failed"] += 1

        return successful

    async def run(self, limit: int | None = None) -> dict:
        """Run the embedding generation process."""
        total_without_embeddings = self.get_total_documents_without_embeddings()
        logger.info(f"Total documents without embeddings: {total_without_embeddings}")

        if limit:
            logger.info(f"Processing limit: {limit} documents")
            total_to_process = min(limit, total_without_embeddings)
        else:
            total_to_process = total_without_embeddings

        if total_to_process == 0:
            logger.info("No documents to process")
            return self.stats

        logger.info(f"Starting embedding generation for {total_to_process} documents")
        logger.info(f"Batch size: {self.batch_size}")
        logger.info(f"Dry run: {self.dry_run}")

        start_time = time.time()
        offset = 0

        while offset < total_to_process:
            batch_limit = min(self.batch_size, total_to_process - offset)
            documents = self.get_documents_without_embeddings(
                limit=batch_limit, offset=0
            )

            if not documents:
                logger.info("No more documents to process")
                break

            await self.process_batch(documents)
            self.stats["total_processed"] += len(documents)

            elapsed = time.time() - start_time
            rate = self.stats["total_processed"] / elapsed if elapsed > 0 else 0
            logger.info(
                f"Progress: {self.stats['total_processed']}/{total_to_process} "
                f"({self.stats['total_processed'] / total_to_process * 100:.1f}%) | "
                f"Rate: {rate:.1f} docs/sec | "
                f"Tokens: {self.stats['tokens_used']:,}"
            )

            # For dry run, use offset increment; for real run, newly embedded docs are filtered out
            if self.dry_run:
                offset += batch_limit

        elapsed = time.time() - start_time
        logger.info(f"Embedding generation completed in {elapsed:.1f} seconds")
        logger.info(f"Final stats: {self.stats}")

        return self.stats


async def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Generate embeddings for legal documents"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Number of documents to process per batch (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of documents to process (default: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be done without making changes",
    )
    args = parser.parse_args()

    # Initialize clients
    supabase_client = get_supabase_client()
    if not supabase_client:
        logger.error("Failed to initialize Supabase client")
        return

    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        logger.error("OPENAI_API_KEY environment variable not set")
        return

    openai_client = AsyncOpenAI(api_key=openai_api_key)

    # Run embedding generation
    generator = EmbeddingGenerator(
        supabase_client=supabase_client,
        openai_client=openai_client,
        batch_size=args.batch_size,
        dry_run=args.dry_run,
    )

    stats = await generator.run(limit=args.limit)

    # Print summary
    print("\n" + "=" * 50)
    print("EMBEDDING GENERATION SUMMARY")
    print("=" * 50)
    print(f"Total processed:  {stats['total_processed']}")
    print(f"Successful:       {stats['successful']}")
    print(f"Failed:           {stats['failed']}")
    print(f"Skipped:          {stats['skipped']}")
    print(f"Tokens used:      {stats['tokens_used']:,}")

    # Estimate cost (OpenAI text-embedding-3-small: $0.02 per 1M tokens)
    estimated_cost = stats["tokens_used"] / 1_000_000 * 0.02
    print(f"Estimated cost:   ${estimated_cost:.4f}")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
