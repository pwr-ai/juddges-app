/**
 * BFF route for invite redemption.
 *
 * The browser must never hold the backend API key, and a refused invite
 * must reach the user as a refusal rather than a generic 500.
 */
import { POST } from '@/app/api/auth/redeem-invite/route';

describe('POST /api/auth/redeem-invite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-backend-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  const request = (body: unknown) =>
    new Request('http://localhost/api/auth/redeem-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('forwards a valid redemption and returns 201', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'created' }), { status: 201 })
    );

    const response = await POST(
      request({ code: 'PILOT-2026', email: 'a@example.org', password: 'correct horse battery' })
    );

    expect(response.status).toBe(201);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://backend.test/auth/invites/redeem');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-backend-key');
  });

  it('propagates a refused invite code as 403', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ detail: { code: 'INVALID_INVITE_CODE', message: 'nope' } }),
        { status: 403 }
      )
    );

    const response = await POST(
      request({ code: 'NOPE', email: 'a@example.org', password: 'correct horse battery' })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: 'INVALID_INVITE_CODE' },
    });
  });

  it('rejects a body with no invite code without calling the backend', async () => {
    global.fetch = jest.fn();

    const response = await POST(
      request({ email: 'a@example.org', password: 'correct horse battery' })
    );

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never echoes the backend api key to the client', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'created' }), { status: 201 })
    );

    const response = await POST(
      request({ code: 'PILOT-2026', email: 'a@example.org', password: 'correct horse battery' })
    );

    expect(await response.text()).not.toContain('test-backend-key');
  });

  it('attributes public invite attempts to the trusted visitor IP', async () => {
    const previous = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = 'true';
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'created' }), { status: 201 })
    );
    const incoming = request({ code: 'PILOT', email: 'a@example.org', password: 'password' });
    incoming.headers.set('x-forwarded-for', '192.0.2.10, 10.0.0.1');
    incoming.headers.set('x-ratelimit-client-ip', '198.51.100.99');
    try {
      await POST(incoming);
      const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
      expect(headers['X-RateLimit-Client-IP']).toBe('192.0.2.10');
    } finally {
      if (previous === undefined) delete process.env.TRUSTED_PROXY;
      else process.env.TRUSTED_PROXY = previous;
    }
  });
});
