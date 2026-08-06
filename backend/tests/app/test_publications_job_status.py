"""
Extraction job status reaches the API response (issue #431).

``ExtractionJobLink.job_status`` was declared on the response model but never
populated, so every publication reported ``job_status: null`` no matter what
state its extraction jobs were in. Two independent gaps caused it, and either
one alone is enough to reproduce the bug:

1. the ``publication_extraction_jobs`` embed did not request ``status``, so the
   column never left Postgres;
2. ``transform_publication`` built ``ExtractionJobLink`` without passing
   ``job_status``, so the value would have been dropped even if it arrived.

``status`` lives on the nested ``extraction_jobs`` table rather than on the
junction row, so it comes back as an embedded PostgREST resource. Both gaps are
pinned here — fixing one without the other silently returns to ``None``.
"""

from typing import Any

import pytest
from juddges_search.db.publications_db import PublicationsDB

from app.publications import get_publication_extraction_jobs, transform_publication

pytestmark = [pytest.mark.unit]

PUBLICATION_ID = "11111111-1111-4111-a111-111111111111"
JOB_ID = "33333333-3333-4333-a333-333333333333"


def _publication(extraction_job_links: list[dict[str, Any]]) -> dict[str, Any]:
    """A publication row shaped the way the Supabase embed returns it."""
    return {
        "id": PUBLICATION_ID,
        "title": "Interpretable judicial search",
        "authors": [{"name": "Ada Lovelace"}],
        "venue": "Journal of Legal AI",
        "year": 2026,
        "abstract": "Contract fixture.",
        "project": "JuDDGES",
        "type": "journal",
        "status": "published",
        "links": {},
        "created_at": "2026-08-06T10:00:00Z",
        "updated_at": "2026-08-06T10:00:00Z",
        "publication_extraction_jobs": extraction_job_links,
    }


class _RecordingQuery:
    """Captures the select string instead of talking to Supabase."""

    def __init__(self, recorder: list[str]) -> None:
        self._recorder = recorder

    def select(self, columns: str) -> "_RecordingQuery":
        self._recorder.append(columns)
        return self

    def __getattr__(self, _name: str):
        def _chain(*_args: Any, **_kwargs: Any) -> "_RecordingQuery":
            return self

        return _chain

    def execute(self) -> Any:
        class _Response:
            data: list[dict[str, Any]] = []

        return _Response()


class _RecordingClient:
    def __init__(self) -> None:
        self.selects: list[str] = []

    def table(self, _name: str) -> _RecordingQuery:
        return _RecordingQuery(self.selects)


def _db_with_recording_client() -> tuple[PublicationsDB, _RecordingClient]:
    db = PublicationsDB.__new__(PublicationsDB)
    client = _RecordingClient()
    db.client = client
    return db, client


def test_transform_maps_status_from_embedded_job() -> None:
    """The nested extraction_jobs embed supplies job_status."""
    publication = transform_publication(
        _publication(
            [
                {
                    "job_id": JOB_ID,
                    "description": "Published extraction",
                    "created_at": "2026-08-06T09:00:00Z",
                    "extraction_jobs": {"status": "completed"},
                }
            ]
        )
    )

    assert [job.job_status for job in publication.extraction_jobs] == ["completed"]
    assert publication.extraction_jobs[0].job_id == JOB_ID


def test_transform_accepts_embed_returned_as_list() -> None:
    """PostgREST may resolve the embed as to-many and return a list."""
    publication = transform_publication(
        _publication(
            [
                {
                    "job_id": JOB_ID,
                    "extraction_jobs": [{"status": "running"}],
                }
            ]
        )
    )

    assert publication.extraction_jobs[0].job_status == "running"


@pytest.mark.parametrize(
    "embedded",
    [
        pytest.param(None, id="job-deleted"),
        pytest.param([], id="empty-embed"),
        pytest.param({}, id="status-absent"),
    ],
)
def test_transform_yields_none_when_status_unavailable(embedded: Any) -> None:
    """A link with no reachable job reports None rather than raising."""
    publication = transform_publication(
        _publication([{"job_id": JOB_ID, "extraction_jobs": embedded}])
    )

    assert publication.extraction_jobs[0].job_status is None


def test_transform_yields_none_when_embed_key_missing() -> None:
    """Rows fetched without the embed must not blow up."""
    publication = transform_publication(_publication([{"job_id": JOB_ID}]))

    assert publication.extraction_jobs[0].job_status is None


class _ExtractionJobsDb:
    async def get_publication_extraction_jobs(
        self, publication_id: str
    ) -> list[dict[str, Any]]:
        assert publication_id == PUBLICATION_ID
        return [
            {
                "job_id": JOB_ID,
                "description": "Published extraction",
                "created_at": "2026-08-06T09:00:00Z",
                "extraction_jobs": {"status": "SUCCESS"},
            }
        ]


@pytest.mark.anyio
async def test_extraction_jobs_subresource_maps_embedded_job_status() -> None:
    """The linked-jobs endpoint preserves the nested raw database status."""
    jobs = await get_publication_extraction_jobs(PUBLICATION_ID, _ExtractionJobsDb())

    assert [job.job_status for job in jobs] == ["SUCCESS"]


@pytest.mark.anyio
async def test_get_publication_requests_job_status() -> None:
    """The detail query must embed the status column."""
    db, client = _db_with_recording_client()

    await db.get_publication(PUBLICATION_ID)

    assert client.selects, "get_publication issued no select"
    assert "extraction_jobs(status)" in client.selects[0]


@pytest.mark.anyio
async def test_get_publications_requests_job_status() -> None:
    """The list query must embed the status column too."""
    db, client = _db_with_recording_client()

    await db.get_publications()

    assert client.selects, "get_publications issued no select"
    assert "extraction_jobs(status)" in client.selects[0]
