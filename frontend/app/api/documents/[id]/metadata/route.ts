import { NextRequest, NextResponse } from 'next/server';

import {
  DocumentMetadataNotFoundError,
  DocumentMetadataUpstreamError,
  fetchDocumentMetadata,
  isValidDocumentId,
} from '@/lib/documents/server-metadata';
import { ANONYMOUS_PRINCIPAL } from '@/lib/documents/metadata-transport';
import { AppError, ErrorCode, ValidationError } from '@/lib/errors';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const apiLogger = logger.child('document-metadata-api');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    // Issue #510 — judgment metadata is public court-ruling data. A session is
    // read when present purely so upstream can attribute the request; a
    // signed-out visitor is served under a reserved principal instead of a 401.
    // An auth-service outage must not take the public judgment page down, so a
    // lookup failure degrades to the anonymous principal rather than a 503.
    let principal = ANONYMOUS_PRINCIPAL;
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) principal = data.user.id;
    } catch (authError) {
      apiLogger.debug('Anonymous judgment metadata read', { requestId, authError });
    }

    const { id: documentId } = await params;
    if (!isValidDocumentId(documentId)) {
      throw new ValidationError('Invalid document ID');
    }

    const metadata = await fetchDocumentMetadata(
      documentId,
      principal,
      request.signal
    );

    return NextResponse.json(metadata, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    apiLogger.error('GET /api/documents/[id]/metadata failed', error, {
      requestId,
    });

    if (error instanceof DocumentMetadataNotFoundError) {
      return NextResponse.json(
        new AppError(
          'Document not found',
          ErrorCode.DOCUMENT_NOT_FOUND,
          404
        ).toErrorDetail(),
        { status: 404 }
      );
    }

    if (error instanceof DocumentMetadataUpstreamError) {
      return NextResponse.json(
        new AppError(
          error.message,
          error.code,
          error.statusCode
        ).toErrorDetail(),
        { status: error.statusCode }
      );
    }

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError(
        'An unexpected error occurred while authenticating the request.',
        ErrorCode.INTERNAL_ERROR,
        500
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
