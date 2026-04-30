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


# Pytest configuration for integration tests
def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers",
        "integration: marks tests as integration tests (require external services)",
    )
    config.addinivalue_line(
        "markers", "unit: marks tests as unit tests (no external dependencies)"
    )
    config.addinivalue_line(
        "markers", "slow: marks tests as slow-running tests (e.g., full workflow tests)"
    )
    config.addinivalue_line("markers", "api: marks tests as API integration tests")
    config.addinivalue_line("markers", "auth: marks tests as authentication tests")
    config.addinivalue_line(
        "markers", "ai: marks tests that require a live LLM/API key"
    )
    config.addinivalue_line(
        "markers", "legacy: marks tests for deprecated API surfaces"
    )


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


def pytest_ignore_collect(collection_path, config):
    """
    Avoid collecting suites that are disabled in the current local profile.

    This keeps the default test output compact instead of collecting tests only to skip
    them one-by-one.
    """
    if not _is_local_test_profile():
        return False

    path = str(collection_path).replace("\\", "/")
    run_integration = (
        os.getenv("RUN_INTEGRATION_TESTS") == "1" and _has_real_supabase_config()
    )
    run_ai = os.getenv("RUN_AI_TESTS") == "1" and _has_real_openai_key()
    run_legacy_schema_api = os.getenv("RUN_LEGACY_SCHEMA_API_TESTS") == "1"
    run_removed_legacy_schema_api = _run_removed_legacy_schema_api_tests()
    run_performance = os.getenv("RUN_PERFORMANCE_TESTS") == "1"

    if "/tests/app/schemas_extraction/" in path and (
        not run_legacy_schema_api or not run_removed_legacy_schema_api
    ):
        return True

    if not run_ai and path.endswith(
        "/tests/packages/schema_generator_agent/test_agents.py"
    ):
        return True

    if not run_ai and path.endswith(
        "/tests/packages/schema_generator_agent/test_workflow.py"
    ):
        return True

    if not run_performance and "/tests/performance/" in path:
        return True

    return not run_integration and path.endswith("_integration.py")


def pytest_collection_modifyitems(config, items):
    """
    Modify test collection to add markers based on test names.

    This automatically marks tests that interact with external services
    as integration tests.
    """
    local_profile = _is_local_test_profile()
    run_integration = (
        os.getenv("RUN_INTEGRATION_TESTS") == "1" and _has_real_supabase_config()
    )
    run_ai = os.getenv("RUN_AI_TESTS") == "1"
    run_legacy_schema_api = os.getenv("RUN_LEGACY_SCHEMA_API_TESTS") == "1"
    run_removed_legacy_schema_api = _run_removed_legacy_schema_api_tests()
    deselected = []
    selected = []

    for item in items:
        nodeid = item.nodeid.replace("\\", "/")

        # Auto-mark tests that use database or search as integration tests
        if "search" in item.name.lower():
            item.add_marker(pytest.mark.integration)

        # Auto-mark tests that don't require external services as unit tests
        elif not any(marker.name == "integration" for marker in item.iter_markers()):
            item.add_marker(pytest.mark.unit)

        is_legacy_schema_suite = nodeid.startswith("tests/app/schemas_extraction/")

        if is_legacy_schema_suite:
            item.add_marker(pytest.mark.legacy)
            if local_profile and (
                not run_legacy_schema_api or not run_removed_legacy_schema_api
            ):
                deselected.append(item)
                continue

        ai_required = False
        if (
            nodeid.startswith("tests/packages/schema_generator_agent/test_agents.py")
            or nodeid.startswith(
                "tests/packages/schema_generator_agent/test_workflow.py"
            )
            or (
                nodeid.startswith(
                    "tests/packages/schema_generator_agent/test_edge_cases.py"
                )
                and item.name
                in {
                    "test_empty_user_input_handling",
                    "test_very_long_user_input",
                }
            )
        ):
            ai_required = True

        if ai_required:
            item.add_marker(pytest.mark.ai)
            if local_profile and (not run_ai or not _has_real_openai_key()):
                deselected.append(item)
                continue

        if local_profile and any(
            marker.name == "integration" for marker in item.iter_markers()
        ):
            if not run_integration and not is_legacy_schema_suite:
                deselected.append(item)
                continue

        skip_marker = item.get_closest_marker("skip")
        if (
            local_profile
            and skip_marker
            and skip_marker.kwargs.get("reason")
            in {
                "Batch similar documents endpoint is not part of the current API.",
                "Requires running FastAPI app",
            }
        ):
            deselected.append(item)
            continue

        selected.append(item)

    if deselected:
        config.hook.pytest_deselected(items=deselected)
        items[:] = selected
