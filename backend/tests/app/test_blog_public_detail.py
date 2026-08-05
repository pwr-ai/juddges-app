"""Public blog detail contract tests."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest
from supabase import PostgrestAPIError

if TYPE_CHECKING:
    from httpx import AsyncClient


MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260805150000_create_public_blog_detail_rpc.sql"
)


class DetailRpcSupabase:
    def __init__(self, payload: Any = None, *, fails: bool = False) -> None:
        self.payload = payload
        self.fails = fails
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, name: str) -> None:
        raise AssertionError(f"public detail must not issue table query for {name}")

    def rpc(self, name: str, params: dict[str, Any]) -> SimpleNamespace:
        self.calls.append((name, params))

        def execute() -> SimpleNamespace:
            if self.fails:
                raise PostgrestAPIError(
                    {
                        "message": "database unavailable",
                        "code": "XX000",
                        "hint": None,
                        "details": None,
                    }
                )
            return SimpleNamespace(data=self.payload)

        return SimpleNamespace(execute=execute)


def detail_payload() -> dict[str, Any]:
    return {
        "id": "post-1",
        "slug": "published-post",
        "title": "Published post",
        "excerpt": "Public excerpt",
        "content": "# Safe markdown",
        "featured_image": None,
        "author": {
            "id": "author-1",
            "name": "Public Author",
            "avatar": None,
            "title": "Researcher",
            "email": "private@example.test",
            "internal_role": "admin",
        },
        "category": "Research",
        "tags": ["AI"],
        "status": "published",
        "published_at": "2026-08-01T00:00:00Z",
        "created_at": "2026-07-31T00:00:00Z",
        "updated_at": "2026-08-01T00:00:00Z",
        "read_time": 2,
        "views": 12,
        "likes_count": 3,
        "ai_summary": None,
        "related_posts": [
            {
                "id": "post-2",
                "slug": "related-post",
                "title": "Related post",
                "excerpt": "Related excerpt",
                "featured_image": None,
                "author": {
                    "id": "author-2",
                    "name": "Related Author",
                    "avatar": None,
                    "title": "Editor",
                    "email": "also-private@example.test",
                },
                "category": "Research",
                "tags": ["Case law"],
                "status": "published",
                "published_at": "2026-07-30T00:00:00Z",
                "created_at": "2026-07-29T00:00:00Z",
                "updated_at": "2026-07-30T00:00:00Z",
                "read_time": 1,
                "views": 4,
                "likes_count": 1,
                "ai_summary": None,
            }
        ],
    }


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.api
async def test_public_detail_uses_one_rpc_and_allowlists_all_authors(
    authenticated_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = DetailRpcSupabase(detail_payload())
    monkeypatch.setattr("app.api.blog.get_admin_supabase_client", lambda: fake)

    response = await authenticated_client.get("/blog/posts/published-post")

    assert response.status_code == 200
    assert fake.calls == [
        ("get_public_blog_post", {"p_slug": "published-post", "p_related_limit": 3})
    ]
    body = response.json()
    assert body["author"] == {
        "id": "author-1",
        "name": "Public Author",
        "avatar": None,
        "title": "Researcher",
    }
    assert body["related_posts"][0]["author"] == {
        "id": "author-2",
        "name": "Related Author",
        "avatar": None,
        "title": "Editor",
    }


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.api
async def test_public_detail_hides_drafts_and_missing_posts_as_404(
    authenticated_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.api.blog.get_admin_supabase_client",
        lambda: DetailRpcSupabase(None),
    )

    response = await authenticated_client.get("/blog/posts/not-public")

    assert response.status_code == 404
    assert response.json() == {"detail": "Post not found"}


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.api
async def test_public_detail_preserves_database_failure_as_500(
    authenticated_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.api.blog.get_admin_supabase_client",
        lambda: DetailRpcSupabase(fails=True),
    )

    response = await authenticated_client.get("/blog/posts/published-post")

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to fetch blog post"}


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.api
@pytest.mark.parametrize(
    "malformed_payload",
    [
        {},
        [],
        "",
        0,
    ],
)
async def test_public_detail_rejects_falsy_malformed_rpc_payload(
    authenticated_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    malformed_payload: Any,
) -> None:
    monkeypatch.setattr(
        "app.api.blog.get_admin_supabase_client",
        lambda: DetailRpcSupabase(malformed_payload),
    )

    response = await authenticated_client.get("/blog/posts/published-post")

    assert response.status_code == 500
    assert response.json() == {"detail": "Invalid blog post data"}


@pytest.mark.anyio
@pytest.mark.unit
@pytest.mark.api
@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("related_posts", {"unexpected": "object"}),
        ("author", "private-author-id"),
    ],
)
async def test_public_detail_rejects_malformed_rpc_fields(
    authenticated_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    invalid_value: Any,
) -> None:
    malformed = detail_payload()
    malformed[field] = invalid_value
    monkeypatch.setattr(
        "app.api.blog.get_admin_supabase_client",
        lambda: DetailRpcSupabase(malformed),
    )

    response = await authenticated_client.get("/blog/posts/published-post")

    assert response.status_code == 500
    assert response.json() == {"detail": "Invalid blog post data"}


@pytest.mark.unit
def test_public_blog_detail_rpc_is_batched_private_and_deterministic() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    normalized = " ".join(sql.lower().split())

    assert "create or replace function public.get_public_blog_post" in normalized
    assert "p_slug text" in normalized
    assert "bp.status = 'published'" in normalized
    assert "bp.deleted_at is null" in normalized
    assert "jsonb_agg" in normalized
    assert "left join public.user_profiles" in normalized
    assert "'id', up.id" in normalized
    assert "'name', coalesce(up.name, 'anonymous')" in normalized
    assert "email" not in normalized
    assert "published_at desc nulls last" in normalized
    assert "id asc" in normalized
    assert "revoke all on function public.get_public_blog_post" in normalized
    assert "grant execute on function public.get_public_blog_post" in normalized
    assert "to service_role" in normalized
