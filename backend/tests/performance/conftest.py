"""Pytest configuration for performance tests."""

import pytest


def pytest_configure(config):
    """Register performance marker."""
    config.addinivalue_line("markers", "performance: mark test as performance test")


def pytest_addoption(parser):
    """Add custom command line options."""
    parser.addoption(
        "--performance",
        action="store_true",
        default=False,
        help="run performance tests",
    )


def pytest_collection_modifyitems(config, items):
    """Modify test collection based on markers."""
    if config.getoption("--performance"):
        # Run performance tests
        return

    # Skip performance tests unless explicitly requested
    skip_performance = pytest.mark.skip(reason="need --performance option to run")
    for item in items:
        if "performance" in item.keywords:
            item.add_marker(skip_performance)
