import { NextRequest, NextResponse } from 'next/server';

import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

const routeLogger = logger.child('judge-fingerprint-api');

export async function proxyJudgeFingerprint(
  request: NextRequest,
  upstreamPath: string,
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
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

    const contentType = upstream.headers.get('content-type');
    const headers = contentType ? { 'Content-Type': contentType } : undefined;

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
