import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { createClient } from '@/lib/supabase/server';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('ocr-api');
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * POST /api/ocr/jobs - Submit a file for OCR processing
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    apiLogger.info('POST /api/ocr/jobs started', { requestId });

    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const userId = user.id;

    // Forward the multipart form data directly
    const formData = await request.formData();

    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/ocr/jobs`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userId,
        'X-Request-ID': requestId,
      } as HeadersInit,
      body: formData,
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
        apiLogger.error('Backend OCR API error', {
          requestId, status: response.status, errorBody, duration,
        });
      } catch (e) {
        apiLogger.error('Failed to read error response', e, { requestId });
      }

      throw new AppError(
        `Backend OCR service error: ${response.status} ${response.statusText}`,
        ErrorCode.INTERNAL_ERROR,
        response.status >= 500 ? 503 : response.status,
        { backendStatus: response.status, backendError: errorBody, duration }
      );
    }

    const data = await response.json();
    apiLogger.info('POST /api/ocr/jobs completed', { requestId, duration, jobId: data?.job_id });

    return NextResponse.json(data);

  } catch (error) {
    const duration = Date.now() - startTime;
    apiLogger.error('POST /api/ocr/jobs failed', error, { requestId, duration });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError('Failed to process OCR request', ErrorCode.INTERNAL_ERROR, 500, { requestId, duration }).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * GET /api/ocr/jobs - List OCR jobs
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    apiLogger.info('GET /api/ocr/jobs started', { requestId });

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const userId = user.id;
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    const backendUrl = getBackendUrl();
    const url = `${backendUrl}/ocr/jobs${queryString ? '?' + queryString : ''}`;

    const response = await fetch(url, {
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
        `Backend OCR list error: ${response.status}`,
        ErrorCode.INTERNAL_ERROR,
        response.status >= 500 ? 503 : response.status,
        { backendStatus: response.status, backendError: errorBody, duration }
      );
    }

    const data = await response.json();
    apiLogger.info('GET /api/ocr/jobs completed', { requestId, duration, total: data?.total });

    return NextResponse.json(data);

  } catch (error) {
    const duration = Date.now() - startTime;
    apiLogger.error('GET /api/ocr/jobs failed', error, { requestId, duration });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError('Failed to list OCR jobs', ErrorCode.INTERNAL_ERROR, 500, { requestId, duration }).toErrorDetail(),
      { status: 500 }
    );
  }
}
