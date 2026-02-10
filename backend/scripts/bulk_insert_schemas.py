#!/usr/bin/env python3
"""
Bulk insert schemas into Supabase using SQL.
This creates a single transaction for all inserts.
"""

import json
from pathlib import Path

# Read the generated schemas
schemas_file = Path(__file__).parent.parent / "lawyer_schemas.json"

with open(schemas_file, "r", encoding="utf-8") as f:
    schemas = json.load(f)

# Start transaction
print("BEGIN;")
print()

for i, schema in enumerate(schemas, 1):
    # Prepare the INSERT statement with proper escaping
    text_json = json.dumps(schema['text']).replace("'", "''")
    dates_json = json.dumps(schema['dates']).replace("'", "''")
    visual_metadata_json = json.dumps(schema['visual_metadata']).replace("'", "''")
    description_escaped = schema['description'].replace("'", "''")

    sql = f"""INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '{schema['id']}'::uuid,
    '{schema['name']}',
    '{description_escaped}',
    '{schema['type']}',
    '{schema['category']}',
    '{text_json}'::jsonb,
    '{dates_json}'::jsonb,
    '{schema['created_at']}'::timestamp,
    '{schema['updated_at']}'::timestamp,
    NULL,
    {schema['schema_version']},
    '{visual_metadata_json}'::jsonb,
    '{schema['last_edited_mode']}',
    {schema['field_count']}
);
"""
    print(sql)

# End transaction
print()
print("COMMIT;")
print()
print(f"-- Inserted {len(schemas)} schemas successfully")
