/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    })),
  },
}));

jest.mock('@/lib/parsing', () => ({
  convertXmlTagsToHtml: jest.fn((value: string) => value),
  fixHtmlContentServer: jest.fn((value: string) => value),
  buildDocumentHtml: jest.fn((value: string, title: string) => `<html><body><h1>${title}</h1>${value}</body></html>`),
}));

global.fetch = jest.fn();

import { GET } from '@/app/api/documents/[id]/html/route';

describe('GET /api/documents/[id]/html', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  it('builds html from the backend document payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        document: {
          title: 'Rendered document',
          raw_content: '<p>Hello</p>',
        },
      }),
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/documents/doc-1/html'),
      { params: Promise.resolve({ id: 'doc-1' }) }
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(html).toContain('Rendered document');
    expect(html).toContain('<p>Hello</p>');
  });

  it('returns an html error page for missing ids and 404s', async () => {
    const missingId = await GET(
      new NextRequest('http://localhost:3000/api/documents//html'),
      { params: Promise.resolve({ id: '' }) }
    );

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'missing',
    });

    const notFound = await GET(
      new NextRequest('http://localhost:3000/api/documents/doc-1/html'),
      { params: Promise.resolve({ id: 'doc-1' }) }
    );

    expect(missingId.status).toBe(400);
    expect(await missingId.text()).toContain('Document ID is required');
    expect(notFound.status).toBe(404);
    expect(await notFound.text()).toContain("Document 'doc-1' not found");
  });
});
