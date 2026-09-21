import { NextRequest } from "next/server";

import { proxyToBackend } from "@/app/api/utils/backend-proxy";

/**
 * POST /api/compare/export → backend POST /compare/export (Foundation).
 * Streams the CSV bytes through unchanged; the filename lives in
 * `content-disposition`, row count in `x-rows-count`.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend({
    path: "/compare/export",
    method: "POST",
    body,
    passthroughHeaders: ["content-type", "content-disposition", "x-rows-count"],
  });
}
