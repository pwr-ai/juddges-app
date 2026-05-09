"""
Embedding generation script for judgments.

Generates document-level embeddings for the judgments table using
the configured embedding provider (default: BAAI/bge-m3 at 1024d).

The embedding is generated from the first ~8000 characters of full_text
(approximately 2000 tokens), which captures the most important content
(header, parties, key holdings) for document-level retrieval.

Usage:
    python -m app.ingestion.embed_documents --batch-size 100 --limit 1000
    python -m app.ingestion.embed_documents --dry-run  # Preview without changes
"""

import argparse
import asyncio
import time

from loguru import logger
from supabase import Client

from app.core.supabase import get_supabase_client
from app.embedding_providers import get_default_model_id, get_embedding_provider

DEFAULT_BATCH_SIZE = 100
MAX_RETRIES = 3
RETRY_DELAY = 2.0  # seconds

# Truncate full_text to this many characters for document-level embedding.
# ~8000 chars ≈ 2000 tokens for English, ~1250 tokens for Polish.
# This captures the judgment header, parties, and key holdings.
DOC_EMBEDDING_MAX_CHARS = 8000

# Maximum texts per embedding API call
API_SUB_BATCH_SIZE = 100


class EmbeddingGenerator:
    """Generates embeddings for judgments stored in the judgments table."""

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
        self.stats = {
            "total_processed": 0,
            "successful": 0,
            "failed": 0,
            "skipped": 0,
        }

    async def generate_batch_embeddings(
        self, texts: list[str]
    ) -> list[list[float] | None]:
        """Generate embeddings for a batch of texts.

        Automatically splits into sub-batches of API_SUB_BATCH_SIZE.
        """
        # Filter out empty texts but keep track of positions
        valid_indices = []
        valid_texts = []
        for i, text in enumerate(texts):
            if text and len(text.strip()) > 0:
                valid_indices.append(i)
                valid_texts.append(text)

        if not valid_texts:
            return [None] * len(texts)

        results: list[list[float] | None] = [None] * len(texts)

        # Process in sub-batches
        for start in range(0, len(valid_texts), API_SUB_BATCH_SIZE):
            sub_texts = valid_texts[start : start + API_SUB_BATCH_SIZE]
            sub_indices = valid_indices[start : start + API_SUB_BATCH_SIZE]

            for attempt in range(MAX_RETRIES):
                try:
                    embeddings = await self.provider.embed_texts(sub_texts)
                    for j, emb in enumerate(embeddings):
                        results[sub_indices[j]] = emb
                    break
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

        return results

    def get_judgments_without_embeddings(
        self, limit: int | None = None, offset: int = 0
    ) -> list[dict]:
        """Fetch judgments that don't have embeddings yet."""
        query = (
            self.supabase.table("judgments")
            .select("id, case_number, jurisdiction, full_text")
            .is_("embedding", "null")
            .order("created_at")
            .range(offset, offset + (limit or 10000) - 1)
        )

        response = query.execute()
        return response.data if response.data else []

    def get_total_judgments_without_embeddings(self) -> int:
        """Get count of judgments without embeddings."""
        response = (
            self.supabase.table("judgments")
            .select("id", count="exact")
            .is_("embedding", "null")
            .execute()
        )
        return response.count or 0

    def update_judgment_embedding(
        self,
        judgment_id: str,
        embedding: list[float],
    ) -> bool:
        """Update a judgment with its embedding."""
        if self.dry_run:
            return True

        try:
            self.supabase.table("judgments").update({"embedding": embedding}).eq(
                "id", judgment_id
            ).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to update judgment {judgment_id}: {e}")
            return False

    async def process_batch(self, judgments: list[dict]) -> int:
        """Process a batch of judgments and return number of successful updates."""
        if not judgments:
            return 0

        # Truncate full_text to DOC_EMBEDDING_MAX_CHARS for document-level embedding
        texts = [
            (doc.get("full_text", "") or "")[:DOC_EMBEDDING_MAX_CHARS]
            for doc in judgments
        ]

        # Generate embeddings
        embeddings = await self.generate_batch_embeddings(texts)

        # Update judgments
        successful = 0
        for i, doc in enumerate(judgments):
            embedding = embeddings[i]

            if embedding is None:
                self.stats["failed"] += 1
                logger.warning(
                    f"No embedding generated for judgment {doc['id']} "
                    f"({doc.get('case_number', 'unknown')})"
                )
                continue

            if self.update_judgment_embedding(doc["id"], embedding):
                successful += 1
                self.stats["successful"] += 1
            else:
                self.stats["failed"] += 1

        return successful

    async def run(self, limit: int | None = None) -> dict:
        """Run the embedding generation process."""
        total_without_embeddings = self.get_total_judgments_without_embeddings()
        logger.info(f"Total judgments without embeddings: {total_without_embeddings}")

        if limit:
            logger.info(f"Processing limit: {limit} judgments")
            total_to_process = min(limit, total_without_embeddings)
        else:
            total_to_process = total_without_embeddings

        if total_to_process == 0:
            logger.info("No judgments to process")
            return self.stats

        try:
            import sentry_sdk

            sentry_sdk.add_breadcrumb(
                category="ingestion",
                message="embed_documents run started",
                data={
                    "total": total_to_process,
                    "batch_size": self.batch_size,
                    "dry_run": self.dry_run,
                },
                level="info",
            )
        except Exception as e:
            logger.warning(f"Failed to record ingestion telemetry breadcrumb: {e}")

        logger.info(f"Starting embedding generation for {total_to_process} judgments")
        logger.info(f"Batch size: {self.batch_size}")
        logger.info(
            f"Model: {self.provider.config.model_name} ({self.provider.config.dimensions}d)"
        )
        logger.info(f"Max chars per doc: {DOC_EMBEDDING_MAX_CHARS}")
        logger.info(f"Dry run: {self.dry_run}")

        start_time = time.time()

        while self.stats["total_processed"] < total_to_process:
            batch_limit = min(
                self.batch_size, total_to_process - self.stats["total_processed"]
            )
            # Always offset=0 because processed docs no longer have null embedding
            judgments = self.get_judgments_without_embeddings(
                limit=batch_limit, offset=0
            )

            if not judgments:
                logger.info("No more judgments to process")
                break

            await self.process_batch(judgments)
            self.stats["total_processed"] += len(judgments)

            elapsed = time.time() - start_time
            rate = self.stats["total_processed"] / elapsed if elapsed > 0 else 0
            logger.info(
                f"Progress: {self.stats['total_processed']}/{total_to_process} "
                f"({self.stats['total_processed'] / total_to_process * 100:.1f}%) | "
                f"Rate: {rate:.1f} docs/sec"
            )

        elapsed = time.time() - start_time
        logger.info(f"Embedding generation completed in {elapsed:.1f} seconds")
        logger.info(f"Final stats: {self.stats}")

        return self.stats


async def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(description="Generate embeddings for judgments")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Number of judgments to process per batch (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of judgments to process (default: all)",
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

    model_id = get_default_model_id()
    logger.info(f"Using embedding model: {model_id}")

    # Run embedding generation
    generator = EmbeddingGenerator(
        supabase_client=supabase_client,
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
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
