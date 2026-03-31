"""Unit tests for app.health.router module -- routing logic and cache."""

from datetime import UTC, datetime, timedelta

import pytest

from app.health.models import (
    DetailedStatusResponse,
    ServiceHealth,
    ServiceStatus,
    SystemStatus,
)
from app.health.router import (
    _get_system_status,
)

# ---------------------------------------------------------------------------
# _get_system_status
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestGetSystemStatus:
    """Tests for _get_system_status helper."""

    def _make_health(self, status: ServiceStatus) -> ServiceHealth:
        return ServiceHealth(
            name="test",
            status=status,
            last_checked=datetime.now(UTC),
        )

    def test_all_healthy(self):
        services = {
            "redis": self._make_health(ServiceStatus.HEALTHY),
            "postgresql": self._make_health(ServiceStatus.HEALTHY),
            "supabase": self._make_health(ServiceStatus.HEALTHY),
        }
        assert _get_system_status(services) == SystemStatus.HEALTHY

    def test_critical_unhealthy(self):
        services = {
            "redis": self._make_health(ServiceStatus.UNHEALTHY),
            "postgresql": self._make_health(ServiceStatus.HEALTHY),
        }
        assert _get_system_status(services) == SystemStatus.UNHEALTHY

    def test_critical_degraded(self):
        services = {
            "redis": self._make_health(ServiceStatus.HEALTHY),
            "postgresql": self._make_health(ServiceStatus.DEGRADED),
        }
        assert _get_system_status(services) == SystemStatus.DEGRADED

    def test_optional_degraded(self):
        services = {
            "redis": self._make_health(ServiceStatus.HEALTHY),
            "postgresql": self._make_health(ServiceStatus.HEALTHY),
            "supabase": self._make_health(ServiceStatus.DEGRADED),
        }
        assert _get_system_status(services) == SystemStatus.DEGRADED

    def test_optional_unhealthy(self):
        services = {
            "redis": self._make_health(ServiceStatus.HEALTHY),
            "postgresql": self._make_health(ServiceStatus.HEALTHY),
            "celery": self._make_health(ServiceStatus.UNHEALTHY),
        }
        assert _get_system_status(services) == SystemStatus.DEGRADED

    def test_empty_services(self):
        assert _get_system_status({}) == SystemStatus.HEALTHY

    def test_critical_unhealthy_takes_precedence_over_degraded(self):
        services = {
            "redis": self._make_health(ServiceStatus.UNHEALTHY),
            "postgresql": self._make_health(ServiceStatus.DEGRADED),
        }
        assert _get_system_status(services) == SystemStatus.UNHEALTHY

    def test_unknown_critical_is_not_flagged(self):
        services = {
            "redis": self._make_health(ServiceStatus.UNKNOWN),
            "postgresql": self._make_health(ServiceStatus.HEALTHY),
        }
        # UNKNOWN is not UNHEALTHY or DEGRADED, so system should be HEALTHY
        assert _get_system_status(services) == SystemStatus.HEALTHY


# ---------------------------------------------------------------------------
# _is_cache_valid
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestIsCacheValid:
    """Tests for _is_cache_valid helper."""

    def _get_router_mod(self):
        import sys

        return sys.modules["app.health.router"]

    def test_returns_false_when_cache_is_none(self):
        mod = self._get_router_mod()
        mod._status_cache = None
        mod._cache_timestamp = None
        assert mod._is_cache_valid() is False

    def test_returns_false_when_expired(self):
        mod = self._get_router_mod()
        mod._status_cache = DetailedStatusResponse(
            status=SystemStatus.HEALTHY,
            timestamp=datetime.now(UTC),
            version="test",
            environment="test",
            services={},
            response_time_ms=10.0,
        )
        # Set timestamp to well in the past
        mod._cache_timestamp = datetime.now(UTC) - timedelta(seconds=120)
        assert mod._is_cache_valid() is False

    def test_returns_true_when_fresh(self):
        import sys

        health_router_mod = sys.modules["app.health.router"]

        health_router_mod._status_cache = DetailedStatusResponse(
            status=SystemStatus.HEALTHY,
            timestamp=datetime.now(UTC),
            version="test",
            environment="test",
            services={},
            response_time_ms=10.0,
        )
        health_router_mod._cache_timestamp = datetime.now(UTC)
        assert health_router_mod._is_cache_valid() is True

    def test_cleanup(self):
        """Reset module state after tests."""
        import sys

        health_router_mod = sys.modules["app.health.router"]
        health_router_mod._status_cache = None
        health_router_mod._cache_timestamp = None
