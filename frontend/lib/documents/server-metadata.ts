import 'server-only';

import { getBackendUrl } from '@/app/api/utils/backend-url';
import type { DocumentMetadata } from '@/app/documents/[id]/_components/types';
import { ErrorCode } from '@/lib/errors';
import { isDocumentMetadata } from '@/lib/documents/metadata-transport';

const DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,255}$/;

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

function metadataTimeoutMs(): number {
  const configured = Number(process.env.DOCUMENT_METADATA_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 10_000;
}

function isTimeoutFailure(error: unknown, signal: AbortSignal): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'TimeoutError'
  ) return true;
  return signal.aborted &&
    typeof signal.reason === 'object' &&
    signal.reason !== null &&
    'name' in signal.reason &&
    signal.reason.name === 'TimeoutError';
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

  const timeoutSignal = AbortSignal.timeout(metadataTimeoutMs());
  const signal = requestSignal
    ? AbortSignal.any([requestSignal, timeoutSignal])
    : timeoutSignal;
  try {
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

    if (!isDocumentMetadata(payload) || payload.document_id !== documentId) {
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

    const isTimeout = isTimeoutFailure(error, signal);
    throw new DocumentMetadataUpstreamError(
      isTimeout
        ? 'The document service timed out. Please try again.'
        : 'The document service is unavailable. Please try again.',
      isTimeout ? 504 : 503,
      isTimeout ? ErrorCode.INTERNAL_ERROR : ErrorCode.DATABASE_UNAVAILABLE
    );
  }
}
