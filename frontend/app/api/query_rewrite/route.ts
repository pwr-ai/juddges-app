import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import { AppError, ErrorCode } from '@/lib/errors';
import {
  queryRewriteRequestSchema,
  queryRewriteEnvelopeSchema,
} from '@/lib/validation/query-rewrite-schema';
import { validateRequestBody } from '@/lib/validation/schemas';

const apiLogger = logger.child('query-rewrite-api');
const API_BASE_URL = getBackendUrl();

/**
 * POST /api/query_rewrite — proxy to backend POST /documents/search/rewrite
 *
 * Validates the request with the shared Zod schema, forwards it to the backend
 * with the server-side X-API-Key, and on backend / parsing failure returns a
 * degraded envelope so the search UI can gracefully fall back to the raw query.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      new AppError(
        'Invalid JSON body',
        ErrorCode.VALIDATION_ERROR,
        400,
      ).toErrorDetail(),
      { status: 400 },
    );
  }

  let validated;
  try {
    validated = validateRequestBody(queryRewriteRequestSchema, body);
  } catch (err) {
    apiLogger.warn('validation failed', { requestId });
    return NextResponse.json(
      new AppError(
        'Invalid query rewrite request',
        ErrorCode.VALIDATION_ERROR,
        422,
        {
          details: err instanceof Error ? err.message : String(err),
        },
      ).toErrorDetail(),
      { status: 422 },
    );
  }

  try {
    const upstream = await fetch(`${API_BASE_URL}/documents/search/rewrite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY ?? '',
      },
      body: JSON.stringify(validated),
    });

    if (!upstream.ok) {
      apiLogger.warn('backend returned non-2xx — degrading', {
        requestId,
        status: upstream.status,
      });
      return NextResponse.json(
        queryRewriteEnvelopeSchema.parse({
          rewritten_query: validated.query,
          degraded: true,
        }),
      );
    }

    const parsed = queryRewriteEnvelopeSchema.parse(await upstream.json());
    apiLogger.info('query_rewrite ok', {
      requestId,
      durationMs: Date.now() - startedAt,
      degraded: parsed.degraded,
      droppedCount: parsed.diagnostics.dropped_terms.length,
    });
    return NextResponse.json(parsed);
  } catch (err) {
    apiLogger.error('query_rewrite call failed', err, { requestId });
    return NextResponse.json(
      queryRewriteEnvelopeSchema.parse({
        rewritten_query: validated.query,
        degraded: true,
      }),
    );
  }
}
