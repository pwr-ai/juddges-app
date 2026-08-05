"""Public blog listing contract tests."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest

from app.api.blog import public_author

if TYPE_CHECKING:
    from httpx import AsyncClient


MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260805120000_create_public_blog_listing_rpc.sql"
)


class RpcOnlySupabase:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, name: str) -> None:
        raise AssertionError(f"public listing must not issue table query for {name}")

    def rpc(self, name: str, params: dict[str, Any]) -> SimpleNamespace:
        self.calls.append((name, params))
        payload = {
            "total": 2,
            "data": [
                {
                    "id": "post-a",
                    "slug": "post-a",
                    "title": "Appeal (100%) result A",
                    "excerpt": "A",
                    "featured_image": None,
                    "author": {
                        "id": "author-1",
                        "name": "Public Author",
                        "email": "private@example.test",
                        "avatar": None,
                        "title": "Researcher",
                    },
                    "category": "Research",
                    "tags": ["case,law"],
                    "status": "published",
                    "published_at": "2026-08-01T00:00:00Z",
                    "created_at": "2026-08-01T00:00:00Z",
                    "updated_at": "2026-08-01T00:00:00Z",
                    "read_time": 1,
                    "views": 1,
                    "likes_count": 0,
                    "ai_summary": None,
                }
            ],
        }
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=payload))


@pytest.mark.unit
def test_public_author_allowlist_rejects_private_fields() -> None:
    assert public_author(
        {
            "id": "author-1",
            "name": "Public Author",
            "avatar": None,
            "title": "Researcher",
            "email": "private@example.test",
            "internal_role": "admin",
        }
    ) == {
        "id": "author-1",
        "name": "Public Author",
        "avatar": None,
        "title": "Researcher",
    }


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.api
async def test_public_listing_uses_one_parameterized_rpc_and_strips_private_author_data(
    authenticated_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = RpcOnlySupabase()
    raw_search = "appeal,(100%)_"
    monkeypatch.setattr("app.api.blog.get_admin_supabase_client", lambda: fake)

    response = await authenticated_client.get(
        "/blog/posts",
        params={
            "page": 1,
            "limit": 1,
            "category": "Research",
            "tag": "case,law",
            "search": raw_search,
            "sort": "published_at",
            "order": "desc",
        },
    )

    assert response.status_code == 200
    assert fake.calls == [
        (
            "list_public_blog_posts",
            {
                "p_page": 1,
                "p_limit": 1,
                "p_category": "Research",
                "p_tag": "case,law",
                "p_search": raw_search,
                "p_sort": "published_at",
                "p_order": "desc",
            },
        )
    ]
    body = response.json()
    assert body["pagination"] == {
        "total": 2,
        "page": 1,
        "limit": 1,
        "total_pages": 2,
        "has_next": True,
        "has_prev": False,
    }
    assert body["data"][0]["author"] == {
        "id": "author-1",
        "name": "Public Author",
        "avatar": None,
        "title": "Researcher",
    }


@pytest.mark.unit
def test_public_blog_rpc_is_safe_batched_and_deterministic() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    normalized = " ".join(sql.lower().split())

    assert "create or replace function public.list_public_blog_posts" in normalized
    assert "p_search text" in normalized
    assert "p_tag text" in normalized
    assert "exists ( select 1 from public.blog_tags" in normalized
    assert "escaped_search" in normalized
    assert "escape e'\\\\'" in normalized
    assert "count(*)" in normalized
    assert "jsonb_agg" in normalized
    assert "'id', up.id" in normalized
    assert "'name', coalesce(up.name, 'anonymous')" in normalized
    assert "email" not in normalized
    assert "order by" in normalized
    assert "published_at" in normalized
    assert "f.id asc" in normalized
    assert "revoke all on function public.list_public_blog_posts" in normalized
    assert "grant execute on function public.list_public_blog_posts" in normalized
    assert "to service_role" in normalized
