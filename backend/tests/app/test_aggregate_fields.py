"""The aggregable-field allowlist lives in three places (JSON, Python, SQL).
These tests pin the Python mirror to the canonical JSON so the two cannot
drift; the SQL side is pinned by tests/db/test_aggregate_contract.py."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.extraction_domain.aggregate_fields import (
    AGGREGABLE_FIELDS,
    CORE_AGGREGATE_FIELDS,
    DEFAULT_AGGREGATE_FIELDS,
    validate_fields,
)

pytestmark = pytest.mark.unit

CANONICAL = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "lib"
    / "extractions"
    / "aggregable-fields.json"
)


def test_python_allowlist_equals_canonical_json() -> None:
    data = json.loads(CANONICAL.read_text(encoding="utf-8"))
    assert frozenset(data["fields"]) == AGGREGABLE_FIELDS
    assert tuple(data["default"]) == DEFAULT_AGGREGATE_FIELDS
    assert frozenset(data["core"]) == CORE_AGGREGATE_FIELDS


def test_default_set_is_a_subset_of_the_allowlist() -> None:
    assert set(DEFAULT_AGGREGATE_FIELDS) <= AGGREGABLE_FIELDS


def test_validate_fields_none_returns_default() -> None:
    assert validate_fields(None) == list(DEFAULT_AGGREGATE_FIELDS)


def test_validate_fields_keeps_order_and_dedupes() -> None:
    assert validate_fields(["court_name", "appeal_outcome", "court_name"]) == [
        "court_name",
        "appeal_outcome",
    ]


def test_validate_fields_rejects_unknown_field_by_name() -> None:
    with pytest.raises(ValueError, match="case_name"):
        validate_fields(["appeal_outcome", "case_name"])


def test_validate_fields_rejects_empty_list() -> None:
    with pytest.raises(ValueError, match="at least one"):
        validate_fields([])
