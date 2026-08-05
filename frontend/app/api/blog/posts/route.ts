import { NextRequest } from "next/server";

import { proxyPublicBlog } from "@/app/api/blog/public-proxy";

const SUPPORTED_QUERY_PARAMETERS = [
  "page",
  "limit",
  "category",
  "tag",
  "search",
  "sort",
  "order",
] as const;

export async function GET(request: NextRequest): Promise<Response> {
  const incoming = request.nextUrl.searchParams;
  const forwarded = new URLSearchParams();

  for (const parameter of SUPPORTED_QUERY_PARAMETERS) {
    const value = incoming.get(parameter);
    if (value !== null) forwarded.set(parameter, value);
  }

  const query = forwarded.toString();
  return proxyPublicBlog(`/blog/posts${query ? `?${query}` : ""}`);
}
