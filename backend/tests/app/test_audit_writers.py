"""Audit-trail write-path tests (issue #559).

`AuditService` had exactly one production caller before this suite: the audit
export endpoint logging its own export. These tests pin the request paths that
must now produce an `audit_logs` row, the paths that must deliberately produce
none (anonymous traffic), and the guarantee that an audit-write failure never
reaches the caller.

Everything here is in-process: the Supabase admin client used by AuditService is
replaced with a recorder, so no service is required.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from app.server import app

pytestmark = pytest.mark.unit

ANONYMOUS_PRINCIPAL = "anonymous"
USER_ID = "11111111-2222-3333-4444-555555555555"


class AuditRecorder:
    """Stand-in for the service-role Supabase client used by AuditService.

    Records every row inserted into `audit_logs` so tests can assert on the
    write instead of on a mock call chain.
    """

    def __init__(self, raise_on_insert: Exception | None = None) -> None:
        self.rows: list[dict[str, Any]] = []
        self._raise_on_insert = raise_on_insert
        self.insert_attempts = 0

    def table(self, name: str) -> AuditRecorder:
        assert name == "audit_logs", f"unexpected audit table {name!r}"
        return self

    def insert(self, row: dict[str, Any]) -> AuditRecorder:
        self.insert_attempts += 1
        if self._raise_on_insert is not None:
            raise self._raise_on_insert
        self.rows.append(row)
        return self

    def execute(self) -> MagicMock:
        result = MagicMock()
        result.data = [{"id": "audit-row-1"}]
        return result

    def rows_of_type(self, action_type: str) -> list[dict[str, Any]]:
        return [r for r in self.rows if r.get("action_type") == action_type]


@pytest.fixture
def audit_recorder(monkeypatch: pytest.MonkeyPatch) -> AuditRecorder:
    recorder = AuditRecorder()
    monkeypatch.setattr(
        "app.services.audit_service.get_admin_supabase_client",
        lambda: recorder,
    )
    return recorder


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _install_optional_user(user_id: str | None) -> None:
    """Override the optional-JWT dependency used by the search endpoint."""
    from app.core.auth_jwt import AuthenticatedUser, get_optional_user

    async def _resolver() -> AuthenticatedUser | None:
        if user_id is None:
            return None
        return AuthenticatedUser(
            user_data={
                "id": user_id,
                "email": f"{user_id}@example.com",
                "role": "authenticated",
            },
            access_token="test-bearer-token",
        )

    app.dependency_overrides[get_optional_user] = _resolver


def _install_fake_search_service(hits: int = 3) -> None:
    from app.api.search import get_search_service

    class FakeSearchService:
        configured = True

        async def documents_search(
            self,
            query: str,
            limit: int = 10,
            offset: int = 0,
            filters: str | None = None,
            semantic_ratio: float = 0.0,
        ) -> dict[str, Any]:
            return {
                "hits": [{"id": f"doc-{i}"} for i in range(hits)],
                "query": query,
                "processingTimeMs": 7,
                "estimatedTotalHits": hits,
                "search_mode": "keyword",
            }

    app.dependency_overrides[get_search_service] = lambda: FakeSearchService()


# =============================================================================
# log_query — the search path
# =============================================================================


async def test_search_writes_a_query_audit_row(
    authenticated_client, audit_recorder: AuditRecorder
) -> None:
    _install_fake_search_service()
    _install_optional_user(USER_ID)

    response = await authenticated_client.get(
        "/api/search/documents", params={"q": "wyrok o zadoscuczynienie", "limit": 3}
    )

    assert response.status_code == 200
    queries = audit_recorder.rows_of_type("query")
    assert len(queries) == 1, f"expected one query audit row, got {audit_recorder.rows}"
    row = queries[0]
    assert row["user_id"] == USER_ID
    assert row["input_data"]["query"] == "wyrok o zadoscuczynienie"
    assert row["resource_type"] == "query"
    # The response body is summarised, never mirrored: the corpus text is
    # already public and copying it would bloat a 7-year table.
    assert row["output_data"]["result_count"] == 3


async def test_search_by_anonymous_visitor_writes_no_audit_row(
    client, valid_api_headers: dict[str, str], audit_recorder: AuditRecorder
) -> None:
    """Anonymous corpus reads are deliberately outside the compliance trail.

    There is no accountable subject to attribute the row to, and keying it on
    the guest session id would build a re-identifiable per-visitor history that
    public corpus access does not itself imply.
    """
    _install_fake_search_service()
    _install_optional_user(None)

    response = await client.get(
        "/api/search/documents",
        params={"q": "appeal", "limit": 3},
        headers=valid_api_headers,
    )

    assert response.status_code == 200
    assert audit_recorder.rows == []
    assert audit_recorder.insert_attempts == 0


async def test_audit_write_failure_does_not_fail_the_search_request(
    authenticated_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A broken audit backend must be invisible to the caller."""
    exploding = AuditRecorder(raise_on_insert=RuntimeError("audit backend down"))
    monkeypatch.setattr(
        "app.services.audit_service.get_admin_supabase_client",
        lambda: exploding,
    )
    _install_fake_search_service()
    _install_optional_user(USER_ID)

    response = await authenticated_client.get(
        "/api/search/documents", params={"q": "appeal", "limit": 3}
    )

    assert response.status_code == 200
    assert response.json()["pagination"]["loaded_count"] == 3
    # Guards the assertion above against passing vacuously: the audit path did
    # run and did blow up, and the request still succeeded.
    assert exploding.insert_attempts == 1


# =============================================================================
# log_document_access — judgment reads
# =============================================================================


def _install_fake_vector_db(monkeypatch: pytest.MonkeyPatch, doc_id: str) -> None:
    class FakeVectorDB:
        async def get_document_by_id(self, document_id: str) -> dict[str, Any]:
            return {
                "id": doc_id,
                "source_id": doc_id,
                "title": "Test judgment",
                "full_text": "Body of the judgment.",
                "language": "pl",
                "document_type": "judgment",
                "country": "Poland",
                "jurisdiction": "PL",
            }

    monkeypatch.setattr("app.judgments_pkg.get_vector_db", lambda: FakeVectorDB())


async def test_judgment_metadata_read_writes_a_document_view_audit_row(
    authenticated_client,
    audit_recorder: AuditRecorder,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_vector_db(monkeypatch, "judgment-1")

    response = await authenticated_client.get(
        "/documents/judgment-1/metadata", headers={"X-User-ID": USER_ID}
    )

    assert response.status_code == 200
    views = audit_recorder.rows_of_type("document_view")
    assert len(views) == 1, f"expected one document_view row, got {audit_recorder.rows}"
    assert views[0]["user_id"] == USER_ID
    assert views[0]["resource_id"] == "judgment-1"
    assert views[0]["resource_type"] == "document"


async def test_judgment_detail_read_writes_a_document_view_audit_row(
    authenticated_client,
    audit_recorder: AuditRecorder,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_vector_db(monkeypatch, "judgment-2")

    response = await authenticated_client.get(
        "/documents/judgment-2", headers={"X-User-ID": USER_ID}
    )

    assert response.status_code == 200
    views = audit_recorder.rows_of_type("document_view")
    assert len(views) == 1
    assert views[0]["resource_id"] == "judgment-2"


async def test_anonymous_judgment_read_writes_no_audit_row(
    authenticated_client,
    audit_recorder: AuditRecorder,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The BFF sends the reserved `anonymous` principal for signed-out readers
    (issue #561). That is not an accountable subject, so nothing is logged."""
    _install_fake_vector_db(monkeypatch, "judgment-3")

    response = await authenticated_client.get(
        "/documents/judgment-3/metadata",
        headers={"X-User-ID": ANONYMOUS_PRINCIPAL},
    )

    assert response.status_code == 200
    assert audit_recorder.rows == []


async def test_judgment_read_without_a_principal_header_writes_no_audit_row(
    authenticated_client,
    audit_recorder: AuditRecorder,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_vector_db(monkeypatch, "judgment-4")

    # authenticated_client sets X-User-ID, so strip it explicitly.
    response = await authenticated_client.get(
        "/documents/judgment-4/metadata", headers={"X-User-ID": ""}
    )

    assert response.status_code == 200
    assert audit_recorder.rows == []


# =============================================================================
# log_action — state-changing operations
# =============================================================================


async def test_collection_create_writes_an_audit_action(
    authenticated_client, audit_recorder: AuditRecorder, mock_user: dict[str, Any]
) -> None:
    from juddges_search.db.supabase_db import get_collections_db

    class FakeCollectionsDB:
        async def create_collection(
            self, user_id: str, name: str, description: str | None
        ) -> dict[str, Any]:
            return {
                "id": "collection-1",
                "user_id": user_id,
                "name": name,
                "description": description,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            }

    app.dependency_overrides[get_collections_db] = lambda: FakeCollectionsDB()

    response = await authenticated_client.post(
        "/collections", json={"name": "Matter 42", "description": None}
    )

    assert response.status_code == 200
    rows = audit_recorder.rows_of_type("collection_created")
    assert len(rows) == 1, (
        f"expected a collection_created row, got {audit_recorder.rows}"
    )
    assert rows[0]["user_id"] == mock_user["id"]
    assert rows[0]["resource_type"] == "collection"
    assert rows[0]["resource_id"] == "collection-1"


async def test_collection_delete_writes_an_audit_action(
    authenticated_client, audit_recorder: AuditRecorder
) -> None:
    from juddges_search.db.supabase_db import get_collections_db

    class FakeCollectionsDB:
        async def delete_collection(self, collection_id: str, user_id: str) -> None:
            return None

    app.dependency_overrides[get_collections_db] = lambda: FakeCollectionsDB()

    response = await authenticated_client.delete("/collections/collection-9")

    assert response.status_code == 200
    rows = audit_recorder.rows_of_type("collection_deleted")
    assert len(rows) == 1
    assert rows[0]["resource_id"] == "collection-9"


async def test_collection_document_add_writes_an_audit_action(
    authenticated_client, audit_recorder: AuditRecorder
) -> None:
    from juddges_search.db.supabase_db import get_collections_db

    class FakeCollectionsDB:
        async def add_document(
            self, collection_id: str, document_id: str, user_id: str
        ) -> dict[str, Any]:
            return {"collection_id": collection_id, "judgment_id": document_id}

    app.dependency_overrides[get_collections_db] = lambda: FakeCollectionsDB()

    response = await authenticated_client.post(
        "/collections/collection-9/documents", json={"document_id": "judgment-7"}
    )

    assert response.status_code == 200
    rows = audit_recorder.rows_of_type("collection_document_added")
    assert len(rows) == 1
    assert rows[0]["resource_id"] == "collection-9"
    assert rows[0]["input_data"]["document_ids"] == ["judgment-7"]
