import { NextRequest, NextResponse } from 'next/server';

import {
  methodNotAllowed,
  proxyAuthenticatedJson,
} from '@/app/api/_lib/authenticated-json-proxy';
import { buildQaRequest } from '@/app/api/qa/_request';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxyAuthenticatedJson(request, {
    upstreamPath: '/qa/invoke',
    transformBody: buildQaRequest,
  });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
