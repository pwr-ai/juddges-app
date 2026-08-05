import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

const routeLogger = logger.child('judge-fingerprint-api');
const FORWARDED_RESPONSE_HEADERS = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
] as const;

export async function proxyJudgeFingerprint(
  request: NextRequest,
  upstreamPath: string,
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

    const backendUrl = getBackendUrl().replace(/\/$/, '');
    const rateLimitIdentity = createHash('sha256')
      .update(userData.user.id)
      .digest('hex');
    const upstream = await fetch(`${backendUrl}${upstreamPath}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-API-Key': apiKey,
        'X-RateLimit-Identity': rateLimitIdentity,
      },
      cache: 'no-store',
    });

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(header);
      if (value) headers.set(header, value);
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    routeLogger.error('Judge fingerprint proxy request failed', error, {
      path: request.nextUrl.pathname,
    });
    return NextResponse.json(
      { error: 'Failed to connect to backend service' },
      { status: 503 },
    );
  }
}
