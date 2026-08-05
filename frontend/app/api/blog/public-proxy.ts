import { NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import logger from "@/lib/logger";

const routeLogger = logger.child("public-blog-api");

const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
] as const;

export async function proxyPublicBlog(path: string): Promise<Response> {
  const apiKey = process.env.BACKEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { detail: "Blog service is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch(`${getBackendUrl().replace(/\/$/, "")}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      cache: "no-store",
    });

    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const name of SAFE_RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new Response(await response.arrayBuffer(), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    routeLogger.error("Public blog backend request failed", error, { path });
    return NextResponse.json(
      { detail: "Blog service is unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
