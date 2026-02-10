import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  AppError,
  ErrorCode
} from '@/lib/errors';
import { enhanceQueryRequestSchema } from '@/lib/validation/chat-endpoints';
import { validateRequestBody } from '@/lib/validation/schemas';

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

    // Call backend API
    const response = await fetch(`${API_BASE_URL}/documents/search/enhance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      } as HeadersInit,
      body: JSON.stringify({
        input: {
          query: validated.query,
          context: validated.context,
          language: validated.language
        },
        config: {},
        kwargs: {},
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

      throw new AppError(
        `Query enhancement failed: ${response.status}`,
        ErrorCode.INTERNAL_ERROR,
        response.status >= 500 ? 503 : response.status,
        {
          backendStatus: response.status,
          backendError: errorBody,
          duration
        }
      );
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
