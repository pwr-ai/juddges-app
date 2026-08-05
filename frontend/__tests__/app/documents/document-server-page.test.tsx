/**
 * @jest-environment node
 */

jest.mock('next/headers', () => ({ headers: jest.fn() }));
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
jest.mock('@/app/documents/[id]/_components/DocumentPageClient', () => ({
  DocumentPageClient: (props: unknown) => props,
}));

import DocumentPage from '@/app/documents/[id]/page';
import { encodeDocumentMetadataHeader } from '@/lib/documents/metadata-transport';

const { headers: mockHeaders } = jest.requireMock('next/headers');

describe('documents/[id] trusted middleware hand-off', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns Next not-found for an invalid ID without reading metadata', async () => {
    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'bad/id' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockHeaders).not.toHaveBeenCalled();
  });

  it('fails as an availability error when the trusted result is absent', async () => {
    mockHeaders.mockResolvedValue(new Headers());

    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'doc-1' }) })
    ).rejects.toThrow('Missing verified document metadata');
  });

  it('rejects a trusted payload for a different document', async () => {
    const value = await encodeDocumentMetadataHeader({
      document_id: 'other-doc',
      document_type: 'judgment',
      language: 'en',
    });
    mockHeaders.mockResolvedValue(new Headers({
      'x-juddges-document-metadata': value,
    }));

    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'doc-1' }) })
    ).rejects.toThrow('Mismatched verified document metadata');
  });

  it('renders from the one trusted middleware fetch without another lookup', async () => {
    const metadata = {
      document_id: 'doc-1',
      document_type: 'judgment',
      language: 'en',
      title: 'Visible judgment',
    };
    mockHeaders.mockResolvedValue(new Headers({
      'x-juddges-document-metadata': await encodeDocumentMetadataHeader(metadata),
    }));

    const result = await DocumentPage({
      params: Promise.resolve({ id: 'doc-1' }),
    });

    expect(result.props).toMatchObject({
      documentId: 'doc-1',
      initialMetadata: metadata,
    });
  });
});
