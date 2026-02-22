#!/usr/bin/env python3
"""
Masowe wstawianie schematów do Supabase przy użyciu SQL.
Wersja polska.
"""

import json
from pathlib import Path

# Odczytaj wygenerowane schematy
schemas_file = Path(__file__).parent.parent / "lawyer_schemas_pl.json"

with open(schemas_file, "r", encoding="utf-8") as f:
    schemas = json.load(f)

# Rozpocznij transakcję
print("BEGIN;")
print()

for i, schema in enumerate(schemas, 1):
    # Przygotuj instrukcję INSERT z odpowiednim escapowaniem
    text_json = json.dumps(schema["text"], ensure_ascii=False).replace("'", "''")
    dates_json = json.dumps(schema["dates"], ensure_ascii=False).replace("'", "''")
    visual_metadata_json = json.dumps(
        schema["visual_metadata"], ensure_ascii=False
    ).replace("'", "''")
    description_escaped = schema["description"].replace("'", "''")

    sql = f"""INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '{schema["id"]}'::uuid,
    '{schema["name"]}',
    '{description_escaped}',
    '{schema["type"]}',
    '{schema["category"]}',
    '{text_json}'::jsonb,
    '{dates_json}'::jsonb,
    '{schema["created_at"]}'::timestamp,
    '{schema["updated_at"]}'::timestamp,
    NULL,
    {schema["schema_version"]},
    '{visual_metadata_json}'::jsonb,
    '{schema["last_edited_mode"]}',
    {schema["field_count"]}
);
"""
    print(sql)

# Zakończ transakcję
print()
print("COMMIT;")
print()
print(f"-- Wstawiono {len(schemas)} schematów pomyślnie")
