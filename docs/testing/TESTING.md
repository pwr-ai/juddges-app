# Testing Guide

Comprehensive testing strategy and guidelines for Juddges Legal Assistant.

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Testing Stack](#testing-stack)
- [Backend Testing](#backend-testing)
- [Frontend Testing](#frontend-testing)
- [Integration Testing](#integration-testing)
- [E2E Testing](#e2e-testing)
- [Test Coverage](#test-coverage)
- [Best Practices](#best-practices)
- [CI/CD Testing](#cicd-testing)

## Testing Philosophy

### Why We Test

1. **Catch bugs early**: Find issues before they reach production
2. **Enable refactoring**: Change code with confidence
3. **Document behavior**: Tests serve as living documentation
4. **Improve design**: Writing tests leads to better code structure
5. **Prevent regressions**: Ensure fixes stay fixed

### Testing Pyramid

```
       /\
      /  \     E2E Tests (Few, Slow, High-level)
     /____\
    /      \   Integration Tests (Some, Medium, Multi-component)
   /        \
  /__________\ Unit Tests (Many, Fast, Single-component)
```

**Target Distribution:**
- 70% Unit Tests: Fast, isolated, test individual functions
- 20% Integration Tests: Test component interactions
- 10% E2E Tests: Test complete user flows

## Testing Stack

### Backend

- **Framework**: pytest
- **Markers**: `@pytest.mark.unit`, `@pytest.mark.integration`
- **Coverage**: pytest-cov
- **Async Testing**: pytest-asyncio
- **Fixtures**: pytest fixtures for setup/teardown
- **Mocking**: unittest.mock, pytest-mock

### Frontend

- **Unit Testing**: Jest + Testing Library
- **E2E Testing**: Playwright
- **Component Testing**: React Testing Library
- **Coverage**: Jest coverage reports
- **Mocking**: Jest mocks, MSW for API mocking

## Backend Testing

### Setup

```bash
cd backend

# Install test dependencies
poetry install

# Run all tests
poetry run pytest tests/ -v

# Run with coverage
poetry run pytest tests/ --cov=app --cov-report=html
```

### Test Structure

```
backend/tests/
├── conftest.py              # Shared fixtures
├── app/
│   ├── test_documents.py    # Document endpoint tests
│   ├── test_search.py       # Search endpoint tests
│   └── test_analytics.py    # Analytics endpoint tests
└── packages/
    └── juddges_search/
        ├── test_chains.py   # LangChain tests
        └── test_db.py       # Database tests
```

### Unit Tests

Test individual functions in isolation.

```python
# tests/app/test_utils.py
import pytest
from app.utils import validate_id_format, parse_date

@pytest.mark.unit
def test_validate_id_format_valid():
    """Test ID validation with valid UUID."""
    valid_id = "550e8400-e29b-41d4-a716-446655440000"
    assert validate_id_format(valid_id) is True

@pytest.mark.unit
def test_validate_id_format_invalid():
    """Test ID validation with invalid UUID."""
    invalid_id = "not-a-uuid"
    assert validate_id_format(invalid_id) is False

@pytest.mark.unit
@pytest.mark.parametrize("date_str,expected", [
    ("2024-01-15", "2024-01-15"),
    ("2024-01-15T10:30:00Z", "2024-01-15"),
    ("invalid", None),
])
def test_parse_date(date_str, expected):
    """Test date parsing with various formats."""
    result = parse_date(date_str)
    if expected:
        assert result.strftime("%Y-%m-%d") == expected
    else:
        assert result is None
```

### Integration Tests

Test component interactions with real dependencies.

```python
# tests/app/test_documents.py
import pytest
from fastapi.testclient import TestClient
from app.server import app

@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)

@pytest.mark.integration
def test_search_documents(client):
    """Test document search endpoint."""
    response = client.post(
        "/api/v1/documents/search",
        json={
            "query": "contract law",
            "filters": {"jurisdiction": "PL"},
            "limit": 10
        },
        headers={"X-API-Key": "test-api-key"}
    )

    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert isinstance(data["results"], list)
    assert len(data["results"]) <= 10
    assert "total" in data
    assert all(r["jurisdiction"] == "PL" for r in data["results"])

@pytest.mark.integration
async def test_vector_search():
    """Test vector database search."""
    from juddges_search.db.supabase_db import get_vector_db

    db = get_vector_db()
    results = await db.similarity_search(
        query="contract interpretation",
        k=5
    )

    assert len(results) <= 5
    assert all(hasattr(r, "document_id") for r in results)
    assert all(hasattr(r, "score") for r in results)
```

### Fixtures

Reusable test setup.

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from app.server import app

@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)

@pytest.fixture
def api_key():
    """Test API key."""
    return "test-api-key"

@pytest.fixture
def sample_document():
    """Sample document for testing."""
    return {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "case_number": "I CSK 123/2023",
        "title": "Test Case",
        "jurisdiction": "PL",
        "full_text": "Test judgment text"
    }

@pytest.fixture
async def db_connection():
    """Database connection for testing."""
    from juddges_search.db.supabase_db import get_vector_db

    db = get_vector_db()
    yield db
    # Cleanup if needed
```

### Mocking

Mock external dependencies.

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.unit
@patch("app.documents.generate_embedding")
async def test_search_with_mocked_embeddings(mock_generate):
    """Test search with mocked embedding generation."""
    # Mock the embedding generation
    mock_generate.return_value = [0.1] * 1536

    from app.documents import search_documents

    results = await search_documents("test query")

    # Verify embedding was generated
    mock_generate.assert_called_once_with("test query")
    assert isinstance(results, list)
```

### Async Testing

Test async functions.

```python
import pytest

@pytest.mark.asyncio
async def test_async_document_fetch():
    """Test async document fetching."""
    from app.documents import get_document_by_id

    doc_id = "550e8400-e29b-41d4-a716-446655440000"
    document = await get_document_by_id(doc_id)

    assert document is not None
    assert document.id == doc_id
```

### Running Backend Tests

```bash
# All tests
poetry run pytest tests/ -v

# Unit tests only (fast)
poetry run pytest tests/ -v -m unit

# Integration tests only (slower)
poetry run pytest tests/ -v -m integration

# Specific test file
poetry run pytest tests/app/test_documents.py -v

# Specific test function
poetry run pytest tests/app/test_documents.py::test_search_documents -v

# With coverage
poetry run pytest tests/ --cov=app --cov-report=html
open htmlcov/index.html

# Using Poe tasks
poetry run poe test
poetry run poe test-unit
poetry run poe test-integration
poetry run poe test-cov
```

## Frontend Testing

### Setup

```bash
cd frontend

# Install dependencies
npm install

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Structure

```
frontend/__tests__/
├── components/
│   ├── ui/
│   │   ├── Button.test.tsx
│   │   └── Input.test.tsx
│   ├── search/
│   │   ├── SearchBar.test.tsx
│   │   └── SearchResults.test.tsx
│   └── chat/
│       └── ChatInterface.test.tsx
├── lib/
│   ├── utils.test.ts
│   └── api/
│       └── documents.test.ts
└── hooks/
    └── useSearch.test.ts
```

### Component Tests

Test React components.

```typescript
// __tests__/components/search/SearchBar.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBar } from "@/components/search/SearchBar";

describe("SearchBar", () => {
  it("renders with placeholder", () => {
    render(<SearchBar onSearch={jest.fn()} />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("calls onSearch when form is submitted", async () => {
    const onSearch = jest.fn();
    const user = userEvent.setup();

    render(<SearchBar onSearch={onSearch} />);

    const input = screen.getByPlaceholderText("Search...");
    const button = screen.getByRole("button", { name: /search/i });

    await user.type(input, "contract law");
    await user.click(button);

    expect(onSearch).toHaveBeenCalledWith("contract law");
  });

  it("does not call onSearch with empty query", async () => {
    const onSearch = jest.fn();
    const user = userEvent.setup();

    render(<SearchBar onSearch={onSearch} />);

    const button = screen.getByRole("button", { name: /search/i });
    await user.click(button);

    expect(onSearch).not.toHaveBeenCalled();
  });
});
```

### Hook Tests

Test custom React hooks.

```typescript
// __tests__/hooks/useSearch.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSearch } from "@/hooks/useSearch";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe("useSearch", () => {
  it("returns search results", async () => {
    const { result } = renderHook(
      () => useSearch({ query: "contract law" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.results).toBeInstanceOf(Array);
  });

  it("handles empty query", async () => {
    const { result } = renderHook(
      () => useSearch({ query: "" }),
      { wrapper: createWrapper() }
    );

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
```

### Utility Tests

Test utility functions.

```typescript
// __tests__/lib/utils.test.ts
import { cn, formatDate, truncateText } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("class1", "class2")).toBe("class1 class2");
  });

  it("handles conditional classes", () => {
    const isActive = true;
    expect(cn("base", isActive && "active")).toBe("base active");
  });
});

describe("formatDate", () => {
  it("formats ISO date", () => {
    const date = "2024-02-13T10:30:00Z";
    expect(formatDate(date)).toBe("Feb 13, 2024");
  });

  it("handles invalid date", () => {
    expect(formatDate("invalid")).toBe("Invalid date");
  });
});

describe("truncateText", () => {
  it("truncates long text", () => {
    const text = "This is a very long text that should be truncated";
    expect(truncateText(text, 20)).toBe("This is a very lo...");
  });

  it("does not truncate short text", () => {
    const text = "Short text";
    expect(truncateText(text, 20)).toBe("Short text");
  });
});
```

### API Mocking

Mock API calls with MSW (Mock Service Worker).

```typescript
// __tests__/mocks/handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.post("/api/v1/documents/search", () => {
    return HttpResponse.json({
      results: [
        {
          id: "1",
          title: "Test Document",
          case_number: "I CSK 123/2023",
        },
      ],
      total: 1,
    });
  }),

  http.get("/api/v1/documents/:id", ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      title: "Test Document",
      full_text: "Document content",
    });
  }),
];

// __tests__/setup.ts
import { setupServer } from "msw/node";
import { handlers } from "./mocks/handlers";

export const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Running Frontend Tests

```bash
# All tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Coverage report
npm run test:coverage

# Specific test file
npm test -- SearchBar.test.tsx

# Update snapshots
npm test -- -u

# Verbose output
npm test -- --verbose
```

## E2E Testing

### Setup

```bash
cd frontend

# Install Playwright
npx playwright install

# Run E2E tests
npm run test:e2e

# Run with UI (visual debugger)
npm run test:e2e:ui

# Run specific suite
npm run test:e2e:search
```

### E2E Test Structure

```
frontend/tests/e2e/
├── auth/
│   └── login.spec.ts
├── search/
│   ├── basic-search.spec.ts
│   └── advanced-search.spec.ts
├── chat/
│   └── conversation.spec.ts
└── documents/
    └── document-view.spec.ts
```

### E2E Test Examples

```typescript
// tests/e2e/search/basic-search.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Document Search", () => {
  test("search for documents", async ({ page }) => {
    await page.goto("http://localhost:3007/search");

    // Enter search query
    await page.fill('input[name="query"]', "contract law");
    await page.click('button[type="submit"]');

    // Wait for results
    await expect(page.locator(".search-results")).toBeVisible();

    // Verify results
    const results = page.locator(".result-item");
    await expect(results).toHaveCount(10);

    // Verify result content
    const firstResult = results.first();
    await expect(firstResult).toContainText("contract");
  });

  test("filter by jurisdiction", async ({ page }) => {
    await page.goto("http://localhost:3007/search");

    // Enter query
    await page.fill('input[name="query"]', "contract law");

    // Select jurisdiction filter
    await page.click('button[aria-label="Jurisdiction"]');
    await page.click('text=Poland (PL)');

    // Submit search
    await page.click('button[type="submit"]');

    // Verify filtered results
    await expect(page.locator(".result-item")).toHaveCount(10);
    const jurisdictions = await page.locator(".result-jurisdiction").allTextContents();
    expect(jurisdictions.every(j => j === "PL")).toBe(true);
  });

  test("paginate through results", async ({ page }) => {
    await page.goto("http://localhost:3007/search");

    // Search
    await page.fill('input[name="query"]', "contract");
    await page.click('button[type="submit"]');

    // Go to page 2
    await page.click('button[aria-label="Next page"]');

    // Verify pagination
    await expect(page.locator('text=Page 2')).toBeVisible();
  });
});
```

## Test Coverage

### Target Coverage

- **Unit Tests**: 80%+ coverage
- **Integration Tests**: 60%+ coverage
- **E2E Tests**: Critical paths only

### Generate Coverage Reports

**Backend:**
```bash
cd backend
poetry run pytest tests/ --cov=app --cov-report=html --cov-report=term-missing
open htmlcov/index.html
```

**Frontend:**
```bash
cd frontend
npm run test:coverage
open coverage/lcov-report/index.html
```

### Coverage Metrics

- **Line Coverage**: Percentage of code lines executed
- **Branch Coverage**: Percentage of conditional branches tested
- **Function Coverage**: Percentage of functions called
- **Statement Coverage**: Percentage of statements executed

## Best Practices

### General

1. **Test behavior, not implementation**: Focus on what, not how
2. **Write clear test names**: Test name should describe expected behavior
3. **One assertion per test**: Or at least, one concept per test
4. **Arrange-Act-Assert**: Structure tests clearly
5. **Keep tests independent**: Each test should run in isolation
6. **Use fixtures/factories**: Reuse test data setup
7. **Test edge cases**: Empty inputs, boundaries, errors

### Naming

```python
# Good - descriptive test names
def test_search_returns_empty_list_when_no_results_found():
    pass

def test_search_raises_error_when_query_too_short():
    pass

# Bad - unclear names
def test_search():
    pass

def test_error():
    pass
```

### Assertions

```python
# Good - specific assertions
assert len(results) == 10
assert result.status_code == 200
assert "error" not in response.json()

# Bad - vague assertions
assert results
assert response
```

### Test Data

```python
# Good - use factories/fixtures
@pytest.fixture
def sample_documents():
    return [
        create_document(title="Doc 1"),
        create_document(title="Doc 2"),
    ]

# Bad - hardcoded data in tests
def test_search():
    doc1 = {"id": "1", "title": "Doc 1", ...}
    doc2 = {"id": "2", "title": "Doc 2", ...}
```

## CI/CD Testing

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: "3.12"
      - name: Install dependencies
        run: |
          cd backend
          pip install poetry
          poetry install
      - name: Run tests
        run: |
          cd backend
          poetry run pytest tests/ -v --cov=app

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
      - name: Install dependencies
        run: |
          cd frontend
          npm install
      - name: Run tests
        run: |
          cd frontend
          npm test -- --coverage
```

---

For more information:
- [DEVELOPER_ONBOARDING.md](../getting-started/DEVELOPER_ONBOARDING.md) - Setup guide
- [CODE_STYLE.md](../contributing/CODE_STYLE.md) - Coding standards
- [CONTRIBUTING.md](../contributing/CONTRIBUTING.md) - Contribution guidelines
