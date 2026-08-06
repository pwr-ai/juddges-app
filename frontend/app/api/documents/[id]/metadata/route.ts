import { NextRequest, NextResponse } from 'next/server';

import {
  DocumentMetadataNotFoundError,
  DocumentMetadataUpstreamError,
  fetchDocumentMetadata,
  isValidDocumentId,
} from '@/lib/documents/server-metadata';
import {
  AppError,
  ErrorCode,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
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
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const status = Number(error.status);
      const message = error.message ?? '';
      if (
        status === 401 ||
        status === 403 ||
        message === 'Auth session missing!' ||
        message.includes('refresh_token_not_found')
      ) {
        throw new UnauthorizedError();
      }
      throw new AppError(
        'Authentication service is temporarily unavailable.',
        ErrorCode.DATABASE_UNAVAILABLE,
        503
      );
    }
    if (!data.user) {
      throw new UnauthorizedError();
    }

    const { id: documentId } = await params;
    if (!isValidDocumentId(documentId)) {
      throw new ValidationError('Invalid document ID');
    }

    const metadata = await fetchDocumentMetadata(
      documentId,
      data.user.id,
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

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: 401,
      });
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
