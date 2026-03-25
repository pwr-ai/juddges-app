#!/usr/bin/env python3
"""
Parallel re-embedding using dual GPUs (3:1 split RTX 3090 : A4000).

Phase 1: Re-embed judgments from title+summary (compact, no truncation)
Phase 2: Embed all document_chunks across both GPUs

Uses streaming pagination to stay under 80GB RAM.

Usage:
    python scripts/reembed_parallel.py                    # Both phases
    python scripts/reembed_parallel.py --phase judgments   # Only judgments
    python scripts/reembed_parallel.py --phase chunks      # Only chunks
"""

import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

import requests
from dotenv import load_dotenv
from supabase import Client, create_client
from tqdm import tqdm

load_dotenv()

EXPECTED_DIM = 1024

# GPU endpoints: 3:1 ratio means 3090 gets 75% of work, A4000 gets 25%
GPU_3090_URL = "http://localhost:9081"  # RTX 3090 (24GB) - primary
GPU_A4000_URL = "http://localhost:9080"  # RTX A4000 (16GB) - secondary

# Batch sizes tuned per GPU memory
BATCH_3090 = 16  # Larger batches on 24GB GPU
BATCH_A4000 = 8  # Smaller batches on 16GB GPU

# Pagination: smaller pages to avoid Supabase response truncation on large chunk_text
PAGE_SIZE = 500

db_lock = Lock()


def vector_to_pg_format(vector: list[float]) -> str:
    return "[" + ",".join(map(str, vector)) + "]"


def embed_batch(texts: list[str], tei_url: str) -> list[list[float] | None]:
    """Embed a batch via TEI /embed endpoint."""
    truncated = [t[:32000] for t in texts]
    try:
        resp = requests.post(
            f"{tei_url}/embed",
            json={"inputs": truncated, "truncate": True},
            timeout=120,
        )
        resp.raise_for_status()
        vectors = resp.json()
        return [v if len(v) == EXPECTED_DIM else None for v in vectors]
    except Exception as e:
        print(f"\n  Embed error ({tei_url}): {e}")
        return [None] * len(texts)


def save_judgment_embedding(sb: Client, judgment_id: str, vector: list[float]) -> bool:
    """Save judgment embedding via RPC."""
    try:
        pg_vec = vector_to_pg_format(vector)
        with db_lock:
            sb.rpc(
                "update_judgment_embedding",
                {"judgment_id": judgment_id, "embedding_text": pg_vec},
            ).execute()
        return True
    except Exception as e:
        print(f"\n  DB error (judgment {judgment_id}): {e}")
        return False


def save_chunk_embedding(sb: Client, chunk_id: str, vector: list[float]) -> bool:
    """Save chunk embedding via direct update with vector cast."""
    try:
        pg_vec = vector_to_pg_format(vector)
        with db_lock:
            sb.table("document_chunks").update(
                {"embedding": pg_vec}
            ).eq("id", chunk_id).execute()
        return True
    except Exception as e:
        print(f"\n  DB error (chunk {chunk_id}): {e}")
        return False


def process_batch_on_gpu(
    items: list[dict],
    text_fn,
    save_fn,
    sb: Client,
    tei_url: str,
    batch_size: int,
) -> tuple[int, int]:
    """Process a list of items on a specific GPU. Returns (updated, failed)."""
    updated = 0
    failed = 0

    for i in range(0, len(items), batch_size):
        batch = items[i : i + batch_size]
        texts = [text_fn(item) for item in batch]
        vectors = embed_batch(texts, tei_url)

        for item, vec in zip(batch, vectors):
            if vec and len(vec) == EXPECTED_DIM:
                if save_fn(sb, item["id"], vec):
                    updated += 1
                else:
                    failed += 1
            else:
                failed += 1

    return updated, failed


def phase_judgments(sb: Client):
    """Phase 1: Re-embed judgments from title + summary."""
    print("\n" + "=" * 60)
    print("Phase 1: Re-embed judgments (title + summary)")
    print("=" * 60)

    # Fetch all judgments (only need id, title, summary - light on RAM)
    all_judgments = []
    offset = 0
    while True:
        result = (
            sb.table("judgments")
            .select("id,title,summary")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        all_judgments.extend(result.data)
        if len(result.data) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    print(f"Total judgments: {len(all_judgments)}")

    def text_fn(j):
        parts = []
        if j.get("title"):
            parts.append(j["title"])
        if j.get("summary"):
            parts.append(j["summary"])
        return " ".join(parts) if parts else "empty"

    # Split 3:1 between GPUs
    split_idx = int(len(all_judgments) * 0.75)
    batch_3090 = all_judgments[:split_idx]
    batch_a4000 = all_judgments[split_idx:]

    print(f"  RTX 3090: {len(batch_3090)} judgments")
    print(f"  RTX A4000: {len(batch_a4000)} judgments")

    start = time.time()
    total_updated = 0
    total_failed = 0

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(
                process_batch_on_gpu,
                batch_3090, text_fn, save_judgment_embedding, sb,
                GPU_3090_URL, BATCH_3090,
            ): "3090",
            executor.submit(
                process_batch_on_gpu,
                batch_a4000, text_fn, save_judgment_embedding, sb,
                GPU_A4000_URL, BATCH_A4000,
            ): "A4000",
        }

        for future in as_completed(futures):
            gpu = futures[future]
            updated, failed = future.result()
            total_updated += updated
            total_failed += failed
            print(f"  {gpu}: {updated} updated, {failed} failed")

    elapsed = time.time() - start
    print(f"\nPhase 1 done in {elapsed:.0f}s: {total_updated} updated, {total_failed} failed")


def phase_chunks(sb: Client):
    """Phase 2: Embed all document_chunks across both GPUs."""
    print("\n" + "=" * 60)
    print("Phase 2: Embed document_chunks (329K)")
    print("=" * 60)

    # Count total chunks needing embedding
    count_result = (
        sb.table("document_chunks")
        .select("id", count="exact")
        .is_("embedding", "null")
        .execute()
    )
    total_to_embed = count_result.count
    print(f"Chunks to embed: {total_to_embed}")

    def text_fn(chunk):
        return chunk.get("chunk_text", "") or "empty"

    start = time.time()
    total_updated = 0
    total_failed = 0
    pages_processed = 0

    # Stream pages to stay under RAM limit
    pbar = tqdm(total=total_to_embed, desc="Chunks", unit="chunk")

    consecutive_errors = 0
    while True:
        # Fetch a page of chunks without embeddings
        # Use smaller page + retry to handle Supabase response truncation
        try:
            result = (
                sb.table("document_chunks")
                .select("id,chunk_text")
                .is_("embedding", "null")
                .limit(PAGE_SIZE)
                .execute()
            )
            consecutive_errors = 0
        except Exception as e:
            consecutive_errors += 1
            print(f"\n  Page fetch error ({consecutive_errors}): {e}")
            if consecutive_errors >= 5:
                print("  Too many consecutive fetch errors, stopping.")
                break
            import time as _time
            _time.sleep(2)
            continue

        if not result.data:
            break

        page = result.data
        pages_processed += 1

        # Split 3:1
        split_idx = int(len(page) * 0.75)
        batch_3090 = page[:split_idx]
        batch_a4000 = page[split_idx:]

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {
                executor.submit(
                    process_batch_on_gpu,
                    batch_3090, text_fn, save_chunk_embedding, sb,
                    GPU_3090_URL, BATCH_3090,
                ): "3090",
                executor.submit(
                    process_batch_on_gpu,
                    batch_a4000, text_fn, save_chunk_embedding, sb,
                    GPU_A4000_URL, BATCH_A4000,
                ): "A4000",
                }

            for future in as_completed(futures):
                updated, failed = future.result()
                total_updated += updated
                total_failed += failed
                pbar.update(updated + failed)

        # Free memory
        del page, batch_3090, batch_a4000

        # Progress every 10 pages
        if pages_processed % 10 == 0:
            elapsed = time.time() - start
            rate = total_updated / elapsed if elapsed > 0 else 0
            print(f"\n  Progress: {total_updated}/{total_to_embed} ({rate:.0f} chunks/sec)")

    pbar.close()
    elapsed = time.time() - start
    rate = total_updated / elapsed if elapsed > 0 else 0
    print(f"\nPhase 2 done in {elapsed:.0f}s ({rate:.1f} chunks/sec)")
    print(f"  Updated: {total_updated}")
    print(f"  Failed:  {total_failed}")


def main():
    parser = argparse.ArgumentParser(description="Parallel re-embedding with dual GPUs")
    parser.add_argument("--phase", choices=["judgments", "chunks", "both"], default="both")
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    # Verify both GPU endpoints
    for name, url in [("3090", GPU_3090_URL), ("A4000", GPU_A4000_URL)]:
        try:
            info = requests.get(f"{url}/info", timeout=5).json()
            print(f"{name}: {info['model_id']} ready")
        except Exception as e:
            print(f"{name} at {url} not reachable: {e}")
            sys.exit(1)

    sb: Client = create_client(supabase_url, supabase_key)

    if args.phase in ("judgments", "both"):
        phase_judgments(sb)

    if args.phase in ("chunks", "both"):
        phase_chunks(sb)

    print("\nAll done!")


if __name__ == "__main__":
    main()
