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
import { POST } from '@/app/api/extractions/base-schema/route';

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/extractions/base-schema', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/extractions/base-schema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  const mockAuth = (user: unknown, error: unknown = null) => {
    (createClient as jest.Mock).mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user },
          error,
        }),
      },
    });
  };

  it('requires authentication before proxying to the backend', async () => {
    mockAuth(null);

    const response = await POST(buildRequest({ document_id: 'doc-1' }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('UNAUTHORIZED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('wraps a single document_id into the backend document_ids payload', async () => {
    mockAuth({ id: 'user-1' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        total_documents: 1,
        successful_extractions: 1,
        failed_extractions: 0,
      }),
    });

    const response = await POST(
      buildRequest({
        document_id: 'doc-1',
        llm_name: 'gpt-5-mini',
      })
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/extractions\/base-schema$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-API-Key': 'test-api-key',
          'X-User-ID': 'user-1',
        }),
        body: JSON.stringify({
          document_ids: ['doc-1'],
          llm_name: 'gpt-5-mini',
          jurisdiction_override: undefined,
          additional_instructions: undefined,
        }),
      })
    );
  });

  it('passes through an explicit document_ids array', async () => {
    mockAuth({ id: 'user-1' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        total_documents: 2,
        successful_extractions: 2,
        failed_extractions: 0,
      }),
    });

    const response = await POST(
      buildRequest({
        document_ids: ['doc-1', 'doc-2'],
        additional_instructions: 'Focus on procedural posture.',
      })
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/extractions\/base-schema$/),
      expect.objectContaining({
        body: JSON.stringify({
          document_ids: ['doc-1', 'doc-2'],
          llm_name: undefined,
          jurisdiction_override: undefined,
          additional_instructions: 'Focus on procedural posture.',
        }),
      })
    );
  });

  it('rejects raw document_text requests because the backend only supports stored documents', async () => {
    mockAuth({ id: 'user-1' });

    const response = await POST(
      buildRequest({
        document_text: 'Lorem ipsum',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
    expect(data.error).toContain('document_id');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
