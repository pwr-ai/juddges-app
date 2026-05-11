# Testing Documentation

Testing strategy and guidelines for Juddges Legal Assistant.

## Documents

- [TESTING.md](./TESTING.md) — testing philosophy, stack, patterns, and CI/CD notes.

The dated multi-week test plan (`MASTER_TEST_PLAN.md`) was archived to `.context/plans/master-test-plan.md` once it stopped reflecting current coverage targets.

## Pyramid

- ~80% unit tests (fast, isolated)
- ~15% integration tests (cross-module, API)
- ~5% E2E tests (critical user journeys)

## Running tests

### Backend
```bash
cd backend
poetry run poe test-local                       # fast local profile
poetry run pytest -v -m unit                     # unit only
poetry run pytest -v -m integration              # integration only
poetry run pytest --cov=app --cov-report=html    # with coverage
```

### Frontend
```bash
cd frontend
npm run test:local           # fast local profile
npm run test                 # unit
npm run test:watch
npm run test:coverage
npm run test:e2e             # Playwright
npm run test:e2e:ui
```

## Conventions

- AAA pattern (Arrange / Act / Assert).
- Name tests `test_<function>_<scenario>_<expected_result>`.
- Cover happy path, invalid input, edge cases, auth/authz, error scenarios.
- Tests must be independent and isolated.

## Coverage reports

- Backend: `htmlcov/index.html` after `pytest --cov=app --cov-report=html`.
- Frontend: `coverage/index.html` after `npm run test:coverage`.

See [TESTING.md](./TESTING.md) for the full guide.
