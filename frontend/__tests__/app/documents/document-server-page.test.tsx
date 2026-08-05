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
import {
  encodeDocumentMetadataHeader,
  signDocumentMetadataHeader,
  VERIFIED_USER_HEADER,
} from '@/lib/documents/metadata-transport';

const { headers: mockHeaders } = jest.requireMock('next/headers');

describe('documents/[id] trusted middleware hand-off', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = 'test-backend-secret';
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
      'x-juddges-document-metadata-signature': await signDocumentMetadataHeader(
        value,
        'owner-1',
        'other-doc',
        'test-backend-secret'
      ),
      [VERIFIED_USER_HEADER]: 'owner-1',
    }));

    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'doc-1' }) })
    ).rejects.toThrow('Invalid verified document metadata provenance');
  });

  it('renders from the one trusted middleware fetch without another lookup', async () => {
    const metadata = {
      document_id: 'doc-1',
      document_type: 'judgment',
      language: 'en',
      title: 'Visible judgment',
    };
    const value = await encodeDocumentMetadataHeader(metadata);
    mockHeaders.mockResolvedValue(new Headers({
      'x-juddges-document-metadata': value,
      'x-juddges-document-metadata-signature': await signDocumentMetadataHeader(
        value,
        'owner-1',
        'doc-1',
        'test-backend-secret'
      ),
      [VERIFIED_USER_HEADER]: 'owner-1',
    }));

    const result = await DocumentPage({
      params: Promise.resolve({ id: 'doc-1' }),
    });

    expect(result.props).toMatchObject({
      documentId: 'doc-1',
      initialMetadata: metadata,
    });
  });

  it('rejects forged metadata when middleware provenance is absent', async () => {
    const value = await encodeDocumentMetadataHeader({
      document_id: 'doc-1',
      document_type: 'judgment',
      language: 'en',
    });
    mockHeaders.mockResolvedValue(new Headers({
      'x-juddges-document-metadata': value,
      'x-juddges-document-metadata-signature': 'attacker-signature',
      [VERIFIED_USER_HEADER]: 'attacker',
    }));

    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'doc-1' }) })
    ).rejects.toThrow('Invalid verified document metadata provenance');
  });

  it('rejects a user A snapshot replayed into user B context', async () => {
    const value = await encodeDocumentMetadataHeader({
      document_id: 'doc-1',
      document_type: 'judgment',
      language: 'en',
    });
    const userASignature = await signDocumentMetadataHeader(
      value,
      'user-a',
      'doc-1',
      'test-backend-secret'
    );
    mockHeaders.mockResolvedValue(new Headers({
      'x-juddges-document-metadata': value,
      'x-juddges-document-metadata-signature': userASignature,
      [VERIFIED_USER_HEADER]: 'user-b',
    }));

    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'doc-1' }) })
    ).rejects.toThrow('Invalid verified document metadata provenance');
  });

  it('fails closed when the signing key is missing', async () => {
    process.env.BACKEND_API_KEY = '';
    const value = await encodeDocumentMetadataHeader({
      document_id: 'doc-1',
      document_type: 'judgment',
      language: 'en',
    });
    mockHeaders.mockResolvedValue(new Headers({
      'x-juddges-document-metadata': value,
      'x-juddges-document-metadata-signature': 'replayed-signature',
      [VERIFIED_USER_HEADER]: 'owner-1',
    }));

    await expect(
      DocumentPage({ params: Promise.resolve({ id: 'doc-1' }) })
    ).rejects.toThrow('Invalid verified document metadata provenance');
  });
});
