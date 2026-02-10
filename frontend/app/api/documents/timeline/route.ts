import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../utils/backend-url';
import { createClient } from '@/lib/supabase/server';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('timeline-api');
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * POST /api/documents/timeline - Extract chronological timeline from legal documents
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    apiLogger.info('POST /api/documents/timeline started', { requestId });

    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const userId = user.id;
    apiLogger.info('User authenticated for timeline extraction', { requestId, userId });

    const body = await request.json();

    // Forward to backend
    const backendUrl = getBackendUrl();
    apiLogger.info('Calling backend timeline API', {
      requestId,
      documentIds: body.document_ids,
      extractionDepth: body.extraction_depth,
    });

    const response = await fetch(`${backendUrl}/timeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-User-ID': userId,
        'X-Request-ID': requestId,
      } as HeadersInit,
      body: JSON.stringify(body),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
        apiLogger.error('Backend timeline API error', {
          requestId,
          status: response.status,
          statusText: response.statusText,
          errorBody,
          duration,
        });
      } catch (e) {
        apiLogger.error('Failed to read error response', e, { requestId });
      }

      throw new AppError(
        `Backend timeline service error: ${response.status} ${response.statusText}`,
        ErrorCode.INTERNAL_ERROR,
        response.status >= 500 ? 503 : response.status,
        {
          backendStatus: response.status,
          backendError: errorBody,
          duration,
        }
      );
    }

    const data = await response.json();

    apiLogger.info('POST /api/documents/timeline completed', {
      requestId,
      duration,
      eventCount: data?.total_events,
    });

    return NextResponse.json(data);

  } catch (error) {
    const duration = Date.now() - startTime;
    apiLogger.error('POST /api/documents/timeline failed', error, {
      requestId,
      duration,
    });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        'Failed to extract document timeline',
        ErrorCode.INTERNAL_ERROR,
        500,
        { requestId, duration }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
