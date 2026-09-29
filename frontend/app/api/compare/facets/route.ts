import { NextRequest } from "next/server";

import { proxyToBackend } from "@/app/api/utils/backend-proxy";

/** POST /api/compare/facets → backend POST /compare/facets (Foundation). */
export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend({ path: "/compare/facets", method: "POST", body });
}
