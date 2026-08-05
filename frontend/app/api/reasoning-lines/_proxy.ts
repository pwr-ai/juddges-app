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

export async function proxyReasoningLines(
  request: NextRequest,
  path: readonly string[] = [],
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user?.id) {
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
