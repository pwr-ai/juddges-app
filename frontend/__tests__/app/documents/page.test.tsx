/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('next/link', () => {
  return ({ children, ...props }: any) => <a {...props}>{children}</a>;
});

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'doc-1' }),
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/documents/doc-1',
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: null,
    loading: false,
  })),
}));

jest.mock('@/lib/api', () => ({
  summarizeDocuments: jest.fn(),
  extractKeyPoints: jest.fn(),
}));

jest.mock('@/components/VersionHistory', () => ({
  VersionHistory: () => null,
}));

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>,
}));

jest.mock('dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (value: string) => value,
  },
}));

import DocumentPage from '@/app/documents/[id]/page';

describe('DocumentPage public AI actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/documents/doc-1/metadata')) {
        return {
          ok: true,
          json: async () => ({
            document_id: 'doc-1',
            document_type: 'judgment',
            language: 'en',
            title: 'Test judgment',
          }),
        } as Response;
      }

      if (url.endsWith('/api/documents/doc-1/similar?top_k=3')) {
        return {
          ok: true,
          json: async () => ({ similar_documents: [] }),
        } as Response;
      }

      if (url.endsWith('/api/documents/doc-1/html')) {
        return {
          ok: true,
          text: async () => '<p>Document HTML</p>',
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as jest.Mock;
  });

  it('shows sign-in prompts instead of protected AI action buttons for anonymous users', async () => {
    render(<DocumentPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Test judgment').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByRole('link', { name: /Sign in/i }).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: /Generate Summary/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Extract Key Points/i })
    ).not.toBeInTheDocument();
  });
});
