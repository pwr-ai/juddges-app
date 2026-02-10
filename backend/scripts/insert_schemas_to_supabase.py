#!/usr/bin/env python3
"""Insert generated lawyer schemas into Supabase using SQL."""

import json
from pathlib import Path

# Read the generated schemas
schemas_file = Path(__file__).parent.parent / "lawyer_schemas.json"

with open(schemas_file, "r", encoding="utf-8") as f:
    schemas = json.load(f)

# Generate SQL INSERT statements
print("-- SQL statements to insert lawyer & tax advisor schemas")
print("-- Run this via Supabase MCP execute_sql tool\n")

for i, schema in enumerate(schemas, 1):
    # Prepare the INSERT statement
    sql = f"""
-- Schema {i}: {schema['name']}
INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '{schema['id']}'::uuid,
    '{schema['name']}',
    '{schema['description'].replace("'", "''")}',
    '{schema['type']}',
    '{schema['category']}',
    '{json.dumps(schema['text'])}'::jsonb,
    '{json.dumps(schema['dates'])}'::jsonb,
    '{schema['created_at']}'::timestamp,
    '{schema['updated_at']}'::timestamp,
    NULL,
    {schema['schema_version']},
    '{json.dumps(schema['visual_metadata'])}'::jsonb,
    '{schema['last_edited_mode']}',
    {schema['field_count']}
);
"""
    print(sql)

print("\n-- End of schema insertions")
print(f"-- Total schemas: {len(schemas)}")
