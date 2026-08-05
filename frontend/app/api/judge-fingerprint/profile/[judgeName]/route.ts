import { NextRequest, NextResponse } from 'next/server';

import { proxyJudgeFingerprint } from '../../_proxy';

interface RouteContext {
  params: Promise<{ judgeName: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { judgeName } = await params;
  return proxyJudgeFingerprint(
    request,
    `/judge-fingerprint/profile/${encodeURIComponent(judgeName)}`,
  );
}
