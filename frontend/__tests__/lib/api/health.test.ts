/**
 * The health client runs in the browser (the public /status page), so it must
 * only call this app's own BFF routes with relative URLs (#578). A direct
 * backend URL would be the build machine's value, e.g. http://localhost:8004.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  getDependencies,
  getDetailedStatus,
  invalidateStatusCache,
} from '@/lib/api/health';

describe('lib/api/health', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it.each([
    ['getDetailedStatus', getDetailedStatus, '/api/health/status'],
    ['getDependencies', getDependencies, '/api/health/dependencies'],
    ['invalidateStatusCache', invalidateStatusCache, '/api/health/invalidate'],
  ])('%s calls the same-origin BFF route', async (_name, call, expected) => {
    await call();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(expected);
  });

  it('does not reference a build-time backend URL', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../lib/api/health.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/process\.env\.NEXT_PUBLIC_API_BASE_URL/);
    expect(source).not.toMatch(/localhost/);
  });
});
