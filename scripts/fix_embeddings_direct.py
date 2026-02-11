#!/usr/bin/env python3
"""
Fix embeddings using direct PostgreSQL connection (bypasses Supabase client issues).
"""

import os
import requests
import psycopg2
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

# Get Supabase connection string
supabase_url = os.getenv('SUPABASE_URL')  # https://xxx.supabase.co
project_ref = supabase_url.split('//')[1].split('.')[0]
password = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

# Construct connection string
conn_str = f"postgresql://postgres.{project_ref}:{password}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"

print(f"Connecting to PostgreSQL directly...")
print(f"Project: {project_ref}")

try:
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()

    print("✅ Connected to PostgreSQL")

    # Get judgments without embeddings
    cur.execute("SELECT id, full_text FROM judgments WHERE embedding IS NULL LIMIT 5")
    judgments = cur.fetchall()

    print(f"Found {len(judgments)} judgments without embeddings")
    print("Generating embeddings...\\n")

    transformers_url = "http://localhost:8080"
    updated = 0

    for jid, full_text in tqdm(judgments, desc="Processing"):
        # Generate embedding
        resp = requests.post(f'{transformers_url}/vectors',
                           json={'text': full_text[:32000]},
                           timeout=60)

        if resp.status_code == 200:
            vector_list = resp.json().get('vector')

            if vector_list and len(vector_list) == 768:
                # Convert to PostgreSQL array format
                vector_array = vector_list

                # Update using proper PostgreSQL vector type
                cur.execute(
                    "UPDATE judgments SET embedding = %s::vector(768) WHERE id = %s",
                    (str(vector_array), jid)
                )
                conn.commit()
                updated += 1

    print(f"\\n✅ Updated {updated} judgments")

    # Verify
    cur.execute("SELECT COUNT(*) FROM judgments WHERE embedding IS NOT NULL")
    count = cur.fetchone()[0]
    print(f"Total embeddings in DB: {count}")

    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
