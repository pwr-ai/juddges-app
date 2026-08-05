import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import {
  DOCUMENT_METADATA_HEADER,
  DOCUMENT_METADATA_SIGNATURE_HEADER,
  VERIFIED_USER_HEADER,
  decodeDocumentMetadataHeader,
  verifyDocumentMetadataHeader,
} from '@/lib/documents/metadata-transport';
import {
  DocumentMetadataUpstreamError,
  isValidDocumentId,
} from '@/lib/documents/server-metadata';
import { ErrorCode } from '@/lib/errors';

import { DocumentPageClient } from './_components/DocumentPageClient';

interface DocumentPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function DocumentPage({
  params,
}: DocumentPageProps): Promise<React.JSX.Element> {
  const { id: documentId } = await params;
  if (!isValidDocumentId(documentId)) notFound();

  const requestHeaders = await headers();
  const encodedMetadata = requestHeaders.get(DOCUMENT_METADATA_HEADER);
  const metadataSignature = requestHeaders.get(
    DOCUMENT_METADATA_SIGNATURE_HEADER
  );
  const verifiedUserId = requestHeaders.get(VERIFIED_USER_HEADER);
  if (!encodedMetadata) {
    throw new DocumentMetadataUpstreamError(
      'Missing verified document metadata',
      500,
      ErrorCode.INTERNAL_ERROR
    );
  }

  if (
    !metadataSignature ||
    !verifiedUserId ||
    !(await verifyDocumentMetadataHeader(
      encodedMetadata,
      metadataSignature,
      verifiedUserId,
      documentId,
      process.env.BACKEND_API_KEY ?? ''
    ))
  ) {
    throw new DocumentMetadataUpstreamError(
      'Invalid verified document metadata provenance',
      500,
      ErrorCode.INTERNAL_ERROR
    );
  }

  const initialMetadata = await decodeDocumentMetadataHeader(encodedMetadata);
  if (initialMetadata.document_id !== documentId) {
    throw new DocumentMetadataUpstreamError(
      'Mismatched verified document metadata',
      500,
      ErrorCode.INTERNAL_ERROR
    );
  }

  return (
    <DocumentPageClient
      documentId={documentId}
      initialMetadata={initialMetadata}
    />
  );
}
