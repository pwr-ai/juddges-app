"""
Unit tests for app.api.admin module.

Tests admin endpoints with mocked Supabase admin client and auth.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.auth_jwt import AuthenticatedUser, require_admin


def _make_admin_user():
    """Create a mock admin user for dependency override."""
    return AuthenticatedUser(
        {"id": "admin-1", "email": "admin@test.com", "role": "service_role"},
        access_token="admin-token",
    )


@pytest.fixture
def admin_app():
    """Get the FastAPI app with admin auth overridden."""
    from app.server import app

    async def mock_require_admin():
        return _make_admin_user()

    app.dependency_overrides[require_admin] = mock_require_admin
    yield app
    app.dependency_overrides.clear()


# ===== Platform stats tests =====


@pytest.mark.unit
class TestGetPlatformStats:
    @patch("app.api.admin.get_admin_supabase_client")
    async def test_returns_stats_on_success(self, mock_get_client, admin_app):
        mock_client = MagicMock()

        # Mock list_users returning a list
        mock_client.auth.admin.list_users.return_value = [MagicMock() for _ in range(3)]

        # Mock table queries
        def make_count_resp(count):
            r = MagicMock()
            r.count = count
            r.data = None
            return r

        def make_events_resp():
            r = MagicMock()
            r.data = [
                {"session_id": "s1"},
                {"session_id": "s2"},
                {"session_id": "s1"},  # duplicate
            ]
            return r

        call_idx = {"n": 0}
        tables = {
            # legal_documents (total)
            0: lambda: MagicMock(
                select=MagicMock(
                    return_value=MagicMock(
                        execute=MagicMock(return_value=make_count_resp(50))
                    )
                )
            ),
            # search_queries
            1: lambda: MagicMock(
                select=MagicMock(
                    return_value=MagicMock(
                        gte=MagicMock(
                            return_value=MagicMock(
                                execute=MagicMock(return_value=make_count_resp(10))
                            )
                        )
                    )
                )
            ),
            # events
            2: lambda: MagicMock(
                select=MagicMock(
                    return_value=MagicMock(
                        gte=MagicMock(
                            return_value=MagicMock(
                                not_=MagicMock(
                                    is_=MagicMock(
                                        return_value=MagicMock(
                                            execute=MagicMock(
                                                return_value=make_events_resp()
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            ),
            # legal_documents (added this week)
            3: lambda: MagicMock(
                select=MagicMock(
                    return_value=MagicMock(
                        gte=MagicMock(
                            return_value=MagicMock(
                                execute=MagicMock(return_value=make_count_resp(5))
                            )
                        )
                    )
                )
            ),
        }

        def table_side_effect(name):
            idx = call_idx["n"]
            call_idx["n"] += 1
            return tables.get(idx, lambda: MagicMock())()

        mock_client.table.side_effect = table_side_effect
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/stats",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["total_users"] == 3
        assert "total_documents" in data
        assert "searches_today" in data

    @patch("app.api.admin.get_admin_supabase_client")
    async def test_stats_paginates_user_count(self, mock_get_client, admin_app):
        """BUG-16 regression: user count must paginate rather than fetching
        10,000 users in a single request. Verify that multiple pages are
        fetched when a full page is returned."""
        mock_client = MagicMock()

        # Simulate 2 full pages (1000 each) + 1 partial page (500)
        page_calls = {"n": 0}

        def mock_list_users(page=1, per_page=1000):
            page_calls["n"] += 1
            if page <= 2:
                return [MagicMock() for _ in range(per_page)]
            return [MagicMock() for _ in range(500)]

        mock_client.auth.admin.list_users.side_effect = mock_list_users

        # Mock table queries to return zeros (not the focus of this test)
        mock_client.table.side_effect = Exception("not relevant")
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/stats",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        # 1000 + 1000 + 500 = 2500
        assert data["total_users"] == 2500
        # Verify multiple list_users calls were made (pagination)
        assert mock_client.auth.admin.list_users.call_count == 3

    @patch("app.api.admin.get_admin_supabase_client")
    async def test_stats_single_page_user_count(self, mock_get_client, admin_app):
        """BUG-16 regression: when all users fit in one page, only one request
        should be made."""
        mock_client = MagicMock()
        mock_client.auth.admin.list_users.return_value = [
            MagicMock() for _ in range(50)
        ]
        mock_client.table.side_effect = Exception("not relevant")
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/stats",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["total_users"] == 50
        assert mock_client.auth.admin.list_users.call_count == 1

    @patch("app.api.admin.get_admin_supabase_client")
    async def test_stats_handles_all_failures_gracefully(
        self, mock_get_client, admin_app
    ):
        """All sub-queries failing should return zeros, not error."""
        mock_client = MagicMock()
        mock_client.auth.admin.list_users.side_effect = Exception("auth down")
        mock_client.table.side_effect = Exception("db down")
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/stats",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["total_users"] == 0
        assert data["total_documents"] == 0
        assert data["searches_today"] == 0
        assert data["active_sessions_24h"] == 0
        assert data["documents_added_this_week"] == 0


# ===== List users tests =====


@pytest.mark.unit
class TestListUsers:
    @patch("app.api.admin.get_admin_supabase_client")
    async def test_list_users_with_model_dump(self, mock_get_client, admin_app):
        mock_client = MagicMock()

        mock_user = MagicMock()
        mock_user.model_dump.return_value = {
            "id": "u1",
            "email": "user@example.com",
            "created_at": "2024-01-01",
            "last_sign_in_at": "2024-06-01",
            "app_metadata": {"plan": "pro"},
        }
        mock_client.auth.admin.list_users.return_value = [mock_user]
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/users",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert len(data["users"]) == 1
        assert data["users"][0]["email"] == "user@example.com"

    @patch("app.api.admin.get_admin_supabase_client")
    async def test_list_users_handles_dict_users(self, mock_get_client, admin_app):
        """When list_users returns dicts instead of model objects."""
        mock_client = MagicMock()
        mock_client.auth.admin.list_users.return_value = [
            {"id": "u1", "email": "a@b.com"}
        ]
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/users",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200

    @patch("app.api.admin.get_admin_supabase_client")
    async def test_list_users_error_returns_empty(self, mock_get_client, admin_app):
        mock_client = MagicMock()
        mock_client.auth.admin.list_users.side_effect = Exception("auth error")
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/users",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["users"] == []


# ===== Activity endpoint tests =====


@pytest.mark.unit
class TestGetRecentActivity:
    @patch("app.api.admin.get_admin_supabase_client")
    async def test_returns_activity(self, mock_get_client, admin_app):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": "a1",
                "user_id": "u1",
                "action_type": "search",
                "created_at": "2024-01-01T00:00:00",
            }
        ]
        mock_client.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value = mock_response
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/activity",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    @patch("app.api.admin.get_admin_supabase_client")
    async def test_activity_error_returns_empty(self, mock_get_client, admin_app):
        mock_client = MagicMock()
        mock_client.table.side_effect = Exception("db down")
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/activity",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        assert response.json() == []


# ===== Search queries endpoint tests =====


@pytest.mark.unit
class TestGetSearchQueries:
    @patch("app.api.admin.get_admin_supabase_client")
    async def test_returns_search_queries(self, mock_get_client, admin_app):
        mock_client = MagicMock()

        # Count query
        count_resp = MagicMock()
        count_resp.count = 1
        # Data query
        data_resp = MagicMock()
        data_resp.data = [
            {
                "id": "sq1",
                "user_id": "u1",
                "query": "contract law",
                "result_count": 5,
                "duration_ms": 120,
                "created_at": "2024-01-01",
            }
        ]

        call_idx = {"n": 0}

        def table_side(name):
            call_idx["n"] += 1
            if call_idx["n"] == 1:
                # count query
                m = MagicMock()
                m.select.return_value.execute.return_value = count_resp
                return m
            # data query
            m = MagicMock()
            m.select.return_value.order.return_value.range.return_value.execute.return_value = data_resp
            return m

        mock_client.table.side_effect = table_side
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/search-queries",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["queries"]) == 1


# ===== Document stats endpoint tests =====


@pytest.mark.unit
class TestGetDocumentStats:
    @patch("app.api.admin.get_admin_supabase_client")
    async def test_returns_document_stats(self, mock_get_client, admin_app):
        mock_client = MagicMock()

        call_idx = {"n": 0}

        def table_side(name):
            call_idx["n"] += 1
            m = MagicMock()
            if call_idx["n"] == 1:
                # total
                resp = MagicMock()
                resp.count = 100
                m.select.return_value.execute.return_value = resp
            elif call_idx["n"] == 2:
                # doc_type_stats
                resp = MagicMock()
                resp.data = [
                    {"doc_type": "judgment", "count": 60},
                    {"doc_type": "TOTAL", "count": 100},
                ]
                m.select.return_value.execute.return_value = resp
            elif call_idx["n"] == 3:
                # country
                resp = MagicMock()
                resp.data = [{"country": "PL"}, {"country": "UK"}, {"country": "PL"}]
                m.select.return_value.execute.return_value = resp
            elif call_idx["n"] == 4:
                # language
                resp = MagicMock()
                resp.data = [{"language": "pl"}, {"language": "en"}]
                m.select.return_value.execute.return_value = resp
            elif call_idx["n"] == 5:
                # added this week
                resp = MagicMock()
                resp.count = 10
                m.select.return_value.gte.return_value.execute.return_value = resp
            return m

        mock_client.table.side_effect = table_side
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/documents/stats",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 100
        # TOTAL should be filtered out from by_type
        assert "TOTAL" not in data["by_type"]


# ===== System health endpoint tests =====


@pytest.mark.unit
class TestGetSystemHealth:
    @patch("app.health.checks.check_all_services")
    async def test_healthy_system(self, mock_check, admin_app):
        mock_check.return_value = {
            "database": MagicMock(
                model_dump=MagicMock(
                    return_value={
                        "name": "database",
                        "status": "healthy",
                        "message": "OK",
                        "response_time_ms": 5.0,
                    }
                )
            )
        }

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/system/health",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    @patch("app.health.checks.check_all_services")
    async def test_unhealthy_system(self, mock_check, admin_app):
        mock_check.return_value = {
            "database": MagicMock(
                model_dump=MagicMock(
                    return_value={
                        "name": "database",
                        "status": "unhealthy",
                        "error": "Connection refused",
                    }
                )
            )
        }

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/system/health",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "unhealthy"

    @patch("app.health.checks.check_all_services")
    async def test_health_check_exception(self, mock_check, admin_app):
        mock_check.side_effect = Exception("health check failed")

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/system/health",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"  # no services = healthy
        assert data["services"] == {}


# ===== Content stats endpoint tests =====


@pytest.mark.unit
class TestGetContentStats:
    @patch("app.api.admin.get_admin_supabase_client")
    async def test_returns_content_stats(self, mock_get_client, admin_app):
        mock_client = MagicMock()

        call_idx = {"n": 0}

        def table_side(name):
            call_idx["n"] += 1
            m = MagicMock()
            if call_idx["n"] == 1:
                resp = MagicMock()
                resp.count = 20
                m.select.return_value.execute.return_value = resp
            elif call_idx["n"] == 2:
                resp = MagicMock()
                resp.count = 15
                m.select.return_value.eq.return_value.execute.return_value = resp
            elif call_idx["n"] == 3:
                resp = MagicMock()
                resp.count = 5
                m.select.return_value.eq.return_value.execute.return_value = resp
            elif call_idx["n"] == 4:
                resp = MagicMock()
                resp.data = [{"views": 100}, {"views": 200}, {"views": None}]
                m.select.return_value.execute.return_value = resp
            return m

        mock_client.table.side_effect = table_side
        mock_get_client.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/admin/content/stats",
                headers={"Authorization": "Bearer fake"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["total_posts"] == 20
        assert data["published"] == 15
        assert data["drafts"] == 5
        assert data["total_views"] == 300


# ===== Auth enforcement tests =====


@pytest.mark.unit
class TestAdminAuthEnforcement:
    async def test_stats_requires_admin(self):
        """Without admin auth override, should be rejected."""
        from app.server import app

        # Clear any overrides
        app.dependency_overrides.clear()

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/admin/stats")
        assert response.status_code in [401, 403]

    async def test_users_requires_admin(self):
        from app.server import app

        app.dependency_overrides.clear()

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/admin/users")
        assert response.status_code in [401, 403]
