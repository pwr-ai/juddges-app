"""Unit tests for app.extraction_domain.job_results_store."""

from __future__ import annotations

import pytest

from app.extraction_domain.job_results_store import iter_job_results
from tests.app._fakes import FakeSupabaseClient, job_results_handler


def _rows(job_id: str, n: int, bucket: str = "completed") -> list[dict]:
    return [
        {
            "job_id": job_id,
            "position": i,
            "bucket": bucket,
            "item": {"document_id": f"{job_id}-{i}"},
        }
        for i in range(1, n + 1)
    ]


def _client(rows: list[dict]) -> FakeSupabaseClient:
    return FakeSupabaseClient(
        table_handlers={"extraction_job_results": job_results_handler(rows)}
    )


@pytest.mark.unit
def test_pages_across_multiple_pages_in_position_order() -> None:
    client = _client(list(reversed(_rows("j1", 5))))
    items = list(iter_job_results(client, "j1", page_size=2))
    assert [i["document_id"] for i in items] == [f"j1-{n}" for n in range(1, 6)]
    # 2 + 2 + 1 (short page ends it)
    assert len(client.table_calls) == 3
    assert [q.filter_values("gt", "position") for q in client.table_calls] == [
        [0],
        [2],
        [4],
    ]
    assert all(q.limit == 2 for q in client.table_calls)
    assert all(q.select == "position, item" for q in client.table_calls)


@pytest.mark.unit
def test_exact_multiple_of_page_size_needs_one_extra_empty_page() -> None:
    client = _client(_rows("j1", 4))
    assert len(list(iter_job_results(client, "j1", page_size=2))) == 4
    assert len(client.table_calls) == 3


@pytest.mark.unit
def test_bucket_filter_and_job_scoping() -> None:
    rows = _rows("j1", 2) + _rows("j1", 3, bucket="failed")[2:] + _rows("j2", 2)
    rows[2]["position"] = 3
    client = _client(rows)
    items = list(iter_job_results(client, "j1", bucket="completed"))
    assert [i["document_id"] for i in items] == ["j1-1", "j1-2"]
    assert client.table_calls[0].filter_values("eq", "bucket") == ["completed"]
    assert client.table_calls[0].filter_values("eq", "job_id") == ["j1"]


@pytest.mark.unit
def test_no_bucket_means_no_bucket_filter() -> None:
    client = _client(_rows("j1", 1))
    list(iter_job_results(client, "j1"))
    assert client.table_calls[0].filter_values("eq", "bucket") == []


@pytest.mark.unit
def test_empty_job_yields_nothing() -> None:
    client = _client([])
    assert list(iter_job_results(client, "nope")) == []
    assert len(client.table_calls) == 1
