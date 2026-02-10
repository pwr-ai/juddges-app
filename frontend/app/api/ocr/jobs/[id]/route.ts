import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { createClient } from '@/lib/supabase/server';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('ocr-job-detail-api');
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * GET /api/ocr/jobs/[id] - Get OCR job status and results
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const { id: jobId } = await params;

  try {
    apiLogger.info('GET /api/ocr/jobs/[id] started', { requestId, jobId });

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const userId = user.id;

    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/ocr/jobs/${jobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-User-ID': userId,
        'X-Request-ID': requestId,
      } as HeadersInit,
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (e) {
        apiLogger.error('Failed to read error response', e, { requestId });
      }

      throw new AppError(
        `Backend OCR job detail error: ${response.status}`,
        ErrorCode.INTERNAL_ERROR,
        response.status >= 500 ? 503 : response.status,
        { backendStatus: response.status, backendError: errorBody, duration }
      );
    }

    const data = await response.json();
    apiLogger.info('GET /api/ocr/jobs/[id] completed', { requestId, duration, status: data?.status });

    return NextResponse.json(data);

  } catch (error) {
    const duration = Date.now() - startTime;
    apiLogger.error('GET /api/ocr/jobs/[id] failed', error, { requestId, duration });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError('Failed to fetch OCR job', ErrorCode.INTERNAL_ERROR, 500, { requestId, duration }).toErrorDetail(),
      { status: 500 }
    );
  }
}
