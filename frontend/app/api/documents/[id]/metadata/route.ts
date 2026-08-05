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
    if (error || !data.user) {
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

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      new AppError(
        'Unable to authenticate the document request.',
        ErrorCode.UNAUTHORIZED,
        401
      ).toErrorDetail(),
      { status: 401 }
    );
  }
}
