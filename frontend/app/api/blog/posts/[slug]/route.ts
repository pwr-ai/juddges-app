import { NextRequest } from "next/server";

import { proxyPublicBlog } from "@/app/api/blog/public-proxy";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { slug } = await context.params;
  return proxyPublicBlog(
    `/blog/posts/${encodeURIComponent(slug)}`,
    request.signal,
  );
}
