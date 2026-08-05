import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

const routeLogger = logger.child('reasoning-lines-api');
const FORWARDED_RESPONSE_HEADERS = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
] as const;
const REASONING_LINE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATIC_PATH_METHODS: Readonly<Record<string, readonly string[]>> = {
  discover: ['POST'],
  create: ['POST'],
  dag: ['GET'],
  'detect-events': ['POST'],
  search: ['POST'],
};

const LINE_SUBRESOURCE_METHODS: Readonly<Record<string, readonly string[]>> = {
  timeline: ['GET'],
  'drift-analysis': ['POST'],
  'analyze-outcomes': ['POST'],
  related: ['GET'],
};

function allowedMethods(path: readonly string[]): readonly string[] | null {
  if (path.length === 0) return ['GET'];

  if (path.length === 1) {
    const staticMethods = STATIC_PATH_METHODS[path[0]];
    if (staticMethods) return staticMethods;
    return REASONING_LINE_ID.test(path[0]) ? ['GET', 'DELETE'] : null;
  }

  if (path.length === 2 && REASONING_LINE_ID.test(path[0])) {
    return LINE_SUBRESOURCE_METHODS[path[1]] ?? null;
  }

  return null;
}

export async function proxyReasoningLines(
  request: NextRequest,
  path: readonly string[] = [],
): Promise<NextResponse> {
  try {
    const methods = allowedMethods(path);
    if (!methods) {
      return NextResponse.json(
        { error: 'Reasoning-lines route not found' },
        { status: 404 },
      );
    }
    if (!methods.includes(request.method)) {
      return NextResponse.json(
        { error: 'Method not allowed' },
        { status: 405, headers: { Allow: methods.join(', ') } },
      );
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (sessionError || !accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const apiKey = process.env.BACKEND_API_KEY;
    if (!apiKey) {
      routeLogger.error('BACKEND_API_KEY is not configured');
      return NextResponse.json(
        { error: 'Backend service is not configured' },
        { status: 503 },
      );
    }

    const encodedPath = path.map((segment) => encodeURIComponent(segment)).join('/');
    const backendUrl = getBackendUrl().replace(/\/$/, '');
    const upstreamUrl = `${backendUrl}/reasoning-lines/${encodedPath}${request.nextUrl.search}`;
    const headers: Record<string, string> = {
      Accept: request.headers.get('accept') ?? 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-API-Key': apiKey,
      'X-RateLimit-Identity': createHash('sha256')
        .update(userData.user.id)
        .digest('hex'),
    };
    const contentType = request.headers.get('content-type');
    if (contentType) headers['Content-Type'] = contentType;

    const init: RequestInit = {
      method: request.method,
      headers,
      cache: 'no-store',
    };
    if (request.body) init.body = await request.arrayBuffer();

    const upstream = await fetch(upstreamUrl, init);
    const responseHeaders = new Headers();
    const responseContentType = upstream.headers.get('content-type');
    if (responseContentType) responseHeaders.set('Content-Type', responseContentType);
    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    routeLogger.error('Reasoning-lines proxy request failed', error, {
      path: request.nextUrl.pathname,
    });
    return NextResponse.json(
      { error: 'Failed to connect to backend service' },
      { status: 503 },
    );
  }
}
