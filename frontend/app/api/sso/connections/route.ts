import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BACKEND_URL = process.env.API_BASE_URL || 'http://localhost:8004';

/**
 * GET /api/sso/connections - List all SSO connections (admin only)
 * POST /api/sso/connections - Create a new SSO connection (admin only)
 */

type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; response: NextResponse };

async function getAccessToken(): Promise<AccessTokenResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { ok: true as const, accessToken: session.access_token };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await getAccessToken();
    if (!auth.ok) {
      return auth.response;
    }

    const status = request.nextUrl.searchParams.get('status');
    const url = new URL(`${BACKEND_URL}/api/sso/connections`);
    if (status) url.searchParams.set('status', status);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.accessToken}`,
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Failed to list SSO connections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SSO connections' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await getAccessToken();
    if (!auth.ok) {
      return auth.response;
    }

    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/sso/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Failed to create SSO connection:', error);
    return NextResponse.json(
      { error: 'Failed to create SSO connection' },
      { status: 500 }
    );
  }
}
