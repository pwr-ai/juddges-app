import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from "@/lib/logger";

const BACKEND_URL = process.env.API_BASE_URL || 'http://localhost:8004';

/**
 * PATCH /api/sso/connections/[id]/status - Update SSO connection status (admin only)
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await getAccessToken();
    if (!auth.ok) {
      return auth.response;
    }

    const body = await request.json();

    const response = await fetch(
      `${BACKEND_URL}/api/sso/connections/${id}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('Failed to update SSO connection status:', error);
    return NextResponse.json(
      { error: 'Failed to update SSO connection' },
      { status: 500 }
    );
  }
}
