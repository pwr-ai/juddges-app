import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  AppError,
  ErrorCode
} from '@/lib/errors';
import { enhanceQueryRequestSchema } from '@/lib/validation/chat-endpoints';
import { validateRequestBody } from '@/lib/validation/schemas';
import { createClient } from '@/lib/supabase/server';

const apiLogger = logger.child('enhance-query-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * POST /api/enhance_query - Enhance search query using AI
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    apiLogger.info('POST /api/enhance_query started', { requestId });

    // Validate request body
    const body = await request.json();
    const validated = validateRequestBody(enhanceQueryRequestSchema, body);

    apiLogger.info('Calling backend enhance API', {
      requestId,
      queryLength: validated.query.length
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    };

    // Give each signed-in user their own rate-limit bucket (issue #573).
    //
    // `get_client_ip` (backend/app/rate_limiter.py) keys per user only when
    // this header arrives with a matching X-API-Key; otherwise it falls back
    // to the socket address, which for BFF-proxied traffic is this
    // container — one bucket shared by every visitor. Hashed so the
    // backend's rate-limit keys never carry a raw user id. Anonymous traffic
    // sends nothing and keeps sharing the container bucket.
    const supabase = await createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (sessionData.session?.access_token && userId) {
      headers['X-RateLimit-Identity'] = createHash('sha256')
        .update(userId)
        .digest('hex');
    }

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/enhance_query/invoke`, {
      method: 'POST',
      headers: headers as HeadersInit,
      body: JSON.stringify({
        input: {
          query: validated.query
        }
      }),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
        apiLogger.error('Backend enhance API error', {
          requestId,
          status: response.status,
          errorBody,
          duration
        });
      } catch (e) {
        apiLogger.error('Failed to read error response', e, { requestId });
      }

      const contentType = response.headers.get('content-type');
      return new NextResponse(errorBody, {
        status: response.status,
        headers: contentType ? { 'Content-Type': contentType } : undefined
      });
    }

    const data = await response.json();

    apiLogger.info('POST /api/enhance_query completed', {
      requestId,
      duration,
      hasEnhancedQuery: !!data?.output?.enhanced_query
    });

    return NextResponse.json(data);

  } catch (error) {
    const duration = Date.now() - startTime;
    apiLogger.error('POST /api/enhance_query failed', error, {
      requestId,
      duration
    });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        'Failed to enhance query',
        ErrorCode.INTERNAL_ERROR,
        500,
        { requestId, duration }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
