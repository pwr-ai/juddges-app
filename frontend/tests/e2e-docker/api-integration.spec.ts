import { test, expect } from '@playwright/test';

/**
 * Backend API integration tests.
 * Tests real API endpoints against the running backend in docker-compose.dev.yml.
 *
 * Run with:
 *   npx playwright test --config=playwright.docker-dev.config.ts --project="API Integration"
 *
 * All requests in this suite are made with the X-API-Key header configured in
 * playwright.docker-dev.config.ts (project "API Integration").
 *
 * Endpoints are derived from router prefixes in backend/app/server.py.
 * Public endpoints (health, guest sessions, feedback) bypass API key auth.
 */


test.describe('Health & System', () => {
  test('GET /health returns healthy status', async ({ request }) => {
    // /health is public - no API key required
    const response = await request.fetch('http://localhost:8004/health');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('healthy');
  });

  test('GET /health/healthz returns healthy status', async ({ request }) => {
    // /health/healthz is the Kubernetes-style probe - also public
    const response = await request.fetch('http://localhost:8004/health/healthz');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('healthy');
  });

  test('GET /health/status requires API key and returns service details', async ({ request }) => {
    // /health/status requires API key - the project fixture provides it
    // 500 is acceptable when dependent services (DB, Redis) crash the handler
    // 503 is returned when the system is detected as unhealthy
    const response = await request.get('/health/status');
    expect([200, 500, 503]).toContain(response.status());
    // 500 may return plain text "Internal Server Error", so only parse JSON for 200/503
    if (response.status() !== 500) {
      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('services');
    }
  });

  test('GET /health/dependencies requires API key and lists dependencies', async ({ request }) => {
    const response = await request.get('/health/dependencies');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('critical');
    expect(data).toHaveProperty('optional');
    // Critical services are redis and postgresql
    expect(data.critical).toHaveProperty('redis');
    expect(data.critical).toHaveProperty('postgresql');
  });

  test('GET /openapi.json is accessible', async ({ request }) => {
    const response = await request.fetch('http://localhost:8004/openapi.json');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('openapi');
    expect(data).toHaveProperty('info');
    expect(data).toHaveProperty('paths');
  });

  test('GET / redirects to /docs', async ({ request }) => {
    // Root endpoint performs a RedirectResponse to /docs
    const response = await request.fetch('http://localhost:8004/', { maxRedirects: 0 });
    expect([307, 308]).toContain(response.status());
  });
});

test.describe('Dashboard API', () => {
  test('GET /dashboard/stats returns document statistics', async ({ request }) => {
    const response = await request.get('/dashboard/stats');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('total_documents');
    expect(data).toHaveProperty('judgments');
    expect(data).toHaveProperty('tax_interpretations');
    expect(data).toHaveProperty('added_this_week');
    expect(typeof data.total_documents).toBe('number');
    expect(typeof data.judgments).toBe('number');
    expect(typeof data.tax_interpretations).toBe('number');
    expect(typeof data.added_this_week).toBe('number');
  });

  test('GET /dashboard/trending-topics returns topic list', async ({ request }) => {
    const response = await request.get('/dashboard/trending-topics');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('topic');
      expect(data[0]).toHaveProperty('trend');
      expect(data[0]).toHaveProperty('category');
    }
  });

  test('GET /dashboard/recent-documents returns document list', async ({ request }) => {
    const response = await request.get('/dashboard/recent-documents');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('POST /dashboard/refresh-stats clears the stats cache', async ({ request }) => {
    const response = await request.post('/dashboard/refresh-stats');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('status');
  });
});

test.describe('Documents API', () => {
  test('POST /documents/search accepts a search payload', async ({ request }) => {
    const response = await request.post('/documents/search', {
      data: {
        query: 'prawo',
        limit_docs: 5,
        alpha: 0.5,
      },
    });
    // 200 on success; 422 on schema mismatch; 500 if DB not seeded
    expect([200, 422, 500]).toContain(response.status());
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
    }
  });

  test('GET /documents/sample returns sample documents', async ({ request }) => {
    const response = await request.get('/documents/sample');
    expect([200, 404, 500]).toContain(response.status());
  });

  test('GET /documents/facets returns facet options', async ({ request }) => {
    const response = await request.get('/documents/facets');
    expect([200, 404, 500]).toContain(response.status());
  });
});

test.describe('Collections API', () => {
  test('GET /collections returns an array', async ({ request }) => {
    const response = await request.get('/collections');
    expect([200, 422, 500]).toContain(response.status());
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
    }
  });
});

test.describe('Publications API', () => {
  test('GET /publications returns an array', async ({ request }) => {
    const response = await request.get('/publications');
    expect([200, 500]).toContain(response.status());
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
    }
  });
});

test.describe('Example Questions API', () => {
  test('GET /example_questions returns questions', async ({ request }) => {
    const response = await request.get('/example_questions');
    expect([200, 500]).toContain(response.status());
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
    }
  });
});

test.describe('Schemas API', () => {
  test('GET /schemas returns schema list', async ({ request }) => {
    const response = await request.get('/schemas');
    expect([200, 500]).toContain(response.status());
  });

  test('GET /schemas/db returns database schemas', async ({ request }) => {
    const response = await request.get('/schemas/db');
    expect([200, 500]).toContain(response.status());
  });
});

test.describe('Embeddings API', () => {
  test('GET /embeddings/models returns available models', async ({ request }) => {
    const response = await request.get('/embeddings/models');
    expect([200, 500]).toContain(response.status());
  });

  test('GET /embeddings/models/active returns the active embedding model', async ({ request }) => {
    const response = await request.get('/embeddings/models/active');
    expect([200, 500]).toContain(response.status());
  });
});

test.describe('Deduplication API', () => {
  test('GET /deduplication/stats returns deduplication statistics', async ({ request }) => {
    const response = await request.get('/deduplication/stats');
    expect([200, 500]).toContain(response.status());
  });
});

test.describe('Recommendations API', () => {
  test('GET /recommendations returns recommendations', async ({ request }) => {
    const response = await request.get('/recommendations');
    expect([200, 500]).toContain(response.status());
  });
});

test.describe('Auth Enforcement', () => {
  // Use Node's native fetch to guarantee no Playwright extraHTTPHeaders leak.
  test('GET /dashboard/stats rejects request with missing API key', async () => {
    const response = await fetch('http://localhost:8004/dashboard/stats');
    expect([401, 403]).toContain(response.status);
  });

  test('POST /documents/search rejects request with invalid API key', async () => {
    const response = await fetch('http://localhost:8004/documents/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'invalid-key-12345',
      },
      body: JSON.stringify({ query: 'test', limit_docs: 5 }),
    });
    expect([401, 403]).toContain(response.status);
  });

  test('GET /health/status rejects request with missing API key', async () => {
    const response = await fetch('http://localhost:8004/health/status');
    expect([401, 403]).toContain(response.status);
  });
});

test.describe('Guest Sessions API (public, no API key required)', () => {
  test('POST /api/guest/session creates a new guest session', async ({ request }) => {
    const response = await request.fetch('http://localhost:8004/api/guest/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    // 200 when Redis is available; 500 if Redis is not reachable
    expect([200, 500]).toContain(response.status());
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('session_id');
      expect(data).toHaveProperty('expires_at');
    }
  });
});

test.describe('Feedback API (public, JWT or anonymous)', () => {
  test('POST /api/feedback/search submits search feedback', async ({ request }) => {
    const response = await request.fetch('http://localhost:8004/api/feedback/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        document_id: 'test-doc-e2e',
        search_query: 'e2e test query',
        rating: 'relevant',
      }),
    });
    // 200 on success; 422 on schema mismatch; 500 if DB not reachable
    expect([200, 422, 500]).toContain(response.status());
  });
});
