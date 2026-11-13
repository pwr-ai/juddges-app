/**
 * Regression coverage for the production local-origin guard (#578).
 *
 * The prod image was built from a developer `.env`, so prerendered pages
 * shipped `"NEXT_PUBLIC_API_BASE_URL":"http://localhost:8004"` to every
 * visitor. The guard must fail on that, and on the RSC payload copy of it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Plain CommonJS so the Dockerfile can run it with `node`; requiring it keeps
// the test on exactly what the image build runs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const guard = require('../../scripts/assert-no-local-origins');

const { findLocalOrigins, scanBuild, formatReport } = guard;

describe('findLocalOrigins', () => {
  it('flags the #578 baseline baked into a prerendered page', () => {
    const html =
      '<script>window.__env={"NEXT_PUBLIC_API_BASE_URL":"http://localhost:8004"}</script>';
    expect(findLocalOrigins(html)).toEqual(['http://localhost:8004']);
  });

  it.each([
    'http://127.0.0.1:4311',
    'https://LOCALHOST',
    'http://0.0.0.0:3000',
    'http://[::1]:8002',
  ])('flags %s', (origin) => {
    expect(findLocalOrigins(`fetch("${origin}/api")`)).toEqual([origin.toLowerCase()]);
  });

  it('ignores public origins and the supabase-js GoTrue default', () => {
    const chunk =
      'let rX={url:"http://localhost:9999",storageKey:"sb"};' +
      'fetch("https://juddges-api.augustyniak.ai/health")';
    expect(findLocalOrigins(chunk)).toEqual([]);
  });
});

describe('scanBuild', () => {
  let nextDir: string;

  beforeEach(() => {
    nextDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-origins-'));
  });

  afterEach(() => {
    fs.rmSync(nextDir, { recursive: true, force: true });
  });

  function write(relative: string, content: string) {
    const file = path.join(nextDir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  it('reports browser-facing files and skips server-only chunks', () => {
    write('static/chunks/app.js', 'fetch("http://localhost:8004/health")');
    write(
      'server/app/status.html',
      '{"NEXT_PUBLIC_API_BASE_URL":"http://localhost:8004"}'
    );
    write(
      'server/app/status.rsc',
      '{\\"NEXT_PUBLIC_API_BASE_URL\\":\\"http://localhost:8004\\"}'
    );
    // A server route-handler fallback never reaches the browser.
    write('server/app/api/health/status/route.js', '"http://localhost:8004"');

    const offenders = scanBuild(nextDir);

    expect(Object.keys(offenders).sort()).toEqual([
      path.join('server', 'app', 'status.html'),
      path.join('server', 'app', 'status.rsc'),
      path.join('static', 'chunks', 'app.js'),
    ]);
    expect(formatReport(offenders)).toContain('http://localhost:8004');
  });

  it('passes a clean build', () => {
    write('static/chunks/app.js', 'fetch("/api/health/status")');
    write('server/app/status.html', '{"NEXT_PUBLIC_SUPABASE_URL":"https://x.supabase.co"}');

    expect(scanBuild(nextDir)).toEqual({});
  });
});
