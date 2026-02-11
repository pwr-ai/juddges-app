"""
Pytest configuration and fixtures for AI Tax backend tests.
"""

import pytest
from typing import AsyncGenerator


# Removed custom event_loop fixture - pytest-asyncio handles this automatically
# If you need a session-scoped event loop, use: pytest.mark.asyncio(scope="session")


@pytest.fixture(scope="session")
async def weaviate_connection() -> AsyncGenerator[None, None]:
    """
    Fixture to ensure Weaviate connection is available for integration tests.
    
    This fixture can be extended to include connection setup/teardown,
    test data preparation, or connection health checks.
    """
    # For now, this is a simple placeholder
    # In the future, you could add:
    # - Connection health check
    # - Test data setup/cleanup
    # - Mock data insertion for tests
    
    yield


# Pytest configuration for integration tests
def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", 
        "integration: marks tests as integration tests (require external services like Weaviate)"
    )
    config.addinivalue_line(
        "markers", 
        "unit: marks tests as unit tests (no external dependencies)"
    )


def pytest_collection_modifyitems(config, items):
    """
    Modify test collection to add markers based on test names.
    
    This automatically marks tests that interact with external services
    as integration tests.
    """
    for item in items:
        # Auto-mark tests that use weaviate or database as integration tests
        if "weaviate" in item.name.lower() or "search" in item.name.lower():
            item.add_marker(pytest.mark.integration)
        
        # Auto-mark tests that don't require external services as unit tests
        elif not any(marker.name == "integration" for marker in item.iter_markers()):
            item.add_marker(pytest.mark.unit)