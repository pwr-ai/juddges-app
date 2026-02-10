import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_BASE_URL || 'http://localhost:8004';

/**
 * GET /api/sso/check-domain?domain=acme.com
 * Public endpoint - checks if SSO is enabled for a given email domain.
 * Used by the login form for domain-based SSO discovery.
 */
export async function GET(request: NextRequest) {
  try {
    const domain = request.nextUrl.searchParams.get('domain');

    if (!domain) {
      return NextResponse.json(
        { sso_enabled: false, error: 'Domain parameter required' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${BACKEND_URL}/api/sso/check-domain?domain=${encodeURIComponent(domain)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('SSO domain check failed:', error);
    return NextResponse.json({ sso_enabled: false }, { status: 200 });
  }
}
