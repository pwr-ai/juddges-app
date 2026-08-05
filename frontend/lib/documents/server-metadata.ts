import 'server-only';

import { getBackendUrl } from '@/app/api/utils/backend-url';
import type { DocumentMetadata } from '@/app/documents/[id]/_components/types';
import { ErrorCode } from '@/lib/errors';

const DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,255}$/;
const METADATA_TIMEOUT_MS = 10_000;

export class DocumentMetadataNotFoundError extends Error {
  constructor() {
    super('Document not found');
    this.name = 'DocumentMetadataNotFoundError';
  }
}

export class DocumentMetadataUpstreamError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: ErrorCode
  ) {
    super(message);
    this.name = 'DocumentMetadataUpstreamError';
  }
}

export function isValidDocumentId(documentId: string): boolean {
  return DOCUMENT_ID_PATTERN.test(documentId);
}

function isDocumentMetadata(value: unknown): value is DocumentMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  return (
    typeof metadata.document_id === 'string' &&
    typeof metadata.document_type === 'string' &&
    typeof metadata.language === 'string'
  );
}

/**
 * Fetch metadata only after the caller has authenticated the user.
 *
 * Both a missing row and an upstream access denial intentionally become the
 * same error so this server-side probe cannot be used to enumerate documents.
 */
export async function fetchDocumentMetadata(
  documentId: string,
  userId: string,
  requestSignal?: AbortSignal
): Promise<DocumentMetadata> {
  if (!isValidDocumentId(documentId)) {
    throw new DocumentMetadataNotFoundError();
  }

  try {
    const timeoutSignal = AbortSignal.timeout(METADATA_TIMEOUT_MS);
    const signal = requestSignal
      ? AbortSignal.any([requestSignal, timeoutSignal])
      : timeoutSignal;
    const response = await fetch(
      `${getBackendUrl()}/documents/${encodeURIComponent(documentId)}/metadata`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-Key': process.env.BACKEND_API_KEY ?? '',
          'X-User-ID': userId,
        },
        cache: 'no-store',
        signal,
      }
    );

    if (response.status === 404 || response.status === 403) {
      throw new DocumentMetadataNotFoundError();
    }

    if (!response.ok) {
      const statusCode = response.status >= 500 ? response.status : 502;
      const code = statusCode === 503
        ? ErrorCode.DATABASE_UNAVAILABLE
        : ErrorCode.INTERNAL_ERROR;
      throw new DocumentMetadataUpstreamError(
        'The document service failed while loading metadata.',
        statusCode,
        code
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new DocumentMetadataUpstreamError(
        'The document service returned malformed metadata.',
        502,
        ErrorCode.INTERNAL_ERROR
      );
    }

    if (!isDocumentMetadata(payload)) {
      throw new DocumentMetadataUpstreamError(
        'The document service returned malformed metadata.',
        502,
        ErrorCode.INTERNAL_ERROR
      );
    }

    return payload;
  } catch (error) {
    if (
      error instanceof DocumentMetadataNotFoundError ||
      error instanceof DocumentMetadataUpstreamError
    ) {
      throw error;
    }

    const isTimeout = error instanceof Error && error.name === 'AbortError';
    throw new DocumentMetadataUpstreamError(
      isTimeout
        ? 'The document service timed out. Please try again.'
        : 'The document service is unavailable. Please try again.',
      503,
      ErrorCode.DATABASE_UNAVAILABLE
    );
  }
}
