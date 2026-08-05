"""Failure contract for the publications database adapter."""

import pytest
from fastapi import HTTPException
from juddges_search.db.publications_db import PublicationsDB
from supabase import PostgrestAPIError

pytestmark = [pytest.mark.anyio, pytest.mark.unit]


class _FailingPublicationsQuery:
    def select(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        raise PostgrestAPIError(
            {
                "message": "database unavailable",
                "code": "XX000",
                "hint": None,
                "details": None,
            }
        )


class _FailingPublicationsClient:
    def table(self, _name: str) -> _FailingPublicationsQuery:
        return _FailingPublicationsQuery()


async def test_get_publications_translates_database_failure_to_http_500() -> None:
    db = PublicationsDB.__new__(PublicationsDB)
    db.client = _FailingPublicationsClient()

    with pytest.raises(HTTPException) as exc_info:
        await db.get_publications()

    assert exc_info.value.status_code == 500
    assert "Database error" in str(exc_info.value.detail)


async def test_get_publication_translates_database_failure_to_http_500() -> None:
    db = PublicationsDB.__new__(PublicationsDB)
    db.client = _FailingPublicationsClient()

    with pytest.raises(HTTPException) as exc_info:
        await db.get_publication("11111111-1111-4111-a111-111111111111")

    assert exc_info.value.status_code == 500
    assert "Database error" in str(exc_info.value.detail)
