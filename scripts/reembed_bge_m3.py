#!/usr/bin/env python3
"""
Re-embed all judgments using BGE-M3 (1024-dim) via HuggingFace TEI.

Uses the /embed endpoint of text-embeddings-inference and updates
Supabase via the update_judgment_embedding RPC function.

Usage:
    python scripts/reembed_bge_m3.py
    python scripts/reembed_bge_m3.py --limit 100
    python scripts/reembed_bge_m3.py --batch-size 16
"""

import argparse
import os
import sys
import time

import requests
from dotenv import load_dotenv
from supabase import Client, create_client
from tqdm import tqdm

load_dotenv()

EXPECTED_DIM = 1024
MAX_INPUT_LENGTH = 8192  # TEI max tokens; we truncate chars as safety margin


def vector_to_pg_format(vector: list[float]) -> str:
    return "[" + ",".join(map(str, vector)) + "]"


def embed_batch(texts: list[str], tei_url: str) -> list[list[float] | None]:
    """Embed a batch of texts via TEI /embed endpoint."""
    truncated = [t[:32000] for t in texts]  # char-level safety truncation
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
        print(f"\n  Batch embed error: {e}")
        return [None] * len(texts)


def main():
    parser = argparse.ArgumentParser(description="Re-embed judgments with BGE-M3")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--force", action="store_true", help="Re-embed even if embedding exists")
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    tei_url = os.getenv("TRANSFORMERS_INFERENCE_URL", "http://localhost:9080")

    if not supabase_url or not supabase_key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    # Verify TEI is up
    try:
        info = requests.get(f"{tei_url}/info", timeout=5).json()
        print(f"TEI model: {info['model_id']}, max_input: {info['max_input_length']}")
    except Exception as e:
        print(f"Cannot reach TEI at {tei_url}: {e}")
        sys.exit(1)

    sb: Client = create_client(supabase_url, supabase_key)

    # Fetch judgments needing embeddings
    print("Fetching judgments...")
    # Paginate to get all rows (Supabase client has 1000-row default)
    all_judgments = []
    page_size = 1000
    offset = 0
    while True:
        result = (
            sb.table("judgments")
            .select("id,title,summary,full_text,embedding")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        all_judgments.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size

    print(f"Total judgments: {len(all_judgments)}")

    if not args.force:
        needs_embed = [j for j in all_judgments if not j.get("embedding")]
    else:
        needs_embed = all_judgments

    if args.limit:
        needs_embed = needs_embed[: args.limit]

    print(f"To embed: {len(needs_embed)}")
    if not needs_embed:
        print("Nothing to do!")
        return

    # Process in batches
    updated = 0
    failed = 0
    start = time.time()

    for i in tqdm(range(0, len(needs_embed), args.batch_size), desc="Embedding"):
        batch = needs_embed[i : i + args.batch_size]

        # Build text for each judgment: title + summary + truncated full_text
        texts = []
        for j in batch:
            parts = []
            if j.get("title"):
                parts.append(j["title"])
            if j.get("summary"):
                parts.append(j["summary"])
            if j.get("full_text"):
                parts.append(j["full_text"][:16000])
            texts.append(" ".join(parts) if parts else "empty")

        vectors = embed_batch(texts, tei_url)

        for j, vec in zip(batch, vectors):
            if vec and len(vec) == EXPECTED_DIM:
                try:
                    pg_vec = vector_to_pg_format(vec)
                    sb.rpc(
                        "update_judgment_embedding",
                        {"judgment_id": j["id"], "embedding_text": pg_vec},
                    ).execute()
                    updated += 1
                except Exception as e:
                    print(f"\n  DB save error for {j['id']}: {e}")
                    failed += 1
            else:
                failed += 1

    elapsed = time.time() - start
    rate = updated / elapsed if elapsed > 0 else 0
    print(f"\nDone in {elapsed:.0f}s ({rate:.1f} judgments/sec)")
    print(f"  Updated: {updated}")
    print(f"  Failed:  {failed}")


if __name__ == "__main__":
    main()
