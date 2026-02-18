# Contributing Guide

Thank you for your interest in contributing to Juddges Legal Assistant! This guide will help you get started with contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Issue Guidelines](#issue-guidelines)
- [Community](#community)

## Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behavior includes:**
- Trolling, insulting/derogatory comments, and personal attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

## How to Contribute

### Types of Contributions

We welcome many types of contributions:

1. **Bug Reports**: Report issues you encounter
2. **Feature Requests**: Suggest new features or improvements
3. **Bug Fixes**: Submit fixes for known issues
4. **New Features**: Implement new functionality
5. **Documentation**: Improve or add documentation
6. **Tests**: Add or improve test coverage
7. **Code Review**: Review pull requests from others

### Before You Start

1. **Check existing issues**: Search issues to see if someone else has reported the same thing
2. **Discuss major changes**: For significant changes, open an issue first to discuss
3. **Read the docs**: Familiarize yourself with the architecture and code style
4. **Set up your environment**: Follow the [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md) guide

## Development Setup

### Prerequisites

- Node.js 20+
- Python 3.12+
- Poetry
- Docker and Docker Compose
- Git

### Quick Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/juddges-app.git
cd juddges-app

# Add upstream remote
git remote add upstream https://github.com/original-org/juddges-app.git

# Create environment file
cp .env.example .env.secrets

# Install dependencies
cd backend && poetry install && cd ..
cd frontend && npm install && cd ..

# Start development servers
docker compose -f docker-compose.dev.yml up
```

For detailed setup instructions, see [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md).

## Code Style

### General Principles

1. **Write clean, readable code**: Code is read more than it's written
2. **Follow existing patterns**: Maintain consistency with the codebase
3. **Keep it simple**: Favor simplicity over cleverness
4. **Document complex logic**: Add comments for non-obvious code
5. **Write self-documenting code**: Use descriptive variable and function names

### Backend (Python)

**Formatting:** Use Ruff (replaces Black, isort, flake8)

```bash
cd backend

# Format code
poetry run ruff format .

# Check linting
poetry run ruff check .

# Auto-fix linting issues
poetry run ruff check . --fix
```

**Style Guide:**
- Follow PEP 8 conventions
- Use type hints for function signatures
- Write docstrings for public functions (Google style)
- Maximum line length: 100 characters
- Use meaningful variable names

**Example:**

```python
from typing import List, Optional
from loguru import logger

async def search_documents(
    query: str,
    limit: int = 20,
    filters: Optional[dict] = None
) -> List[Document]:
    """Search for documents matching the query.

    Args:
        query: Search query text
        limit: Maximum number of results to return
        filters: Optional filters to apply

    Returns:
        List of matching documents

    Raises:
        ValueError: If query is empty
        DatabaseError: If database query fails
    """
    if not query:
        raise ValueError("Query cannot be empty")

    logger.info(f"Searching for: {query}")

    # Implementation
    results = await db.search(query, limit=limit, filters=filters)

    return results
```

### Frontend (TypeScript/React)

**Linting:** ESLint with Next.js configuration

```bash
cd frontend

# Check linting
npm run lint

# Auto-fix linting issues
npm run lint -- --fix
```

**Style Guide:**
- Use TypeScript for all new code
- Follow Next.js conventions for file structure
- Use functional components with hooks
- Prefer named exports for components
- Use Tailwind CSS for styling (no inline styles)

**Example:**

```typescript
// components/search/SearchBar.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchBar({ onSearch, placeholder = "Search..." }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
```

For complete style guidelines, see [CODE_STYLE.md](./CODE_STYLE.md).

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type** (required):
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions or changes
- `chore`: Build process or tooling changes
- `perf`: Performance improvements

**Scope** (optional): The area affected (e.g., `search`, `chat`, `api`)

**Subject** (required): Brief description in imperative mood

**Body** (optional): Detailed description

**Footer** (optional): Breaking changes or issue references

### Examples

**Simple commit:**
```bash
git commit -m "feat: add jurisdiction filter to search"
```

**With scope:**
```bash
git commit -m "fix(chat): resolve streaming response issue"
```

**With body and footer:**
```bash
git commit -m "feat(api): add batch document upload endpoint

Implement batch upload endpoint that accepts multiple documents
and processes them asynchronously using Celery workers.

Closes #123"
```

**Important:** Per project guidelines:
- Do NOT include "Generated by Claude Code" or similar
- Do NOT include Co-Authored-By lines
- Do NOT include emoji in commit messages

## Pull Request Process

### Before Creating a PR

1. **Update your fork:**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes:**
   - Write clean, tested code
   - Follow code style guidelines
   - Add/update tests as needed
   - Update documentation

4. **Run tests:**
   ```bash
   # Backend
   cd backend
   poetry run pytest tests/ -v

   # Frontend
   cd frontend
   npm test
   npm run lint
   ```

5. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

### Creating the PR

1. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** on GitHub

3. **Fill out the PR template:**

   ```markdown
   ## Description
   Brief description of the changes.

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Changes Made
   - Added X feature
   - Fixed Y bug
   - Updated Z documentation

   ## Testing
   - [ ] Unit tests pass
   - [ ] Integration tests pass (if applicable)
   - [ ] Manual testing completed

   ## Screenshots (if applicable)
   Add screenshots for UI changes

   ## Checklist
   - [ ] Code follows project style guidelines
   - [ ] Self-review completed
   - [ ] Comments added for complex code
   - [ ] Documentation updated
   - [ ] Tests added/updated
   - [ ] No breaking changes (or documented)

   ## Related Issues
   Closes #123
   Related to #456
   ```

4. **Wait for review:**
   - Address reviewer feedback
   - Make requested changes
   - Push updates to the same branch

### After PR is Approved

1. **Squash commits** if requested
2. **Wait for maintainer to merge**
3. **Delete your branch** after merge

```bash
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

## Testing Requirements

### Backend Tests

**Required:**
- Unit tests for new functions/classes
- Integration tests for API endpoints
- Minimum 80% code coverage for new code

**Running tests:**
```bash
cd backend
poetry run pytest tests/ -v --cov=app --cov-report=term-missing
```

**Writing tests:**
```python
import pytest
from fastapi.testclient import TestClient

@pytest.mark.unit
def test_search_documents(client: TestClient):
    """Test document search endpoint."""
    response = client.post("/api/v1/documents/search", json={
        "query": "test query",
        "limit": 10
    })
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert isinstance(data["results"], list)
```

### Frontend Tests

**Required:**
- Unit tests for utility functions
- Component tests for UI components
- E2E tests for critical user flows

**Running tests:**
```bash
cd frontend
npm test                # Unit tests
npm run test:e2e        # E2E tests
```

**Writing tests:**
```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchBar } from "@/components/search/SearchBar";

describe("SearchBar", () => {
  it("calls onSearch with query when submitted", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);

    const input = screen.getByPlaceholderText("Search...");
    const button = screen.getByRole("button");

    fireEvent.change(input, { target: { value: "test query" } });
    fireEvent.click(button);

    expect(onSearch).toHaveBeenCalledWith("test query");
  });
});
```

For detailed testing guide, see [TESTING.md](./TESTING.md).

## Documentation

### When to Update Documentation

Update documentation when you:
- Add a new feature
- Change existing behavior
- Add/modify API endpoints
- Update configuration options
- Fix a documented bug

### Documentation Files

- **README.md**: Project overview and quick start
- **DEVELOPER_ONBOARDING.md**: Developer setup guide
- **ARCHITECTURE.md**: System architecture
- **API_REFERENCE.md**: API documentation
- **CODE_STYLE.md**: Coding standards
- **TESTING.md**: Testing guide
- **CLAUDE.md**: Claude Code instructions

### Documentation Style

- Use clear, concise language
- Include code examples
- Add screenshots for UI features
- Keep it up-to-date with code changes
- Use proper Markdown formatting

## Issue Guidelines

### Reporting Bugs

Use the bug report template:

```markdown
## Bug Description
Clear description of the bug.

## Steps to Reproduce
1. Go to...
2. Click on...
3. See error

## Expected Behavior
What you expected to happen.

## Actual Behavior
What actually happened.

## Environment
- OS: [e.g., macOS 14.2]
- Browser: [e.g., Chrome 120]
- Node version: [e.g., 20.10.0]
- Python version: [e.g., 3.12.0]

## Screenshots
Add screenshots if applicable.

## Additional Context
Any other relevant information.
```

### Requesting Features

Use the feature request template:

```markdown
## Feature Description
Clear description of the proposed feature.

## Problem It Solves
What problem does this feature solve?

## Proposed Solution
How should this feature work?

## Alternatives Considered
What alternatives have you considered?

## Additional Context
Any other relevant information.
```

## Community

### Getting Help

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and general discussion
- **Documentation**: Check docs/ directory
- **Code Comments**: Review inline comments

### Staying Updated

- **Watch the repository** for notifications
- **Read the changelog** for new releases
- **Follow project milestones** for roadmap

### Recognition

Contributors are recognized in:
- GitHub contributors page
- Release notes
- Project documentation

Thank you for contributing to Juddges Legal Assistant!
