"""
Pytest configuration and fixtures for Juddges backend tests.
"""

import sys
from pathlib import Path
import pytest

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


def pytest_collection_modifyitems(config, items):
    """
    Modify test collection to add markers based on test names.

    This automatically marks tests that interact with external services
    as integration tests.
    """
    for item in items:
        # Auto-mark tests that use database or search as integration tests
        if "search" in item.name.lower():
            item.add_marker(pytest.mark.integration)

        # Auto-mark tests that don't require external services as unit tests
        elif not any(marker.name == "integration" for marker in item.iter_markers()):
            item.add_marker(pytest.mark.unit)
