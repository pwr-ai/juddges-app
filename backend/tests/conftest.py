"""
Pytest configuration and fixtures for Juddges backend tests.
"""

import os
import sys
from pathlib import Path

import pytest
from loguru import logger

LOCAL_TEST_PROFILE_ENV = "JUDDGES_PYTEST_PROFILE"
REMOVED_LEGACY_SCHEMA_API_ENV = "RUN_REMOVED_LEGACY_SCHEMA_API_TESTS"
TIER_MARKERS = {"unit", "integration", "e2e"}

# Pin Celery to in-memory transports before anything imports `app.workers`,
# which resolves CELERY_BROKER_URL / CELERY_BACKEND_URL once at import time.
#
# This has to happen here rather than in a fixture. `task_always_eager` does not
# stop `self.update_state()` from writing to the result backend, so with the real
# Redis URL from `.env` and no Redis running, a task's first progress report
# raises ConnectionError. The extraction task converts unexpected errors into
# per-document FAILED results and returns normally, so `result.successful()`
# stays true and the test passes having exercised only the error path — the loop
# it meant to test never ran. Setting the env first is also why `load_dotenv()`
# in app/workers.py cannot undo it: it does not override existing variables.
os.environ.setdefault("CELERY_BROKER_URL", "memory://")
os.environ.setdefault("CELERY_BACKEND_URL", "cache+memory://")

# Add backend and packages to Python path for tests
backend_dir = Path(__file__).parent.parent
packages_dir = backend_dir / "packages"

# Add backend app directory for imports like "from app.models import..."
sys.path.insert(0, str(backend_dir))

# Add individual package directories (both have nested structure schema_name/schema_name/)
# This allows both "from juddges_search.xxx" and "from schema_generator_agent.xxx" to work
# For packages with nested structure: packages/package_name/package_name/
# Add the inner package directories to sys.path
sys.path.insert(0, str(packages_dir / "juddges_search" / "juddges_search"))
sys.path.insert(
    0, str(packages_dir / "schema_generator_agent" / "schema_generator_agent")
)

# Silence Loguru output during tests; assertions should inspect behavior directly.
logger.remove()


# Removed custom event_loop fixture - pytest-asyncio handles this automatically
# If you need a session-scoped event loop, use: pytest.mark.asyncio(scope="session")


def _has_real_openai_key() -> bool:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    return bool(key) and not key.startswith("test-")


def _has_real_supabase_config() -> bool:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        return False
    if "test-supabase.local" in url:
        return False
    return not key.startswith("test-")


def _is_local_test_profile() -> bool:
    return os.getenv(LOCAL_TEST_PROFILE_ENV) == "local"


def _run_removed_legacy_schema_api_tests() -> bool:
    return os.getenv(REMOVED_LEGACY_SCHEMA_API_ENV) == "1"


def pytest_collection_modifyitems(config, items):
    """Apply the default unit tier and local-profile selection rules.

    Tests that require external services must opt into ``integration``
    explicitly. Names and paths never determine a test's tier.
    """
    local_profile = _is_local_test_profile()
    run_integration = (
        os.getenv("RUN_INTEGRATION_TESTS") == "1" and _has_real_supabase_config()
    )
    run_ai = os.getenv("RUN_AI_TESTS") == "1" and _has_real_openai_key()
    run_legacy = (
        os.getenv("RUN_LEGACY_SCHEMA_API_TESTS") == "1"
        and _run_removed_legacy_schema_api_tests()
    )
    run_performance = os.getenv("RUN_PERFORMANCE_TESTS") == "1"
    run_e2e = os.getenv("RUN_E2E_LIVE") == "1"
    deselected = []
    selected = []

    for item in items:
        nodeid = item.nodeid.replace("\\", "/")

        tier_markers = {
            marker.name for marker in item.iter_markers() if marker.name in TIER_MARKERS
        }
        if len(tier_markers) > 1:
            raise pytest.UsageError(
                f"{nodeid} has conflicting pytest tiers: "
                f"{', '.join(sorted(tier_markers))}"
            )
        if not tier_markers:
            item.add_marker(pytest.mark.unit)

        marker_names = {marker.name for marker in item.iter_markers()}
        if local_profile:
            special_tier_enabled = False
            marker_gates = {
                "e2e": run_e2e,
                "ai": run_ai,
                "legacy": run_legacy,
                "performance": run_performance,
            }
            for marker_name, enabled in marker_gates.items():
                if marker_name not in marker_names:
                    continue
                if not enabled:
                    deselected.append(item)
                    break
                special_tier_enabled = True
            else:
                if (
                    "integration" in marker_names
                    and not run_integration
                    and not special_tier_enabled
                ):
                    deselected.append(item)
                    continue
                selected.append(item)
            continue

        selected.append(item)

    if deselected:
        config.hook.pytest_deselected(items=deselected)
        items[:] = selected


@pytest.fixture
def fake_llm():
    """Yields a FakeChatModel; pre-seed responses by setting fake_llm.responses."""
    from juddges_search.testing import FakeChatModel

    return FakeChatModel(responses=[])


# Import Celery fixtures. E402 is suppressed because this import depends on the
# sys.path manipulation above (so the `tests` package is importable); F401 is
# suppressed because pytest auto-discovers the fixtures by name at collection
# time and they have no direct in-module reference.
from tests.conftest_celery import (  # noqa: E402, F401
    celery_eager,
    mocked_extractor,
    mocked_supabase,
)
