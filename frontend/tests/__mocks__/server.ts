import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/**
 * MSW server (Node) for Jest test runs.
 *
 * Opt-in usage: tests that need MSW interception should call `setupMsw()`
 * once at the top of the file (or in a describe block). MSW is intentionally
 * NOT started in the global `tests/setup.ts` because the existing test
 * corpus contains many suites that assign `global.fetch = jest.fn()`
 * directly; MSW's interceptor would silently clobber those assignments.
 *
 * Example:
 *   describe('something', () => {
 *     setupMsw()
 *     it('intercepts', async () => {
 *       server.use(http.get('/api/x', () => HttpResponse.json({})))
 *       ...
 *     })
 *   })
 */
export const server = setupServer(...handlers)

/**
 * Wires MSW lifecycle hooks (`listen`/`resetHandlers`/`close`) into the
 * surrounding describe/test scope. Saves and restores the previous
 * `global.fetch` so leaving the suite does not leak the MSW interceptor
 * into subsequent suites that rely on a manual fetch mock.
 */
export function setupMsw() {
  let savedFetch: typeof fetch | undefined

  beforeAll(() => {
    savedFetch = global.fetch
    server.listen({ onUnhandledRequest: 'bypass' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
    if (savedFetch !== undefined) {
      global.fetch = savedFetch
    }
  })
}
