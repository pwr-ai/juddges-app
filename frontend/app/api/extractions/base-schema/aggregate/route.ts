import { NextRequest } from "next/server";

import { proxyToBackend } from "@/app/api/utils/backend-proxy";

/**
 * POST /api/extractions/base-schema/aggregate → backend
 * POST /extractions/base-schema/aggregate (#707). proxyToBackend requires a
 * signed-in session and forwards the Bearer token, which the backend's
 * get_current_user dependency checks.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend({ path: "/extractions/base-schema/aggregate", method: "POST", body });
}
