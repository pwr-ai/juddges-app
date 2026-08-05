import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

const routeLogger = logger.child('authenticated-ai-api');
const UPSTREAM_TIMEOUT_MS = 15_000;
const SEMANTIC_ERROR_STATUSES = new Set([400, 404, 409, 422, 429]);
const SAFE_RESPONSE_HEADERS = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
] as const;

type ProxyOptions = {
  upstreamPath: string;
  transformBody?: (body: unknown) => unknown;
};

function jsonResponse(
  body: unknown,
  status: number,
  upstreamHeaders?: Headers,
): NextResponse {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (upstreamHeaders) {
    for (const name of SAFE_RESPONSE_HEADERS) {
      const value = upstreamHeaders.get(name);
      if (value) headers.set(name, value);
    }
  }
  return NextResponse.json(body, { status, headers });
}

async function parseJsonResponse(response: Response): Promise<unknown | undefined> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return undefined;
  }
  if (!text.trim()) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isNamedError(error: unknown, name: string): boolean {
  return (
    (error instanceof Error || error instanceof DOMException) &&
    error.name === name
  );
}

function semanticErrorBody(body: unknown): unknown | undefined {
  if (!body || typeof body !== 'object') return undefined;
  if (Array.isArray(body)) return body;

  const objectBody = body as Record<string, unknown>;
  if (typeof objectBody.detail === 'string' && typeof objectBody.error !== 'string') {
    return { ...objectBody, error: objectBody.detail };
  }
  return body;
}

export async function proxyAuthenticatedJson(
  request: NextRequest,
  options: ProxyOptions,
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.id) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (sessionError || !accessToken) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    const apiKey = process.env.BACKEND_API_KEY;
    if (!apiKey) {
      routeLogger.error('BACKEND_API_KEY is not configured', undefined, {
        path: request.nextUrl.pathname,
      });
      return jsonResponse({ error: 'Backend service is not configured' }, 503);
    }

    let body: unknown;
    try {
      const rawBody = await request.text();
      if (!rawBody.trim()) throw new SyntaxError('Empty JSON body');
      body = JSON.parse(rawBody) as unknown;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    if (request.signal.aborted) {
      return jsonResponse({ error: 'Request was cancelled' }, 499);
    }

    const upstreamController = new AbortController();
    const cancelUpstream = (): void => {
      upstreamController.abort(
        request.signal.reason ?? new DOMException('Client disconnected', 'AbortError'),
      );
    };
    request.signal.addEventListener('abort', cancelUpstream, { once: true });
    const timeout = setTimeout(() => {
      upstreamController.abort(
        new DOMException('Backend service timed out', 'TimeoutError'),
      );
    }, UPSTREAM_TIMEOUT_MS);

    try {
      const backendUrl = getBackendUrl().replace(/\/$/, '');
      const upstream = await fetch(`${backendUrl}${options.upstreamPath}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'X-RateLimit-Identity': createHash('sha256')
            .update(userData.user.id)
            .digest('hex'),
        },
        body: JSON.stringify(options.transformBody?.(body) ?? body),
        cache: 'no-store',
        signal: upstreamController.signal,
      });

      const parsedBody = await parseJsonResponse(upstream);

      if (upstream.status >= 500) {
        routeLogger.error('AI backend returned a server error', undefined, {
          path: request.nextUrl.pathname,
          status: upstream.status,
        });
        return jsonResponse(
          { error: 'Backend service is unavailable' },
          upstream.status,
          upstream.headers,
        );
      }

      if (!upstream.ok) {
        const semanticBody = semanticErrorBody(parsedBody);
        if (SEMANTIC_ERROR_STATUSES.has(upstream.status) && semanticBody !== undefined) {
          return jsonResponse(semanticBody, upstream.status, upstream.headers);
        }
        return jsonResponse(
          { error: 'Backend rejected the request' },
          upstream.status,
          upstream.headers,
        );
      }

      if (parsedBody === undefined) {
        return jsonResponse(
          { error: 'Backend returned an invalid response' },
          502,
          upstream.headers,
        );
      }

      return jsonResponse(parsedBody, upstream.status, upstream.headers);
    } catch (error) {
      if (
        isNamedError(error, 'TimeoutError') ||
        isNamedError(upstreamController.signal.reason, 'TimeoutError')
      ) {
        return jsonResponse({ error: 'Backend service timed out' }, 504);
      }
      if (request.signal.aborted) {
        return jsonResponse({ error: 'Request was cancelled' }, 499);
      }
      routeLogger.error('AI backend request failed', error, {
        path: request.nextUrl.pathname,
      });
      return jsonResponse({ error: 'Backend service is unavailable' }, 503);
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', cancelUpstream);
    }
  } catch (error) {
    routeLogger.error('Authenticated AI proxy failed', error, {
      path: request.nextUrl.pathname,
    });
    return jsonResponse({ error: 'Backend service is unavailable' }, 503);
  }
}

export function methodNotAllowed(_request: NextRequest): NextResponse {
  const response = jsonResponse(
    { error: 'Method not allowed' },
    405,
  );
  response.headers.set('Allow', 'POST');
  return response;
}

export function apiRouteNotFound(_request: NextRequest): NextResponse {
  return jsonResponse({ error: 'API route not found' }, 404);
}
