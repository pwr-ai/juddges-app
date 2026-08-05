import { NextRequest, NextResponse } from 'next/server';

import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

const routeLogger = logger.child('admin-api');
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-language',
  'retry-after',
  'www-authenticate',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
] as const;

export async function proxyAdminRequest(
  request: NextRequest,
  upstreamPath: string,
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json(
        { detail: 'Authentication required' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (sessionError || !accessToken) {
      return NextResponse.json(
        { detail: 'Session expired' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const apiKey = process.env.BACKEND_API_KEY;
    if (!apiKey) {
      routeLogger.error('BACKEND_API_KEY is not configured');
      return NextResponse.json(
        { detail: 'Admin API is not configured' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const backendUrl = getBackendUrl().replace(/\/$/, '');
    const upstream = await fetch(`${backendUrl}${upstreamPath}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
      },
      cache: 'no-store',
    });

    const headers = new Headers({ 'Cache-Control': 'no-store' });
    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(header);
      if (value) headers.set(header, value);
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    routeLogger.error('Admin API proxy request failed', error, {
      path: request.nextUrl.pathname,
    });
    return NextResponse.json(
      { detail: 'Admin API is unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
