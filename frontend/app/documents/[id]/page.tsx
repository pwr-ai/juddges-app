import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import {
  DOCUMENT_METADATA_HEADER,
  decodeDocumentMetadataHeader,
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
  if (!encodedMetadata) {
    throw new DocumentMetadataUpstreamError(
      'Missing verified document metadata',
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
