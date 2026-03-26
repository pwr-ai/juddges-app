/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/supabase/server');
jest.mock('@/lib/logger', () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

global.fetch = jest.fn();

import { createClient } from '@/lib/supabase/server';
import { POST } from '@/app/api/contact/route';
import { resetContactRateLimitStoreForTests } from '@/app/api/contact/rate-limit';

function buildRequest(body: Record<string, unknown>, ip = '203.0.113.10'): NextRequest {
  return new NextRequest('http://localhost:3000/api/contact', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      'user-agent': 'Jest',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/contact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetContactRateLimitStoreForTests();
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.CONTACT_INTERNAL_EMAIL = 'enterprise@example.com';
    process.env.CONTACT_FROM_EMAIL = 'noreply@example.com';
    process.env.CONTACT_RATE_LIMIT_MAX = '5';
    process.env.CONTACT_RATE_LIMIT_WINDOW_MS = '3600000';
  });

  const mockInsert = (error: null | { message: string }) => {
    const insert = jest.fn().mockResolvedValue({ error });
    (createClient as jest.Mock).mockResolvedValue({
      from: jest.fn().mockReturnValue({ insert }),
    });
    return insert;
  };

  const validPayload = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    company: 'Acme Legal',
    message: 'We need enterprise access for 40 users.',
  };

  it('returns 400 for invalid payloads', async () => {
    const response = await POST(
      buildRequest({ name: 'A', email: 'bad', company: '', message: 'short' })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('VALIDATION_ERROR');
  });

  it('persists the submission and sends both emails on success', async () => {
    const insert = mockInsert(null);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_1' }),
    });

    const response = await POST(buildRequest(validPayload));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns database and email-delivery failures with the current error codes', async () => {
    mockInsert({ message: 'db unavailable' });
    const dbFailure = await POST(buildRequest(validPayload));

    mockInsert(null);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    const emailFailure = await POST(buildRequest(validPayload));

    expect(dbFailure.status).toBe(503);
    expect((await dbFailure.json()).error).toBe('DATABASE_UNAVAILABLE');
    expect(emailFailure.status).toBe(500);
    expect((await emailFailure.json()).error).toBe('INTERNAL_ERROR');
  });

  it('enforces the IP-based rate limit', async () => {
    process.env.CONTACT_RATE_LIMIT_MAX = '1';
    mockInsert(null);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_1' }),
    });

    const first = await POST(buildRequest(validPayload, '198.51.100.20'));
    const second = await POST(buildRequest(validPayload, '198.51.100.20'));
    const secondData = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(secondData.error).toBe('RATE_LIMIT_EXCEEDED');
  });
});
