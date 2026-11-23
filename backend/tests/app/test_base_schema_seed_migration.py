"""Guard test: the seeded base schemas match the JSON files they were copied from.

supabase/migrations/20261123000002_seed_base_schemas.sql inserts the EN/PL base
schemas into extraction_schemas as system rows. The source of truth stays the
JSON files served by /extractions/base-schema/definition; this test fails when
one of them changes without a follow-up migration updating the seeded rows.
"""

import json
import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

_REPO_ROOT = Path(__file__).resolve().parents[3]
_MIGRATION = _REPO_ROOT / "supabase/migrations/20261123000002_seed_base_schemas.sql"
_SCHEMA_DIR = _REPO_ROOT / "backend/packages/juddges_search/config/schema"


def _seeded_bodies() -> dict[str, dict]:
    sql = _MIGRATION.read_text(encoding="utf-8")
    pattern = re.compile(
        r"'Base Schema \((?P<label>PL|EN)\)'.*?\$json\$(?P<body>.*?)\$json\$",
        re.DOTALL,
    )
    return {m["label"].lower(): json.loads(m["body"]) for m in pattern.finditer(sql)}


@pytest.mark.parametrize("locale", ["pl", "en"])
def test_seeded_base_schema_matches_json_file(locale: str) -> None:
    seeded = _seeded_bodies()
    expected = json.loads(
        (_SCHEMA_DIR / f"base_legal_schema_{locale}.json").read_text(encoding="utf-8")
    )

    assert locale in seeded, f"migration does not seed the {locale} base schema"
    assert seeded[locale] == expected


@pytest.mark.parametrize("locale", ["pl", "en"])
def test_seeded_field_count_matches_properties(locale: str) -> None:
    sql = _MIGRATION.read_text(encoding="utf-8")
    label = locale.upper()
    block = sql.split(f"'Base Schema ({label})'", 1)[1].split("ON CONFLICT", 1)[0]
    field_count = int(re.search(r"'code',\s*(\d+)\s*\)", block)[1])

    assert field_count == len(_seeded_bodies()[locale]["properties"])
