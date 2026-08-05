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

type AuthenticationResult =
  | {
      ok: true;
      accessToken: string;
      apiKey: string;
      userId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type JsonRequestResult =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse };

type UpstreamAbort = {
  controller: AbortController;
  cleanup: () => void;
  stopTimeout: () => void;
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
  const text = await response.text();
  if (!text.trim()) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

async function authenticateRequest(
  request: NextRequest,
): Promise<AuthenticationResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Not authenticated' }, 401),
    };
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Not authenticated' }, 401),
    };
  }

  const apiKey = process.env.BACKEND_API_KEY;
  if (!apiKey) {
    routeLogger.error('BACKEND_API_KEY is not configured', undefined, {
      path: request.nextUrl.pathname,
    });
    return {
      ok: false,
      response: jsonResponse({ error: 'Backend service is not configured' }, 503),
    };
  }

  return {
    ok: true,
    accessToken,
    apiKey,
    userId: userData.user.id,
  };
}

async function readJsonRequest(request: NextRequest): Promise<JsonRequestResult> {
  try {
    const rawBody = await request.text();
    if (!rawBody.trim()) throw new SyntaxError('Empty JSON body');
    return { ok: true, body: JSON.parse(rawBody) as unknown };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: 'Invalid JSON body' }, 400),
    };
  }
}

function createUpstreamAbort(request: NextRequest): UpstreamAbort {
  const controller = new AbortController();
  const cancelUpstream = (): void => {
    controller.abort(
      request.signal.reason ?? new DOMException('Client disconnected', 'AbortError'),
    );
  };
  request.signal.addEventListener('abort', cancelUpstream, { once: true });
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Backend service timed out', 'TimeoutError'));
  }, UPSTREAM_TIMEOUT_MS);
  const stopTimeout = (): void => clearTimeout(timeout);

  return {
    controller,
    stopTimeout,
    cleanup: () => {
      stopTimeout();
      request.signal.removeEventListener('abort', cancelUpstream);
    },
  };
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
    const authentication = await authenticateRequest(request);
    if (!authentication.ok) return authentication.response;
    const { accessToken, apiKey, userId } = authentication;

    const jsonRequest = await readJsonRequest(request);
    if (!jsonRequest.ok) return jsonRequest.response;
    const { body } = jsonRequest;

    if (request.signal.aborted) {
      return jsonResponse({ error: 'Request was cancelled' }, 499);
    }

    const upstreamAbort = createUpstreamAbort(request);

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
            .update(userId)
            .digest('hex'),
        },
        body: JSON.stringify(options.transformBody?.(body) ?? body),
        cache: 'no-store',
        signal: upstreamAbort.controller.signal,
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
        isNamedError(upstreamAbort.controller.signal.reason, 'TimeoutError')
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
      upstreamAbort.cleanup();
    }
  } catch (error) {
    routeLogger.error('Authenticated AI proxy failed', error, {
      path: request.nextUrl.pathname,
    });
    return jsonResponse({ error: 'Backend service is unavailable' }, 503);
  }
}

export async function proxyAuthenticatedStream(
  request: NextRequest,
  options: ProxyOptions,
): Promise<NextResponse> {
  try {
    const authentication = await authenticateRequest(request);
    if (!authentication.ok) return authentication.response;
    const { accessToken, apiKey, userId } = authentication;

    const jsonRequest = await readJsonRequest(request);
    if (!jsonRequest.ok) return jsonRequest.response;
    const { body } = jsonRequest;

    if (request.signal.aborted) {
      return jsonResponse({ error: 'Request was cancelled' }, 499);
    }

    const upstreamAbort = createUpstreamAbort(request);

    try {
      const backendUrl = getBackendUrl().replace(/\/$/, '');
      const upstream = await fetch(`${backendUrl}${options.upstreamPath}`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'X-RateLimit-Identity': createHash('sha256')
            .update(userId)
            .digest('hex'),
        },
        body: JSON.stringify(options.transformBody?.(body) ?? body),
        cache: 'no-store',
        signal: upstreamAbort.controller.signal,
      });

      if (upstream.status >= 500) {
        if (upstream.body) {
          void upstream.body.cancel().catch((error) => {
            routeLogger.error('Failed to cancel discarded AI error stream', error, {
              path: request.nextUrl.pathname,
            });
          });
        }
        upstreamAbort.cleanup();
        routeLogger.error('AI stream backend returned a server error', undefined, {
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
        const parsedBody = await parseJsonResponse(upstream);
        upstreamAbort.cleanup();
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

      if (!upstream.body) {
        upstreamAbort.cleanup();
        return jsonResponse({ error: 'Backend returned an invalid response' }, 502);
      }

      upstreamAbort.stopTimeout();
      const upstreamReader = upstream.body.getReader();
      let finished = false;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await upstreamReader.read();
            if (done) {
              finished = true;
              upstreamAbort.cleanup();
              controller.close();
              return;
            }
            controller.enqueue(value);
          } catch (error) {
            finished = true;
            upstreamAbort.cleanup();
            controller.error(error);
          }
        },
        async cancel(reason) {
          if (!finished) {
            finished = true;
            upstreamAbort.controller.abort(reason);
            upstreamAbort.cleanup();
            await upstreamReader.cancel(reason);
          }
        },
      });

      const headers = new Headers({ 'Cache-Control': 'no-store' });
      const contentType = upstream.headers.get('content-type');
      if (contentType) headers.set('Content-Type', contentType);
      for (const name of SAFE_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }

      return new NextResponse(stream, {
        status: upstream.status,
        headers,
      });
    } catch (error) {
      upstreamAbort.cleanup();
      if (
        isNamedError(error, 'TimeoutError') ||
        isNamedError(upstreamAbort.controller.signal.reason, 'TimeoutError')
      ) {
        return jsonResponse({ error: 'Backend service timed out' }, 504);
      }
      if (request.signal.aborted) {
        return jsonResponse({ error: 'Request was cancelled' }, 499);
      }
      routeLogger.error('AI stream backend request failed', error, {
        path: request.nextUrl.pathname,
      });
      return jsonResponse({ error: 'Backend service is unavailable' }, 503);
    }
  } catch (error) {
    routeLogger.error('Authenticated AI stream proxy failed', error, {
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
