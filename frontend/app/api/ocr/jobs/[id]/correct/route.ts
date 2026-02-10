import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { createClient } from '@/lib/supabase/server';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('ocr-correct-api');
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * POST /api/ocr/jobs/[id]/correct - Submit manual corrections for OCR text
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const { id: jobId } = await params;

  try {
    apiLogger.info('POST /api/ocr/jobs/[id]/correct started', { requestId, jobId });

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const userId = user.id;
    const body = await request.json();

    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/ocr/jobs/${jobId}/correct`, {
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
      } catch (e) {
        apiLogger.error('Failed to read error response', e, { requestId });
      }

      throw new AppError(
        `Backend OCR correction error: ${response.status}`,
        ErrorCode.INTERNAL_ERROR,
        response.status >= 500 ? 503 : response.status,
        { backendStatus: response.status, backendError: errorBody, duration }
      );
    }

    const data = await response.json();
    apiLogger.info('POST /api/ocr/jobs/[id]/correct completed', { requestId, duration });

    return NextResponse.json(data);

  } catch (error) {
    const duration = Date.now() - startTime;
    apiLogger.error('POST /api/ocr/jobs/[id]/correct failed', error, { requestId, duration });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError('Failed to submit OCR corrections', ErrorCode.INTERNAL_ERROR, 500, { requestId, duration }).toErrorDetail(),
      { status: 500 }
    );
  }
}
