# AI Tax Backend Tests

This directory contains the test suite for the AI Tax backend application.

## Test Organization

```
tests/
├── __init__.py                    # Test suite documentation
├── conftest.py                    # Pytest configuration and fixtures
├── test_weaviate_search.py        # Weaviate search functionality tests
├── test_language_search.py        # Multi-language search tests
└── README.md                      # This file
```

## Test Types

### Integration Tests
- **Marker**: `@pytest.mark.integration`
- **Purpose**: Test functionality that requires external services (Weaviate database)
- **Requirements**: Running Weaviate instance with test data
- **Examples**: Search functionality, database operations

### Unit Tests
- **Marker**: `@pytest.mark.unit`
- **Purpose**: Test isolated functionality without external dependencies
- **Requirements**: None (pure Python logic)
- **Examples**: Data validation, utility functions

## Running Tests

### Prerequisites

1. **Install dependencies**:
   ```bash
   cd backend
   poetry install
   ```

2. **For integration tests**: Ensure Weaviate is running with test data:
   ```bash
   # Start the Docker containers
   docker compose up -d
   ```

### Available Commands

#### Basic Test Commands
```bash
# Run all tests
poetry run poe test

# Run only unit tests (no external dependencies)
poetry run poe test-unit

# Run only integration tests (requires Weaviate)
poetry run poe test-integration

# Run specific test files
poetry run poe test-search     # Weaviate search tests
poetry run poe test-language   # Language search tests
```

#### Code Coverage
```bash
# Run tests with coverage report
poetry run poe test-cov

# Generate HTML coverage report
poetry run poe test-cov-html
# View at: htmlcov/index.html
```

#### Code Quality
```bash
# Check code style and format
poetry run poe lint
poetry run poe format-check

# Auto-fix code style issues
poetry run poe lint-fix
poetry run poe format

# Run all quality checks + unit tests
poetry run poe check

# Run all quality checks + all tests
poetry run poe check-all
```

#### CI/CD Command
```bash
# Run the same checks as CI/CD pipeline
poetry run poe ci
```

## Test Environment

### Docker Container Testing
For integration tests that require Weaviate, you can run tests inside the Docker container:

```bash
# Run tests in the backend container
docker exec ai-tax-backend poetry run poe test-integration

# Run specific test file in container
docker exec ai-tax-backend poetry run poe test-search
```

### Local Development
For unit tests and development, you can run tests locally without Docker:

```bash
# Unit tests work without external services
poetry run poe test-unit

# Code quality checks work locally
poetry run poe lint
poetry run poe format
```

## Writing Tests

### Test File Naming
- Test files: `test_*.py`
- Test functions: `test_*`
- Test classes: `Test*`

### Async Tests
Use `@pytest.mark.asyncio` for async test functions:

```python
@pytest.mark.asyncio
async def test_async_function():
    result = await some_async_function()
    assert result is not None
```

### Integration Tests
Mark tests that require external services:

```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_weaviate_search():
    # Test that requires Weaviate database
    pass
```

### Test Organization
- Group related tests in the same file
- Use descriptive test names
- Add docstrings explaining test purpose
- Use appropriate markers (`@pytest.mark.integration`, `@pytest.mark.unit`)

## Debugging Tests

### Verbose Output
```bash
# Run with verbose output
poetry run poe test -v

# Run with extra verbose output
poetry run poe test -vv
```

### Run Specific Tests
```bash
# Run specific test function
pytest tests/test_weaviate_search.py::test_search_documents_copyright_infringement -v

# Run tests matching pattern
pytest tests/ -k "language" -v
```

### Debug Mode
```bash
# Run with Python debugger
pytest tests/ --pdb

# Stop on first failure
pytest tests/ -x
```

## Continuous Integration

The test setup is designed to work in CI/CD environments:

- **Unit tests** run quickly without external dependencies
- **Integration tests** require proper service setup
- **Code quality** checks ensure consistent style
- **Coverage reports** track test effectiveness

Use `poetry run poe ci` to run the same checks as the CI pipeline.