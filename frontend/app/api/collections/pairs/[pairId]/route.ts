import { NextRequest } from "next/server";

import { proxyToBackend } from "@/app/api/utils/backend-proxy";

/** GET /api/collections/pairs/[pairId] → backend GET /collections/pairs/{pairId} (Foundation). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pairId: string }> },
) {
  const { pairId } = await params;
  return proxyToBackend({ path: `/collections/pairs/${encodeURIComponent(pairId)}` });
}

/** DELETE /api/collections/pairs/[pairId] → backend DELETE /collections/pairs/{pairId} (Foundation). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ pairId: string }> },
) {
  const { pairId } = await params;
  return proxyToBackend({ path: `/collections/pairs/${encodeURIComponent(pairId)}`, method: "DELETE" });
}
