import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';

interface RedeemInviteBody {
  code?: unknown;
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json()) as RedeemInviteBody;

  if (
    typeof body.code !== 'string' ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return NextResponse.json(
      { detail: { code: 'INVALID_REQUEST', message: 'Invite code, email and password are required.' } },
      { status: 400 }
    );
  }

  const response = await fetch(`${getBackendUrl()}/auth/invites/redeem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.BACKEND_API_KEY ?? '',
    },
    body: JSON.stringify({
      code: body.code,
      email: body.email,
      password: body.password,
    }),
  });

  // Pass the backend's own status and body through: a refused invite must
  // read as a refusal, not as a generic failure.
  return NextResponse.json(await response.json(), { status: response.status });
}
