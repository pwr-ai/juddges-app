"""
Extraction job status reaches the API response (issue #431).

``ExtractionJobLink.job_status`` was declared on the response model but never
populated, so every publication reported ``job_status: null`` no matter what
state its extraction jobs were in. Three independent gaps caused it, and any
one alone is enough to reproduce the bug:

1. the ``publication_extraction_jobs`` embed in ``get_publications`` did not
   request ``status``, so the column never left Postgres;
2. the same embed in ``get_publication``;
3. ``transform_publication`` and the linked-jobs endpoint built
   ``ExtractionJobLink`` without passing ``job_status``, so the value would
   have been dropped even where it did arrive.

``status`` lives on the nested ``extraction_jobs`` table rather than on the
junction row, so it comes back as an embedded PostgREST resource. All three
gaps are pinned here — closing any subset still returns ``None``.

The column stores only ``PENDING``/``STARTED``/``SUCCESS``/``FAILURE``, and the
API exposes the simplified vocabulary shared with the extraction endpoints, so
the fixtures use real column values and assert the translated names.

The same embed had a second defect, fixed under issue #464: the linked-jobs
sub-resource selected ``extraction_jobs(… schema_name …)``, a column that does
not exist and should not — the name is derived from ``schema_id`` everywhere
else (``jobs_router.create_bulk_extraction``,
``frontend/app/api/jobs/route.ts``). PostgREST rejects the whole query with
``42703 column extraction_jobs_1.schema_name does not exist``, so the endpoint
returned ``[]`` for every publication. The second half of this module pins the
select string and the derivation that replaced the phantom column.
"""

from typing import Any

import pytest
from juddges_search.db.publications_db import PublicationsDB
from supabase import PostgrestAPIError

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
                    "extraction_jobs": {"status": "SUCCESS"},
                }
            ]
        )
    )

    assert [job.job_status for job in publication.extraction_jobs] == ["COMPLETED"]
    assert publication.extraction_jobs[0].job_id == JOB_ID


def test_transform_accepts_embed_returned_as_list() -> None:
    """PostgREST may resolve the embed as to-many and return a list."""
    publication = transform_publication(
        _publication(
            [
                {
                    "job_id": JOB_ID,
                    "extraction_jobs": [{"status": "STARTED"}],
                }
            ]
        )
    )

    assert publication.extraction_jobs[0].job_status == "IN_PROGRESS"


@pytest.mark.parametrize(
    ("stored", "exposed"),
    [
        pytest.param("PENDING", "IN_PROGRESS", id="pending"),
        pytest.param("STARTED", "IN_PROGRESS", id="started"),
        pytest.param("SUCCESS", "COMPLETED", id="success"),
        pytest.param("FAILURE", "FAILED", id="failure"),
    ],
)
def test_transform_exposes_the_simplified_status(stored: str, exposed: str) -> None:
    """Every value the column can hold maps to the shared API vocabulary.

    update_job_status_in_supabase narrows the simplified status to one of
    these four before writing, so this is the full domain. Publications must
    expose the same names as the extraction job endpoints — a job reading
    SUCCESS here and COMPLETED elsewhere is the bug this pins.
    """
    publication = transform_publication(
        _publication([{"job_id": JOB_ID, "extraction_jobs": {"status": stored}}])
    )

    assert publication.extraction_jobs[0].job_status == exposed


def test_partially_completed_is_indistinguishable_from_completed() -> None:
    """A partially failed job reads as COMPLETED, and that is a known limit.

    PARTIALLY_COMPLETED persists as SUCCESS, so the column cannot separate
    the two — telling them apart needs the per-document results JSON, which
    this embed does not fetch. Pinned so the limitation is deliberate rather
    than discovered later in the UI.
    """
    publication = transform_publication(
        _publication([{"job_id": JOB_ID, "extraction_jobs": {"status": "SUCCESS"}}])
    )

    assert publication.extraction_jobs[0].job_status == "COMPLETED"


@pytest.mark.parametrize(
    "embedded",
    [
        pytest.param(None, id="job-deleted"),
        pytest.param([], id="empty-embed"),
        pytest.param({}, id="status-absent"),
        pytest.param({"status": None}, id="status-null"),
        pytest.param({"status": ""}, id="status-empty"),
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
    """The linked-jobs endpoint maps the nested status like the others."""
    jobs = await get_publication_extraction_jobs(PUBLICATION_ID, _ExtractionJobsDb())

    assert [job.job_status for job in jobs] == ["COMPLETED"]


@pytest.mark.anyio
async def test_get_publication_detail_requests_job_status() -> None:
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


# ---------------------------------------------------------------------------
# The phantom `schema_name` column in the linked-jobs embed (issue #464)
# ---------------------------------------------------------------------------

SCHEMA_ID = "55555555-5555-4555-a555-555555555555"


class _TableStub:
    """One table's worth of canned rows, or an error to raise on execute."""

    def __init__(
        self, rows: list[dict[str, Any]] | None = None, error: Exception | None = None
    ) -> None:
        self.rows = rows or []
        self.error = error


class _StubQuery:
    def __init__(
        self, stub: _TableStub, recorder: list[tuple[str, str]], table: str
    ) -> None:
        self._stub = stub
        self._recorder = recorder
        self._table = table

    def select(self, columns: str) -> "_StubQuery":
        self._recorder.append((self._table, columns))
        return self

    def __getattr__(self, _name: str):
        def _chain(*_args: Any, **_kwargs: Any) -> "_StubQuery":
            return self

        return _chain

    def execute(self) -> Any:
        if self._stub.error is not None:
            raise self._stub.error

        class _Response:
            data = self._stub.rows

        return _Response()


class _StubClient:
    """A Supabase client that answers per table and records every select."""

    def __init__(self, **tables: _TableStub) -> None:
        self._tables = tables
        self.selects: list[tuple[str, str]] = []

    def table(self, name: str) -> _StubQuery:
        return _StubQuery(self._tables.get(name, _TableStub()), self.selects, name)

    @property
    def tables_queried(self) -> list[str]:
        return [table for table, _ in self.selects]


def _db_with(client: _StubClient) -> PublicationsDB:
    db = PublicationsDB.__new__(PublicationsDB)
    db.client = client
    return db


def _job_link(job: dict[str, Any] | list[dict[str, Any]] | None) -> dict[str, Any]:
    """A publication_extraction_jobs row as PostgREST returns it."""
    return {
        "job_id": JOB_ID,
        "description": "Run reported in table 3",
        "created_at": "2026-08-06T09:00:00Z",
        "extraction_jobs": job,
    }


def _embedded_job(link: dict[str, Any]) -> dict[str, Any]:
    embedded = link["extraction_jobs"]
    return embedded[0] if isinstance(embedded, list) else embedded


@pytest.mark.anyio
async def test_linked_jobs_embed_does_not_select_schema_name() -> None:
    """extraction_jobs has no schema_name column; selecting it is a 400.

    Pinned on the select string rather than on behaviour because the failure
    mode is upstream: PostgREST refuses the request, the except branch logs and
    returns [], and the endpoint reports "no linked jobs" for every
    publication.
    """
    client = _StubClient()
    db = _db_with(client)

    await db.get_publication_extraction_jobs(PUBLICATION_ID)

    assert client.selects, "get_publication_extraction_jobs issued no select"
    select = client.selects[0][1]
    assert "schema_name" not in select
    assert "extraction_jobs(id, job_id, status, schema_id, created_at)" in select


@pytest.mark.anyio
async def test_linked_jobs_resolve_schema_name_from_schema_id() -> None:
    """The name comes from a schema lookup, like the other two call sites."""
    client = _StubClient(
        publication_extraction_jobs=_TableStub(
            [
                _job_link(
                    {
                        "id": "job-row",
                        "job_id": JOB_ID,
                        "status": "SUCCESS",
                        "schema_id": SCHEMA_ID,
                    }
                )
            ]
        ),
        extraction_schemas=_TableStub(
            [{"id": SCHEMA_ID, "name": "Criminal appeal v3"}]
        ),
    )
    db = _db_with(client)

    links = await db.get_publication_extraction_jobs(PUBLICATION_ID)

    assert client.tables_queried == [
        "publication_extraction_jobs",
        "extraction_schemas",
    ]
    assert _embedded_job(links[0])["schema_name"] == "Criminal appeal v3"
    # The junction-row keys the API consumes are untouched.
    assert links[0]["job_id"] == JOB_ID
    assert links[0]["description"] == "Run reported in table 3"
    assert links[0]["created_at"] == "2026-08-06T09:00:00Z"
    assert _embedded_job(links[0])["status"] == "SUCCESS"


@pytest.mark.anyio
async def test_schema_name_resolves_through_a_to_many_embed() -> None:
    """PostgREST may return the embed as a list; the name still lands."""
    client = _StubClient(
        publication_extraction_jobs=_TableStub(
            [_job_link([{"status": "STARTED", "schema_id": SCHEMA_ID}])]
        ),
        extraction_schemas=_TableStub(
            [{"id": SCHEMA_ID, "name": "Criminal appeal v3"}]
        ),
    )
    db = _db_with(client)

    links = await db.get_publication_extraction_jobs(PUBLICATION_ID)

    assert _embedded_job(links[0])["schema_name"] == "Criminal appeal v3"


@pytest.mark.anyio
async def test_schema_name_is_none_when_the_schema_is_gone() -> None:
    """extraction_jobs.schema_id has no FK, so it can dangle."""
    client = _StubClient(
        publication_extraction_jobs=_TableStub(
            [_job_link({"status": "SUCCESS", "schema_id": SCHEMA_ID})]
        ),
        extraction_schemas=_TableStub([]),
    )
    db = _db_with(client)

    links = await db.get_publication_extraction_jobs(PUBLICATION_ID)

    assert _embedded_job(links[0])["schema_name"] is None


@pytest.mark.anyio
async def test_no_schema_lookup_without_a_schema_id() -> None:
    """A job with no schema costs no extra round trip."""
    client = _StubClient(
        publication_extraction_jobs=_TableStub(
            [_job_link({"status": "SUCCESS", "schema_id": None})]
        ),
    )
    db = _db_with(client)

    links = await db.get_publication_extraction_jobs(PUBLICATION_ID)

    assert client.tables_queried == ["publication_extraction_jobs"]
    assert _embedded_job(links[0])["schema_name"] is None


@pytest.mark.anyio
async def test_failed_schema_lookup_still_returns_the_links() -> None:
    """Display metadata must not take down the read path."""
    client = _StubClient(
        publication_extraction_jobs=_TableStub(
            [_job_link({"status": "SUCCESS", "schema_id": SCHEMA_ID})]
        ),
        extraction_schemas=_TableStub(
            error=PostgrestAPIError({"message": "schema lookup exploded"})
        ),
    )
    db = _db_with(client)

    links = await db.get_publication_extraction_jobs(PUBLICATION_ID)

    assert len(links) == 1
    assert _embedded_job(links[0])["schema_name"] is None


@pytest.mark.anyio
@pytest.mark.parametrize(
    "embedded",
    [
        pytest.param(None, id="job-deleted"),
        pytest.param([], id="empty-embed"),
    ],
)
async def test_unresolvable_embed_needs_no_schema_lookup(embedded: Any) -> None:
    """A link with no reachable job is returned as-is, not skipped."""
    client = _StubClient(publication_extraction_jobs=_TableStub([_job_link(embedded)]))
    db = _db_with(client)

    links = await db.get_publication_extraction_jobs(PUBLICATION_ID)

    assert client.tables_queried == ["publication_extraction_jobs"]
    assert links[0]["job_id"] == JOB_ID


@pytest.mark.anyio
async def test_one_lookup_serves_every_link() -> None:
    """Names are batched, mirroring the id -> name map in the jobs BFF route."""
    other_schema = "66666666-6666-4666-a666-666666666666"
    client = _StubClient(
        publication_extraction_jobs=_TableStub(
            [
                _job_link({"status": "SUCCESS", "schema_id": SCHEMA_ID}),
                _job_link({"status": "FAILURE", "schema_id": other_schema}),
                _job_link({"status": "PENDING", "schema_id": SCHEMA_ID}),
            ]
        ),
        extraction_schemas=_TableStub(
            [
                {"id": SCHEMA_ID, "name": "Criminal appeal v3"},
                {"id": other_schema, "name": "Sentencing v1"},
            ]
        ),
    )
    db = _db_with(client)

    links = await db.get_publication_extraction_jobs(PUBLICATION_ID)

    assert client.tables_queried.count("extraction_schemas") == 1
    assert [_embedded_job(link)["schema_name"] for link in links] == [
        "Criminal appeal v3",
        "Sentencing v1",
        "Criminal appeal v3",
    ]
