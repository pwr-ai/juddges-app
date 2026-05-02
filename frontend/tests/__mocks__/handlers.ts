import { http, HttpResponse } from 'msw'

/**
 * Default MSW request handlers used across the unit + integration test suites.
 *
 * Tests can extend this list at runtime via `server.use(...)` for endpoint
 * overrides; per-test handlers are reset automatically by the `afterEach`
 * lifecycle wired in `tests/setup.ts`.
 */
export const handlers = [
  http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
]
