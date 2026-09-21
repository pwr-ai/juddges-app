import { NextRequest } from "next/server";

import { proxyToBackend } from "@/app/api/utils/backend-proxy";

/** POST /api/collections/from-filter → backend POST /collections/from-filter (Foundation). */
export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend({ path: "/collections/from-filter", method: "POST", body });
}
