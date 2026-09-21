"""Long-format CSV of a CompareResponse and POST /compare/export (Spec C AC5).

The pure functions are tested on a hand-built response; the endpoint goes
through the ASGI app like test_compare_router.py (synthetic Bearer user, stub
collections DB, RPC client patched on the router module).
"""

from __future__ import annotations

import csv
import io
from unittest.mock import MagicMock, patch

import pytest
from juddges_search.db.supabase_db import get_collections_db

from app.compare.csv_export import CSV_COLUMNS, csv_bytes, to_csv_rows
from app.compare.models import CompareField, CompareResponse, CompareValue, CoverageStat
from app.server import app

pytestmark = [pytest.mark.unit]

_OWNED_COLLECTION_ID = "00000000-0000-4000-a000-00000000c001"
_FOREIGN_COLLECTION_ID = "00000000-0000-4000-a000-00000000c0ff"


def _response() -> CompareResponse:
    return CompareResponse(
        totals={"PL": 4, "UK": 2},
        filters={},
        text_query=None,
        fields=[
            CompareField(
                field="plea_point",
                label="Plea Point",
                source="base",
                kind="enum",
                coverage={
                    "PL": CoverageStat(covered=4, total=4, ratio=1.0),
                    "UK": CoverageStat(covered=1, total=2, ratio=0.5),
                },
                tier="partial",
                missing_in=[],
                values=[
                    CompareValue(
                        value="before_trial",
                        counts={"PL": 3, "UK": 0},
                        shares={"PL": 0.75, "UK": 0.0},
                    )
                ],
            ),
            CompareField(
                field="appellant",
                label="Appellant",
                source="base",
                kind="enum",
                coverage={
                    "PL": CoverageStat(covered=0, total=4, ratio=0.0),
                    "UK": CoverageStat(covered=0, total=2, ratio=0.0),
                },
                tier="unavailable",
                missing_in=["PL", "UK"],
                values=[],
            ),
        ],
    )


def test_long_format_has_one_row_per_field_value_jurisdiction():
    rows = to_csv_rows(_response())
    assert [tuple(r.keys()) for r in rows] == [CSV_COLUMNS] * 2
    assert rows[0] == {
        "field": "plea_point",
        "value": "before_trial",
        "jurisdiction": "PL",
        "count": 3,
        "share": 0.75,
        "coverage": 1.0,
        "covered": 4,
        "total": 4,
    }
    assert rows[1]["jurisdiction"] == "UK"
    assert rows[1]["count"] == 0
    assert rows[1]["coverage"] == 0.5


def test_fields_without_values_produce_no_rows():
    assert all(r["field"] != "appellant" for r in to_csv_rows(_response()))


def test_null_share_and_ratio_serialise_as_empty_cells():
    """`share`/`ratio` are None where covered/total is 0 -- never the string 'None'."""
    response = _response()
    response.fields[0].values[0].shares["UK"] = None
    response.fields[0].coverage["UK"] = CoverageStat(covered=0, total=0, ratio=None)
    data = csv_bytes(to_csv_rows(response))
    reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
    uk = next(r for r in reader if r["jurisdiction"] == "UK")
    assert uk["share"] == "" and uk["coverage"] == ""


def test_csv_bytes_has_bom_and_header():
    data = csv_bytes(to_csv_rows(_response()))
    assert data.startswith(b"\xef\xbb\xbf")
    reader = csv.reader(io.StringIO(data.decode("utf-8-sig")))
    assert next(reader) == list(CSV_COLUMNS)
    assert b"\r\n" not in data


def test_csv_bytes_quotes_values_containing_delimiters():
    rows = to_csv_rows(_response())
    rows[0]["value"] = 'guilty, "late"'
    data = csv_bytes(rows).decode("utf-8-sig")
    parsed = list(csv.reader(io.StringIO(data)))
    assert parsed[1][1] == 'guilty, "late"'


# --- endpoint -----------------------------------------------------------------


class _StubDb:
    def __init__(self):
        self.owned_collection_ids: list[str] = []

    async def get_user_collections(self, user_id):
        return [{"id": cid} for cid in self.owned_collection_ids]


@pytest.fixture
def stub_db():
    db = _StubDb()
    app.dependency_overrides[get_collections_db] = lambda: db
    try:
        yield db
    finally:
        app.dependency_overrides.pop(get_collections_db, None)


def _fake_rpc_client():
    fake = MagicMock()
    fake.rpc.return_value.execute.return_value = MagicMock(
        data=[
            {
                "jurisdiction": "PL",
                "value": "a",
                "count": 1,
                "total": 1,
                "covered": 1,
                "coverage": 1.0,
            },
        ]
    )
    return fake


@pytest.mark.anyio
async def test_export_endpoint_streams_csv(authenticated_client, stub_db):
    fake = _fake_rpc_client()
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/export", json={"filters": {}, "fields": ["appellant"]}
        )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"].startswith(
        'attachment; filename="compare_'
    )
    assert response.headers["content-disposition"].endswith('.csv"')
    assert response.headers["x-rows-count"] == "2"  # PL row + UK row (count 0)
    assert response.content.startswith(b"\xef\xbb\xbf")
    body = response.content.decode("utf-8-sig").splitlines()
    assert body[0] == ",".join(CSV_COLUMNS)
    assert body[1] == "appellant,a,PL,1,1.0,1.0,1,1"
    assert body[2] == "appellant,a,UK,0,,,0,0"
    assert len(body) == 3


@pytest.mark.anyio
async def test_export_requires_bearer_user(client, valid_api_headers, stub_db):
    response = await client.post(
        "/compare/export", json={"filters": {}}, headers=valid_api_headers
    )
    assert response.status_code in (401, 403)


@pytest.mark.anyio
async def test_export_rejects_non_comparable_field(authenticated_client, stub_db):
    with patch("app.compare.router.supabase_client", MagicMock()):
        response = await authenticated_client.post(
            "/compare/export", json={"filters": {}, "fields": ["keywords"]}
        )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "UNKNOWN_FIELD"


@pytest.mark.anyio
async def test_export_foreign_collection_id_is_404(authenticated_client, stub_db):
    stub_db.owned_collection_ids = [_OWNED_COLLECTION_ID]
    fake = _fake_rpc_client()
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/export",
            json={
                "filters": {"collection_ids": [_FOREIGN_COLLECTION_ID]},
                "fields": ["appellant"],
            },
        )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "COLLECTION_NOT_FOUND"
    fake.rpc.assert_not_called()


@pytest.mark.anyio
async def test_export_503_without_database(authenticated_client, stub_db):
    with patch("app.compare.router.supabase_client", None):
        response = await authenticated_client.post(
            "/compare/export", json={"filters": {}}
        )
    assert response.status_code == 503
