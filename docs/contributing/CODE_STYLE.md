# Code Style Guide

Coding standards and best practices for Juddges Legal Assistant.

## Table of Contents

- [General Principles](#general-principles)
- [Python Style (Backend)](#python-style-backend)
- [TypeScript/React Style (Frontend)](#typescriptreact-style-frontend)
- [SQL Style](#sql-style)
- [Documentation Style](#documentation-style)
- [Git Commit Style](#git-commit-style)
- [File Naming Conventions](#file-naming-conventions)

## General Principles

### Code Quality

1. **Readability First**: Code is read more often than written
2. **DRY (Don't Repeat Yourself)**: Extract common logic into reusable functions
3. **KISS (Keep It Simple, Stupid)**: Favor simplicity over cleverness
4. **YAGNI (You Aren't Gonna Need It)**: Don't add functionality until needed
5. **Single Responsibility**: Each function/class should do one thing well

### Best Practices

- Write self-documenting code with clear names
- Add comments for complex logic only
- Keep functions small and focused
- Handle errors gracefully
- Write tests alongside code
- Review your own code before submitting

## Python Style (Backend)

### Tools

**Ruff**: All-in-one formatter and linter (replaces Black, isort, flake8)

```bash
# Format code
poetry run ruff format .

# Check linting
poetry run ruff check .

# Auto-fix issues
poetry run ruff check . --fix
```

### Configuration

```toml
# pyproject.toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = [
    "E",  # pycodestyle errors
    "W",  # pycodestyle warnings
    "F",  # pyflakes
    "I",  # isort
    "B",  # flake8-bugbear
    "C4", # flake8-comprehensions
]
```

### Style Rules

#### Line Length

Maximum 100 characters per line.

```python
# Good
result = process_document(
    document_id=doc_id,
    options={"include_metadata": True, "format": "json"}
)

# Bad - too long
result = process_document(document_id=doc_id, options={"include_metadata": True, "format": "json", "timeout": 30})
```

#### Imports

Order: standard library, third-party, local imports.

```python
# Standard library
import os
import sys
from datetime import datetime
from typing import List, Optional

# Third-party
from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

# Local
from app.models import Document
from app.utils import validate_id
from juddges_search.db import get_vector_db
```

#### Type Hints

Always use type hints for function signatures.

```python
# Good
def search_documents(
    query: str,
    limit: int = 20,
    filters: Optional[dict] = None
) -> List[Document]:
    """Search for documents."""
    pass

# Bad - no type hints
def search_documents(query, limit=20, filters=None):
    """Search for documents."""
    pass
```

#### Docstrings

Use Google-style docstrings for public functions.

```python
def calculate_similarity(
    embedding1: List[float],
    embedding2: List[float]
) -> float:
    """Calculate cosine similarity between two embeddings.

    Args:
        embedding1: First embedding vector
        embedding2: Second embedding vector

    Returns:
        Similarity score between 0 and 1

    Raises:
        ValueError: If embeddings have different dimensions

    Example:
        >>> emb1 = [0.1, 0.2, 0.3]
        >>> emb2 = [0.2, 0.3, 0.4]
        >>> similarity = calculate_similarity(emb1, emb2)
        >>> print(f"Similarity: {similarity:.2f}")
        Similarity: 0.99
    """
    if len(embedding1) != len(embedding2):
        raise ValueError("Embeddings must have same dimensions")

    # Implementation
    return cosine_similarity(embedding1, embedding2)
```

#### Naming Conventions

```python
# Variables and functions: snake_case
user_name = "John Doe"
def get_user_profile():
    pass

# Classes: PascalCase
class DocumentProcessor:
    pass

# Constants: UPPER_SNAKE_CASE
MAX_RESULTS = 100
DEFAULT_TIMEOUT = 30

# Private members: leading underscore
_internal_cache = {}
def _helper_function():
    pass
```

#### Error Handling

Be specific with exceptions.

```python
# Good
try:
    document = await db.get_document(doc_id)
except DocumentNotFoundError:
    logger.warning(f"Document not found: {doc_id}")
    raise HTTPException(status_code=404, detail="Document not found")
except DatabaseError as e:
    logger.error(f"Database error: {e}")
    raise HTTPException(status_code=500, detail="Database error")

# Bad - catching all exceptions
try:
    document = await db.get_document(doc_id)
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
```

#### Logging

Use loguru with appropriate levels.

```python
from loguru import logger

# Debug: Detailed information for debugging
logger.debug(f"Query parameters: {params}")

# Info: General information
logger.info(f"Processing document {doc_id}")

# Warning: Something unexpected but handled
logger.warning(f"Cache miss for key {key}")

# Error: Error that was handled
logger.error(f"Failed to process document: {error}")

# Critical: Serious error requiring immediate attention
logger.critical(f"Database connection lost")
```

#### Async/Await

Use async for I/O operations.

```python
# Good - async for database operations
async def get_document(doc_id: str) -> Document:
    """Get document from database."""
    async with db.get_connection() as conn:
        result = await conn.fetch_one(
            "SELECT * FROM judgments WHERE id = $1",
            doc_id
        )
    return Document(**result)

# Good - sync for CPU-bound operations
def calculate_embeddings(text: str) -> List[float]:
    """Calculate embeddings (CPU-bound)."""
    # Blocking operation
    return embedding_model.encode(text)
```

## TypeScript/React Style (Frontend)

### Tools

**ESLint**: Linting with Next.js configuration

```bash
# Check linting
npm run lint

# Auto-fix
npm run lint -- --fix
```

### Style Rules

#### File Structure

```typescript
// 1. Imports (React, third-party, local)
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

// 2. Types/Interfaces
interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

// 3. Component
export function SearchBar({ onSearch, placeholder }: SearchBarProps) {
  // Hooks
  const [query, setQuery] = useState("");

  // Effects
  useEffect(() => {
    // Side effects
  }, []);

  // Handlers
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  // Render
  return (
    <form onSubmit={handleSubmit}>
      {/* JSX */}
    </form>
  );
}
```

#### Component Types

Use functional components with TypeScript.

```typescript
// Good - functional component with props interface
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  );
}

// Bad - no types
export function Button({ children, onClick, variant, disabled }) {
  return <button onClick={onClick}>{children}</button>;
}
```

#### Hooks

Follow React hooks rules.

```typescript
// Good - hooks at top level
export function SearchComponent() {
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["search", query],
    queryFn: () => searchDocuments(query),
  });

  if (isLoading) return <Loading />;
  return <Results data={data} />;
}

// Bad - conditional hook
export function SearchComponent({ enabled }) {
  const [query, setQuery] = useState("");

  if (enabled) {
    // ❌ Hooks must not be in conditions
    const { data } = useQuery(/* ... */);
  }
}
```

#### Event Handlers

Use proper types for events.

```typescript
// Good - typed event handlers
const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setQuery(e.target.value);
};

const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  onSearch(query);
};

const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.stopPropagation();
  onClick?.();
};

// Bad - any type
const handleClick = (e: any) => {
  onClick();
};
```

#### Styling

Use Tailwind CSS classes, no inline styles.

```typescript
// Good - Tailwind classes
<div className="flex items-center gap-2 p-4 bg-white rounded-lg shadow">
  <Icon className="h-5 w-5 text-gray-500" />
  <span className="text-sm font-medium">Label</span>
</div>

// Bad - inline styles
<div style={{ display: "flex", padding: "16px", background: "white" }}>
  <span>Label</span>
</div>

// Good - conditional classes with clsx/cn
import { cn } from "@/lib/utils";

<button
  className={cn(
    "px-4 py-2 rounded",
    variant === "primary" && "bg-blue-500 text-white",
    variant === "secondary" && "bg-gray-200 text-gray-900",
    disabled && "opacity-50 cursor-not-allowed"
  )}
>
  {children}
</button>
```

#### State Management

Use Zustand for global state, React Query for server state.

```typescript
// Global UI state (Zustand)
import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));

// Server state (React Query)
export function useDocuments(filters: Filters) {
  return useQuery({
    queryKey: ["documents", filters],
    queryFn: () => fetchDocuments(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

#### Client vs Server Components

```typescript
// Server Component (default)
// app/page.tsx
export default async function HomePage() {
  const data = await fetch("/api/data");
  return <div>{/* No "use client" */}</div>;
}

// Client Component (interactive)
// components/SearchBar.tsx
"use client";

import { useState } from "react";

export function SearchBar() {
  const [query, setQuery] = useState("");
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

## SQL Style

### Formatting

```sql
-- Good - readable formatting
SELECT
  j.id,
  j.case_number,
  j.title,
  j.jurisdiction,
  j.decision_date
FROM judgments j
WHERE
  j.jurisdiction = 'PL'
  AND j.decision_date >= '2023-01-01'
ORDER BY j.decision_date DESC
LIMIT 10;

-- Bad - hard to read
SELECT id,case_number,title FROM judgments WHERE jurisdiction='PL' AND decision_date>='2023-01-01' ORDER BY decision_date DESC LIMIT 10;
```

### Naming Conventions

```sql
-- Tables: lowercase with underscores
CREATE TABLE judgments (...);
CREATE TABLE user_sessions (...);

-- Columns: lowercase with underscores
ALTER TABLE judgments ADD COLUMN case_type TEXT;

-- Indexes: descriptive with prefix
CREATE INDEX idx_judgments_jurisdiction ON judgments(jurisdiction);
CREATE INDEX idx_judgments_full_text ON judgments USING GIN(to_tsvector('english', full_text));

-- Functions: lowercase with underscores
CREATE FUNCTION search_judgments_by_embedding(...);
```

## Documentation Style

### Markdown

```markdown
# Main Title (H1 - once per document)

Brief introduction paragraph.

## Section (H2)

### Subsection (H3)

**Bold** for emphasis
*Italic* for terms
`code` for inline code

\`\`\`language
code block
\`\`\`

- Bullet point
- Another point

1. Numbered list
2. Second item

> Blockquote for important notes

[Link text](URL)

![Alt text](image-url)
```

### Code Examples

Always include language for syntax highlighting.

````markdown
```python
def example():
    pass
```

```typescript
function example() {}
```

```bash
npm install
```
````

### API Documentation

Include examples for all endpoints.

```markdown
### GET /api/documents

**Description:** List all documents

**Parameters:**
- `limit` (optional): Number of results (default: 20)
- `offset` (optional): Pagination offset (default: 0)

**Example Request:**
\`\`\`bash
curl -X GET "http://localhost:8004/api/documents?limit=10"
\`\`\`

**Example Response:**
\`\`\`json
{
  "results": [...],
  "total": 100
}
\`\`\`
```

## Git Commit Style

### Conventional Commits

Format: `<type>(<scope>): <subject>`

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Maintenance

**Examples:**

```bash
feat: add jurisdiction filter to search
fix(chat): resolve streaming response issue
docs: update API reference for new endpoints
refactor(db): optimize query performance
test: add unit tests for search service
chore: update dependencies
```

**Important:** No Claude Code mentions, no Co-Authored-By lines.

## File Naming Conventions

### Backend (Python)

```
snake_case.py              # Python modules
test_feature.py            # Test files (prefix with test_)
__init__.py                # Package init
```

### Frontend (TypeScript/React)

```
PascalCase.tsx             # React components
camelCase.ts               # Utilities, hooks
page.tsx                   # Next.js pages
layout.tsx                 # Next.js layouts
route.ts                   # API routes
[id].tsx                   # Dynamic routes
```

### Documentation

```
UPPERCASE.md               # Root-level docs (README.md, CONTRIBUTING.md)
kebab-case.md              # Subdirectory docs (api-reference.md)
```

### Directories

```
kebab-case/                # Multi-word directories
lowercase/                 # Single-word directories
```

---

For more information:
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [DEVELOPER_ONBOARDING.md](../getting-started/DEVELOPER_ONBOARDING.md) - Setup guide
- [TESTING.md](../testing/TESTING.md) - Testing guide
