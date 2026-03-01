"""
Integration-style tests for blog admin endpoints with mocked Supabase backend.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

import pytest
from httpx import AsyncClient

from app.server import app
from app.core.auth_jwt import get_current_user


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class FakeUser:
    def __init__(self, user_id: str, admin: bool = False):
        self.id = user_id
        self.email = f"{user_id}@example.com"
        self._admin = admin

    def is_admin(self) -> bool:
        return self._admin


class FakeResponse:
    def __init__(self, data: Any = None, count: int | None = None):
        self.data = data
        self.count = count


class FakeQuery:
    def __init__(self, supabase: "FakeSupabase", table_name: str):
        self.supabase = supabase
        self.table_name = table_name
        self.filters: list[tuple[str, str, Any]] = []
        self.single_result = False
        self.limit_value: int | None = None
        self.range_value: tuple[int, int] | None = None
        self.order_value: tuple[str, bool] | None = None
        self.insert_value: Any = None
        self.update_value: dict[str, Any] | None = None
        self.delete_mode = False
        self.count_exact = False

    def select(self, _fields: str = "*", count: str | None = None) -> "FakeQuery":
        self.count_exact = count == "exact"
        return self

    def eq(self, key: str, value: Any) -> "FakeQuery":
        self.filters.append(("eq", key, value))
        return self

    def neq(self, key: str, value: Any) -> "FakeQuery":
        self.filters.append(("neq", key, value))
        return self

    def is_(self, key: str, value: Any) -> "FakeQuery":
        self.filters.append(("is", key, value))
        return self

    def or_(self, _clause: str) -> "FakeQuery":
        # Search filtering is not needed for these tests.
        return self

    def limit(self, value: int) -> "FakeQuery":
        self.limit_value = value
        return self

    def range(self, start: int, end: int) -> "FakeQuery":
        self.range_value = (start, end)
        return self

    def order(self, field: str, desc: bool = False) -> "FakeQuery":
        self.order_value = (field, desc)
        return self

    def single(self) -> "FakeQuery":
        self.single_result = True
        return self

    def insert(self, value: Any) -> "FakeQuery":
        self.insert_value = value
        return self

    def update(self, value: dict[str, Any]) -> "FakeQuery":
        self.update_value = value
        return self

    def delete(self) -> "FakeQuery":
        self.delete_mode = True
        return self

    def _matches(self, row: dict[str, Any]) -> bool:
        for op, key, value in self.filters:
            if op == "eq" and row.get(key) != value:
                return False
            if op == "neq" and row.get(key) == value:
                return False
            if op == "is":
                if value == "null" and row.get(key) is not None:
                    return False
                if value != "null" and row.get(key) != value:
                    return False
        return True

    def _filtered_rows(self) -> list[dict[str, Any]]:
        rows = [row for row in self.supabase.tables[self.table_name] if self._matches(row)]

        if self.order_value:
            field, desc = self.order_value
            rows = sorted(rows, key=lambda row: row.get(field), reverse=desc)
        if self.range_value:
            start, end = self.range_value
            rows = rows[start : end + 1]
        if self.limit_value is not None:
            rows = rows[: self.limit_value]

        return rows

    def execute(self) -> FakeResponse:
        now = datetime.now(timezone.utc).isoformat()
        table = self.supabase.tables[self.table_name]

        if self.insert_value is not None:
            values = (
                self.insert_value
                if isinstance(self.insert_value, list)
                else [self.insert_value]
            )
            inserted_rows = []
            for value in values:
                row = deepcopy(value)
                if self.table_name == "blog_posts":
                    self.supabase.post_counter += 1
                    row.setdefault("id", f"post-{self.supabase.post_counter}")
                    row.setdefault("views", 0)
                    row.setdefault("likes_count", 0)
                    row.setdefault("created_at", now)
                    row.setdefault("updated_at", now)
                    row.setdefault("deleted_at", None)
                table.append(row)
                inserted_rows.append(row)
            return FakeResponse(data=inserted_rows)

        if self.update_value is not None:
            updated_rows: list[dict[str, Any]] = []
            for row in table:
                if self._matches(row):
                    row.update(self.update_value)
                    updated_rows.append(deepcopy(row))
            return FakeResponse(data=updated_rows)

        if self.delete_mode:
            remaining_rows = [row for row in table if not self._matches(row)]
            self.supabase.tables[self.table_name] = remaining_rows
            return FakeResponse(data=[])

        filtered_rows = self._filtered_rows()
        count = len(filtered_rows) if self.count_exact else None

        if self.single_result:
            return FakeResponse(data=deepcopy(filtered_rows[0]) if filtered_rows else None)
        return FakeResponse(data=deepcopy(filtered_rows), count=count)


class FakeSupabase:
    def __init__(self):
        self.post_counter = 1
        self.tables: dict[str, list[dict[str, Any]]] = {
            "blog_posts": [
                {
                    "id": "post-1",
                    "slug": "existing-post",
                    "title": "Existing Post",
                    "excerpt": "Existing excerpt",
                    "content": "Existing content",
                    "featured_image": None,
                    "author_id": "user-1",
                    "category": "Research",
                    "status": "draft",
                    "published_at": None,
                    "read_time": 1,
                    "ai_summary": None,
                    "views": 10,
                    "likes_count": 2,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "deleted_at": None,
                }
            ],
            "blog_tags": [{"post_id": "post-1", "tag": "initial"}],
            "user_profiles": [
                {
                    "id": "user-1",
                    "name": "Author One",
                    "email": "author@example.com",
                    "avatar": None,
                    "title": "Editor",
                }
            ],
        }

    def table(self, name: str) -> FakeQuery:
        if name not in self.tables:
            self.tables[name] = []
        return FakeQuery(self, name)


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_blog_admin_crud_happy_path(
    authenticated_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    fake_supabase = FakeSupabase()

    async def mock_get_current_user() -> FakeUser:
        return FakeUser("user-1", admin=False)

    app.dependency_overrides[get_current_user] = mock_get_current_user
    monkeypatch.setattr("app.api.blog.get_admin_supabase_client", lambda: fake_supabase)

    try:
        create_payload = {
            "title": "New Admin Post",
            "excerpt": "Post excerpt",
            "content": "Post content for testing",
            "category": "Research",
            "tags": ["new", "admin"],
            "status": "draft",
        }
        create_response = await authenticated_client.post(
            "/blog/admin/posts", json=create_payload
        )
        assert create_response.status_code == 200
        created = create_response.json()["data"]
        post_id = created["id"]
        assert created["title"] == "New Admin Post"
        assert created["status"] == "draft"

        update_payload = {
            "title": "Updated Admin Post",
            "status": "published",
            "tags": ["updated"],
        }
        update_response = await authenticated_client.put(
            f"/blog/admin/posts/{post_id}", json=update_payload
        )
        assert update_response.status_code == 200
        updated = update_response.json()["data"]
        assert updated["title"] == "Updated Admin Post"
        assert updated["status"] == "published"
        assert updated["tags"] == ["updated"]

        list_response = await authenticated_client.get("/blog/admin/posts")
        assert list_response.status_code == 200
        listed_posts = list_response.json()["data"]
        assert any(post["id"] == post_id for post in listed_posts)

        stats_response = await authenticated_client.get("/blog/admin/stats")
        assert stats_response.status_code == 200
        stats = stats_response.json()
        assert stats["total_posts"] >= 2
        assert stats["published"] >= 1

        delete_response = await authenticated_client.delete(f"/blog/admin/posts/{post_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["success"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.anyio
@pytest.mark.api
@pytest.mark.auth
async def test_blog_admin_forbids_non_author_delete(
    authenticated_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    fake_supabase = FakeSupabase()

    async def mock_get_current_user() -> FakeUser:
        return FakeUser("other-user", admin=False)

    app.dependency_overrides[get_current_user] = mock_get_current_user
    monkeypatch.setattr("app.api.blog.get_admin_supabase_client", lambda: fake_supabase)

    try:
        response = await authenticated_client.delete("/blog/admin/posts/post-1")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()
