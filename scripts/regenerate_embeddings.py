#!/usr/bin/env python3
"""
Regenerate embeddings with proper PostgreSQL vector format.

Converts Python lists to PostgreSQL vector format for proper storage.

Usage:
    python scripts/regenerate_embeddings.py
    python scripts/regenerate_embeddings.py --limit 50
"""

import argparse
import os
import sys
from typing import List, Optional
import requests
from dotenv import load_dotenv
from supabase import create_client, Client
from tqdm import tqdm

load_dotenv()


def vector_to_pg_format(vector: List[float]) -> str:
    """
    Convert Python list to PostgreSQL vector format.

    Args:
        vector: List of floats

    Returns:
        String in format '[val1,val2,val3,...]' for PostgreSQL vector type
    """
    return '[' + ','.join(map(str, vector)) + ']'


def generate_embedding_single(text: str, transformers_url: str) -> Optional[List[float]]:
    """Generate embedding for a single text."""
    try:
        truncated_text = text[:32000]
        url = f"{transformers_url}/vectors"
        payload = {"text": truncated_text}

        response = requests.post(url, json=payload, timeout=60)
        response.raise_for_status()

        data = response.json()
        vector = data.get("vector")

        # Validate vector
        if vector and isinstance(vector, list) and len(vector) == 768:
            return vector
        else:
            return None

    except Exception as e:
        return None


def main():
    parser = argparse.ArgumentParser(description='Regenerate embeddings with proper vector format')
    parser.add_argument('--limit', type=int, default=None,
                       help='Limit number of judgments to process')
    parser.add_argument('--force', action='store_true',
                       help='Regenerate even if embeddings exist')

    args = parser.parse_args()

    # Get configuration
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    transformers_url = os.getenv('TRANSFORMERS_INFERENCE_URL', 'http://localhost:8080')

    if not supabase_url or not supabase_key:
        print("❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    # Check transformer service
    try:
        health_url = f"{transformers_url}/.well-known/ready"
        response = requests.get(health_url, timeout=5)
        if response.status_code not in [200, 204]:
            print(f"❌ Transformer service not ready")
            sys.exit(1)
        print(f"✅ Transformer service healthy")
    except Exception as e:
        print(f"❌ Cannot connect to transformer: {e}")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"Embedding Generation with PostgreSQL Vector Format")
    print(f"{'='*60}\n")

    # Initialize Supabase
    supabase: Client = create_client(supabase_url, supabase_key)

    # Fetch judgments
    print(f"🔍 Fetching judgments...")
    result = supabase.table('judgments').select('id,full_text,embedding').execute()
    judgments = result.data[:args.limit] if args.limit else result.data

    print(f"Found {len(judgments)} judgments")

    # Filter (Python client returns vectors as strings, so we just check for None)
    needs_embedding = judgments if args.force else [
        j for j in judgments if j['embedding'] is None or j['embedding'] == ''
    ]

    print(f"📊 {len(needs_embedding)} need embeddings\n")

    if not needs_embedding:
        print("✅ All done!")
        return

    # Process with incremental saving
    updated = 0
    failed = 0

    for judgment in tqdm(needs_embedding, desc="Generating & saving"):
        # Generate
        vector_list = generate_embedding_single(judgment['full_text'], transformers_url)

        if vector_list and len(vector_list) == 768:
            try:
                # Convert to PostgreSQL vector format
                vector_pg = vector_to_pg_format(vector_list)

                # Use RPC function for proper vector insertion
                supabase.rpc('update_judgment_embedding', {
                    'judgment_id': judgment['id'],
                    'embedding_text': vector_pg
                }).execute()

                updated += 1

            except Exception as e:
                print(f"\n❌ Save failed: {e}")
                failed += 1
        else:
            failed += 1

    print(f"\n{'='*60}")
    print(f"✅ Success: {updated}/100")
    if failed > 0:
        print(f"⚠️  Failed: {failed}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
