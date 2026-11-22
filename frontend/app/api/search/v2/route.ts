import { NextRequest, NextResponse } from "next/server";

import { proxySearchV2 } from "./_lib/proxy";

/**
 * BFF for the full-corpus search engine (Weaviate v2, issue #867).
 * Signed-in users only; see `proxySearchV2`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxySearchV2(request, "/search/v2", {
    method: "POST",
    body: await request.text(),
  });
}
