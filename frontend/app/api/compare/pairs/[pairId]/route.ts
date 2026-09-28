import { NextRequest } from "next/server";

import { proxyToBackend } from "@/app/api/utils/backend-proxy";

/** GET /api/compare/pairs/[pairId] → backend GET /compare/pairs/{pairId} (Foundation). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pairId: string }> },
) {
  const { pairId } = await params;
  return proxyToBackend({ path: `/compare/pairs/${encodeURIComponent(pairId)}` });
}
