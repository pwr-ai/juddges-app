import { NextRequest, NextResponse } from 'next/server';

import { proxyJudgeFingerprint } from '../_proxy';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJudgeFingerprint(
    request,
    `/judge-fingerprint/search${request.nextUrl.search}`,
  );
}
