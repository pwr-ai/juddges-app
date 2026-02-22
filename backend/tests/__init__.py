"""
Test suite for Juddges backend.

This test suite includes:
- Integration tests for search functionality
- Language-based filtering tests
- Multi-language search tests

Tests are organized by functionality and marked with appropriate pytest markers:
- @pytest.mark.integration: Tests that require external services
- @pytest.mark.unit: Pure unit tests (no external dependencies)

To run tests:
- All tests: poetry run poe test
- Search tests only: poetry run poe test-search
- Language tests only: poetry run poe test-language
- With coverage: poetry run poe test-cov
"""