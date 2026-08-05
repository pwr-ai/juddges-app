/**
 * @jest-environment node
 */

const mockGetUser = jest.fn();
const mockFetchMetadata = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

jest.mock('@/lib/documents/server-metadata', () => ({
  fetchDocumentMetadata: (...args: unknown[]) => mockFetchMetadata(...args),
  isValidDocumentId: (id: string) => /^[a-zA-Z0-9_.-]{1,255}$/.test(id),
  DocumentMetadataNotFoundError: class DocumentMetadataNotFoundError extends Error {},
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: jest.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));

jest.mock('@/app/documents/[id]/_components/DocumentPageClient', () => ({
  DocumentPageClient: (props: unknown) => props,
}));

import DocumentPage from '@/app/documents/[id]/page';

const { notFound: mockNotFound } = jest.requireMock('next/navigation');

describe('documents/[id] server page status decisions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'owner-1' } },
      error: null,
    });
  });

  it('redirects anonymous callers before probing document existence', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'secret-doc' }) })
    ).rejects.toThrow('NEXT_REDIRECT:/auth/login?next=%2Fdocuments%2Fsecret-doc');
    expect(mockFetchMetadata).not.toHaveBeenCalled();
  });

  it('returns the real Next not-found response for invalid IDs', async () => {
    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'bad/id' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockFetchMetadata).not.toHaveBeenCalled();
  });

  it('returns the real Next not-found response for missing or inaccessible metadata', async () => {
    const { DocumentMetadataNotFoundError } = jest.requireMock(
      '@/lib/documents/server-metadata'
    );
    mockFetchMetadata.mockRejectedValue(new DocumentMetadataNotFoundError());

    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'doc-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('does not collapse retryable upstream errors into not-found', async () => {
    mockFetchMetadata.mockRejectedValue(new Error('upstream unavailable'));

    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'doc-1' }) })
    ).rejects.toThrow('upstream unavailable');
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it('renders the client surface with server-verified metadata', async () => {
    const metadata = { document_id: 'doc-1', title: 'Visible judgment' };
    mockFetchMetadata.mockResolvedValue(metadata);

    const result = await DocumentPage({
      params: Promise.resolve({ id: 'doc-1' }),
    });

    expect(result.props).toMatchObject({
      documentId: 'doc-1',
      initialMetadata: metadata,
    });
    expect(mockFetchMetadata).toHaveBeenCalledWith('doc-1', 'owner-1');
  });
});
