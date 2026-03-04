import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../utils/backend-url';
import { createClient } from '@/lib/supabase/server';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode
} from '@/lib/errors';
import { chatRequestSchema } from '@/lib/validation/chat-endpoints';
import { validateRequestBody } from '@/lib/validation/schemas';

const apiLogger = logger.child('chat-api');
const API_KEY = process.env.BACKEND_API_KEY as string;

/**
 * POST /api/chat - Process chat request with streaming support
 * 
 * Query parameters:
 * - stream: boolean (default: false) - Enable streaming mode
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    apiLogger.info('POST /api/chat started', { requestId });

    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const userId = user.id;
    apiLogger.info('User authenticated for chat', { requestId, userId });

    // Check if streaming is requested
    const { searchParams } = new URL(request.url);
    const streamEnabled = searchParams.get('stream') === 'true';

    // Validate request body
    const body = await request.json();
    const validated = validateRequestBody(chatRequestSchema, body);

    // Prepare backend payload
    const backendPayload = {
      input: {
        question: validated.question,
        max_documents: validated.max_documents || 10,
        score_threshold: validated.score_threshold || 0,
        chat_history: validated.chat_history || [],
        response_format: validated.response_format || "detailed",
      },
      config: {},
      kwargs: {},
    };

    const backendUrl = getBackendUrl();
    apiLogger.info('Calling backend chat API', {
      requestId,
      backendUrl,
      questionLength: validated.question.length,
      streamEnabled
    });

    // Use stream endpoint if streaming is enabled
    const endpoint = streamEnabled ? '/chat/stream' : '/chat/invoke';
    const response = await fetch(`${backendUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-User-ID': userId,
        'X-Request-ID': requestId,
      } as HeadersInit,
      body: JSON.stringify(backendPayload),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
        apiLogger.error('Backend API error', {
          requestId,
          status: response.status,
          statusText: response.statusText,
          errorBody,
          duration
        });
      } catch (e) {
        apiLogger.error('Failed to read error response', e, { requestId });
      }

      throw new AppError(
        `Backend chat service error: ${response.status} ${response.statusText}`,
        ErrorCode.INTERNAL_ERROR,
        response.status >= 500 ? 503 : response.status,
        {
          backendStatus: response.status,
          backendError: errorBody,
          duration
        }
      );
    }

    // If streaming, return the stream as-is
    if (streamEnabled) {
      apiLogger.info('Streaming response initiated', { requestId });
      
      // Create a TransformStream to pass through and log the stream
      const { readable, writable } = new TransformStream();
      
      // Pipe the response through our transform stream
      response.body?.pipeTo(writable).catch((error) => {
        apiLogger.error('Stream pipe error', error, { requestId });
      });

      return new NextResponse(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const data = await response.json();

    apiLogger.info('POST /api/chat completed', {
      requestId,
      duration,
      hasAnswer: !!data?.output?.answer
    });

    return NextResponse.json(data);

  } catch (error) {
    const duration = Date.now() - startTime;
    apiLogger.error('POST /api/chat failed', error, {
      requestId,
      duration,
      backendUrl: getBackendUrl(),
      hasApiKey: !!API_KEY
    });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        'Failed to process chat request',
        ErrorCode.INTERNAL_ERROR,
        500,
        { requestId, duration }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
