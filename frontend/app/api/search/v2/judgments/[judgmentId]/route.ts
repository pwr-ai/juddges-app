import { NextRequest, NextResponse } from "next/server";

import { parseFullJudgmentId } from "@/lib/search/full-judgment-id";

import { proxySearchV2 } from "../../_lib/proxy";

/**
 * BFF for one judgment of the full corpus (Weaviate v2), full text included.
 * Signed-in users only; the middleware already login-redirects a guest.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ judgmentId: string }> }
): Promise<NextResponse> {
  const judgmentId = parseFullJudgmentId((await params).judgmentId);
  if (!judgmentId) {
    return NextResponse.json({ error: "Invalid judgment id" }, { status: 400 });
  }
  return proxySearchV2(
    request,
    `/search/v2/judgments/${encodeURIComponent(judgmentId)}`,
    { method: "GET" }
  );
}
