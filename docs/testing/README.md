# Testing Documentation

This directory contains comprehensive testing documentation and resources for the Juddges Legal Assistant application.

## Overview

The Juddges testing strategy follows a balanced testing pyramid with:
- **80% Unit Tests**: Fast, isolated component and function tests
- **15% Integration Tests**: Cross-module and API integration tests  
- **5% E2E Tests**: Critical user journey tests

**Current Coverage**: 15.3% (29.1% backend, 1.6% frontend)  
**Target Coverage**: 70%+ (75% backend, 65% frontend)

---

## 📚 Documentation Files

### Master Planning Documents

#### [MASTER_TEST_PLAN.md](./MASTER_TEST_PLAN.md)
**The complete testing strategy document covering:**
- Testing objectives and success criteria
- Detailed breakdown of all 1,500+ planned tests
- Backend API tests (800 tests across 195 endpoints)
- Frontend component tests (400 tests across 183 components)
- E2E tests (75 critical user flows)
- Integration tests (225 tests)
- Performance and security testing
- Test infrastructure and CI/CD setup
- Execution schedule (4-week roadmap)

#### [TEST_MATRIX.csv](./TEST_MATRIX.csv)
**Endpoint-by-endpoint test tracking spreadsheet:**
- All 195 API endpoints cataloged
- Priority levels (Critical, High, Medium, Low)
- Test count per endpoint
- Status tracking (Pending, In Progress, Complete)
- Dependencies and notes
- Ownership assignments

#### [AGENT_ASSIGNMENTS.md](./AGENT_ASSIGNMENTS.md)
**Work distribution for 6 specialized test agents:**
- **Agent 1**: Backend Core APIs (Documents, Collections, Analytics) - 130 tests
- **Agent 2**: Backend Advanced APIs (Schemas, Extraction, Chat) - 195 tests
- **Agent 3**: Backend Supporting APIs (Auth, Publications, Experiments) - 175 tests
- **Agent 4**: Frontend Core UI (Search, Chat, Documents) - 140 tests
- **Agent 5**: Frontend Feature UI (Collections, Schemas, Forms) - 155 tests
- **Agent 6**: E2E & Integration Tests - 125 tests

---

## 🎯 Quick Start

### For Test Writers

1. **Choose your assignment** from [AGENT_ASSIGNMENTS.md](./AGENT_ASSIGNMENTS.md)
2. **Copy the appropriate template** from `/templates/`
3. **Follow the test patterns** in [MASTER_TEST_PLAN.md](./MASTER_TEST_PLAN.md)
4. **Update [TEST_MATRIX.csv](./TEST_MATRIX.csv)** as you complete tests

### For Project Managers

1. **Review [MASTER_TEST_PLAN.md](./MASTER_TEST_PLAN.md)** for overall strategy
2. **Track progress** using [TEST_MATRIX.csv](./TEST_MATRIX.csv)
3. **Monitor agent assignments** in [AGENT_ASSIGNMENTS.md](./AGENT_ASSIGNMENTS.md)
4. **Check daily/weekly metrics** in the master plan

### For Developers

1. **Write tests alongside code** using templates
2. **Run tests locally** before committing
3. **Aim for 80%+ coverage** in your modules
4. **Follow AAA pattern** (Arrange, Act, Assert)

---

## 📂 Templates

The `/templates/` directory contains reusable test templates:

### [backend_unit_test_template.py](./templates/backend_unit_test_template.py)
**FastAPI endpoint testing template with:**
- Fixtures for client, database, auth, sample data
- CRUD operation tests (GET, POST, PUT, DELETE)
- Error handling tests (404, 500, validation)
- Authentication tests
- Performance tests
- Comprehensive examples for all HTTP methods

**Usage:**
```bash
cp templates/backend_unit_test_template.py backend/tests/unit/test_your_module.py
# Adapt for your specific API router
```

### [frontend_component_test_template.tsx](./templates/frontend_component_test_template.tsx)
**React component testing template with:**
- Rendering tests (loading, success, error, empty states)
- User interaction tests (clicks, typing, keyboard nav)
- Props and state tests
- API integration tests (mocked with MSW)
- Accessibility tests (jest-axe)
- Edge case tests
- Performance tests

**Usage:**
```bash
cp templates/frontend_component_test_template.tsx frontend/__tests__/components/YourComponent.test.tsx
# Adapt for your specific component
```

### [e2e_test_template.spec.ts](./templates/e2e_test_template.spec.ts)
**Playwright E2E testing template with:**
- Authentication flows (sign up, sign in, sign out)
- Search flows (basic search, filters, document view)
- Chat flows (conversation, follow-ups, collections)
- Collection flows (create, add docs, export)
- Error handling (network errors, session expiration)
- Performance tests (load times, responsiveness)

**Usage:**
```bash
cp templates/e2e_test_template.spec.ts frontend/tests/e2e/your_flow.spec.ts
# Adapt for your specific user journey
```

---

## 🏗️ Test Structure

### Backend Tests
```
backend/tests/
├── conftest.py              # Shared fixtures
├── unit/                    # Unit tests (80%)
│   ├── test_documents.py
│   ├── test_collections.py
│   ├── test_schemas.py
│   ├── test_extraction.py
│   ├── test_chat.py
│   └── ...
├── integration/             # Integration tests (15%)
│   ├── test_search_flow.py
│   ├── test_extraction_pipeline.py
│   └── ...
└── e2e/                     # E2E tests (5%)
    └── test_critical_flows.py
```

### Frontend Tests
```
frontend/
├── __tests__/              # Unit tests
│   ├── components/
│   │   ├── search/
│   │   ├── chat/
│   │   ├── documents/
│   │   └── ...
│   ├── hooks/
│   └── utils/
└── tests/
    ├── integration/        # Integration tests
    └── e2e/               # E2E tests
        ├── auth.spec.ts
        ├── search.spec.ts
        ├── chat.spec.ts
        └── ...
```

---

## 🎨 Test Patterns

### AAA Pattern (Arrange, Act, Assert)
```python
def test_example():
    # Arrange: Set up test data and mocks
    mock_data = {"id": "123", "name": "Test"}
    
    # Act: Perform the action being tested
    response = client.get("/api/resource/123")
    
    # Assert: Verify the expected outcome
    assert response.status_code == 200
    assert response.json()["name"] == "Test"
```

### Test Naming Convention
```python
# Pattern: test_<function>_<scenario>_<expected_result>
def test_create_document_with_valid_data_returns_201()
def test_create_document_without_auth_returns_401()
def test_create_document_with_invalid_data_returns_422()
```

### Test Coverage Checklist
For each endpoint/component, test:
- ✅ Happy path (valid inputs)
- ✅ Invalid inputs (validation errors)
- ✅ Edge cases (empty, null, large data)
- ✅ Error scenarios (network, database, API errors)
- ✅ Authentication/authorization
- ✅ Performance (latency within limits)

---

## 🚀 Running Tests

### Backend Tests
```bash
cd backend

# Fast local profile (no integration / AI / legacy suites)
poetry run poe test-local
poetry run poe test-local-integration
poetry run poe test-local-ai
poetry run poe test-local-legacy
poetry run poe test-local-legacy-schema-api

# All tests
poetry run pytest

# Unit tests only
poetry run pytest -v -m unit

# Integration tests only
poetry run pytest -v -m integration

# Specific file
poetry run pytest tests/unit/test_documents.py

# With coverage
poetry run pytest --cov=app --cov-report=html
```

### Frontend Tests
```bash
cd frontend

# Fast local profile
npm run test:local

# Unit tests
npm run test

# Unit tests (watch mode)
npm run test:watch

# With coverage
npm run test:coverage

# E2E tests
npm run test:e2e

# E2E tests (UI mode)
npm run test:e2e:ui

# Specific E2E test
npm run test:e2e -- search.spec.ts
```

---

## 📊 Coverage Reporting

### View Coverage Reports

**Backend:**
```bash
cd backend
poetry run pytest --cov=app --cov-report=html
open htmlcov/index.html  # or xdg-open on Linux
```

**Frontend:**
```bash
cd frontend
npm run test:coverage
open coverage/index.html
```

### CI/CD Integration

Tests run automatically on:
- Every push to branches
- Every pull request
- Scheduled nightly runs

Coverage reports are uploaded to Codecov and available in PR comments.

---

## 🎯 Success Criteria

### Coverage Targets
- ✅ Backend: 75%+
- ✅ Frontend: 65%+
- ✅ Combined: 70%+
- ✅ Critical paths: 95%+

### Quality Targets
- ✅ All tests pass in CI/CD
- ✅ Performance: p95 < 2s for API endpoints
- ✅ Zero P0 bugs in production
- ✅ Flaky test rate < 1%
- ✅ Test execution time < 10 minutes

---

## 📈 Progress Tracking

### Current Status

| Module | Tests | Coverage | Status |
|--------|-------|----------|--------|
| Backend Documents API | 5/65 | 35% | 🟡 In Progress |
| Backend Collections API | 3/50 | 20% | 🟡 In Progress |
| Backend Schemas API | 0/90 | 0% | ⚪ Not Started |
| Frontend Search Components | 2/50 | 10% | 🟡 In Progress |
| Frontend Chat Components | 1/40 | 5% | 🟡 In Progress |
| E2E Critical Flows | 0/40 | 0% | ⚪ Not Started |

**Legend**: 🟢 Complete | 🟡 In Progress | ⚪ Not Started | 🔴 Blocked

### Weekly Goals

**Week 1**: Backend core APIs (Documents, Collections, Analytics)  
**Week 2**: Frontend component tests (Search, Chat, Documents)  
**Week 3**: Integration and E2E tests  
**Week 4**: Performance, security, and coverage gaps

---

## 🤝 Contributing

### Before Writing Tests
1. Review the [MASTER_TEST_PLAN.md](./MASTER_TEST_PLAN.md)
2. Check [TEST_MATRIX.csv](./TEST_MATRIX.csv) for assignments
3. Copy appropriate template from `/templates/`
4. Follow project conventions

### Test Checklist
- [ ] Tests follow AAA pattern
- [ ] Tests are independent and isolated
- [ ] Tests have descriptive names
- [ ] Edge cases are covered
- [ ] Error scenarios are tested
- [ ] Tests pass locally
- [ ] Coverage increased
- [ ] TEST_MATRIX.csv updated

### Code Review Checklist
- [ ] Tests cover new/changed functionality
- [ ] Tests follow project conventions
- [ ] Tests are well-documented
- [ ] No flaky tests
- [ ] Performance acceptable

---

## 🔗 Additional Resources

### Internal Documentation
- [MASTER_TEST_PLAN.md](./MASTER_TEST_PLAN.md) - Complete testing strategy
- [TEST_MATRIX.csv](./TEST_MATRIX.csv) - Endpoint test tracking
- [AGENT_ASSIGNMENTS.md](./AGENT_ASSIGNMENTS.md) - Work distribution

### External Resources
- [Pytest Documentation](https://docs.pytest.org/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright Documentation](https://playwright.dev/)
- [FastAPI Testing Guide](https://fastapi.tiangolo.com/tutorial/testing/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

## 📞 Support

### Questions or Issues?
- Review the [MASTER_TEST_PLAN.md](./MASTER_TEST_PLAN.md) first
- Check templates for examples
- Ask in team chat or create an issue

### Reporting Problems
- Flaky tests: Document in TEST_MATRIX.csv
- Blockers: Update AGENT_ASSIGNMENTS.md
- Coverage issues: Note in weekly sync

---

**Last Updated**: 2026-02-14  
**Version**: 1.0  
**Maintainer**: Test Architect Team
