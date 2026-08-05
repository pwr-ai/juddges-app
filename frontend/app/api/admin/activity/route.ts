import { NextRequest, NextResponse } from 'next/server';

import { proxyAdminRequest } from '../_proxy';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyAdminRequest(request, `/api/admin/activity${request.nextUrl.search}`);
}
