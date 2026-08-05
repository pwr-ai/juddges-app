import { NextRequest, NextResponse } from 'next/server';

import {
  methodNotAllowed,
  proxyAuthenticatedJson,
} from '@/app/api/_lib/authenticated-json-proxy';

function qaRequest(body: unknown): unknown {
  const input = body && typeof body === 'object'
    ? (body as Record<string, unknown>)
    : {};

  return {
    input: {
      question: input.question,
      max_documents: input.max_documents ?? 0,
      score_threshold: input.score_threshold ?? 0,
      chat_history: input.chat_history ?? [],
    },
    config: {},
    kwargs: {},
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxyAuthenticatedJson(request, {
    upstreamPath: '/qa/invoke',
    transformBody: qaRequest,
  });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
