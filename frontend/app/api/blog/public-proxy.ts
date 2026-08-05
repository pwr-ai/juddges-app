import { NextResponse } from "next/server";

import { getBackendUrl } from "@/app/api/utils/backend-url";
import logger from "@/lib/logger";

const routeLogger = logger.child("public-blog-api");
const UPSTREAM_TIMEOUT_MS = 8_000;

const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
] as const;

export async function proxyPublicBlog(
  path: string,
  downstreamSignal: AbortSignal,
): Promise<Response> {
  const apiKey = process.env.BACKEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { detail: "Blog service is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const upstreamController = new AbortController();
  const cancelUpstream = (): void => {
    upstreamController.abort(
      downstreamSignal.reason ?? new DOMException("Client disconnected", "AbortError"),
    );
  };
  if (downstreamSignal.aborted) cancelUpstream();
  else downstreamSignal.addEventListener("abort", cancelUpstream, { once: true });

  const timeout = setTimeout(() => {
    upstreamController.abort(new DOMException("Blog backend timed out", "TimeoutError"));
  }, UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(`${getBackendUrl().replace(/\/$/, "")}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      cache: "no-store",
      signal: upstreamController.signal,
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
    const abortReason = upstreamController.signal.reason;
    if (abortReason instanceof DOMException && abortReason.name === "TimeoutError") {
      return NextResponse.json(
        { detail: "Blog service timed out" },
        { status: 504, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (downstreamSignal.aborted) {
      return NextResponse.json(
        { detail: "Blog request was cancelled" },
        { status: 499, headers: { "Cache-Control": "no-store" } },
      );
    }
    routeLogger.error("Public blog backend request failed", error, { path });
    return NextResponse.json(
      { detail: "Blog service is unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
    downstreamSignal.removeEventListener("abort", cancelUpstream);
  }
}
