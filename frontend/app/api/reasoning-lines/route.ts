import { NextRequest, NextResponse } from 'next/server';

import { proxyReasoningLines } from './_proxy';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyReasoningLines(request);
}
