import pytest
from juddges_search.ingestion.dedupe import dedupe_judgments


@pytest.mark.unit
def test_dedupe_removes_duplicate_judgment_ids():
    items = [
        {"judgment_id": "A", "content": "x"},
        {"judgment_id": "B", "content": "y"},
        {"judgment_id": "A", "content": "x"},
    ]
    out = list(dedupe_judgments(items))
    assert [d["judgment_id"] for d in out] == ["A", "B"]


@pytest.mark.unit
def test_dedupe_treats_already_seen_ids_as_duplicates():
    items = [{"judgment_id": "X"}, {"judgment_id": "Y"}]
    out = list(dedupe_judgments(items, already_seen={"X"}))
    assert [d["judgment_id"] for d in out] == ["Y"]


@pytest.mark.unit
def test_dedupe_empty_input_yields_empty():
    assert list(dedupe_judgments([])) == []


@pytest.mark.unit
def test_dedupe_preserves_first_occurrence_metadata():
    items = [
        {"judgment_id": "A", "version": 1},
        {"judgment_id": "A", "version": 2},
    ]
    out = list(dedupe_judgments(items))
    assert out == [{"judgment_id": "A", "version": 1}]


@pytest.mark.unit
def test_dedupe_ignores_items_missing_id():
    items = [{"judgment_id": "A"}, {"name": "no-id"}, {"judgment_id": "B"}]
    out = list(dedupe_judgments(items))
    assert [d.get("judgment_id") for d in out] == ["A", "B"]


@pytest.mark.unit
def test_dedupe_uses_case_number_as_default_key():
    # Since script actually uses case_number
    items = [
        {"case_number": "CASE-001", "content": "x"},
        {"case_number": "CASE-002", "content": "y"},
        {"case_number": "CASE-001", "content": "duplicate"},
    ]
    out = list(dedupe_judgments(items, id_key="case_number"))
    assert [d["case_number"] for d in out] == ["CASE-001", "CASE-002"]
