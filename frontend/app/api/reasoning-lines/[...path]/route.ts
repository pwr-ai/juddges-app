import { NextRequest, NextResponse } from 'next/server';

import { proxyReasoningLines } from '../_proxy';

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function proxy(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { path } = await params;
  return proxyReasoningLines(request, path);
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
