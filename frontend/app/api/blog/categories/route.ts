import { NextRequest } from "next/server";

import { proxyPublicBlog } from "@/app/api/blog/public-proxy";

export async function GET(request: NextRequest): Promise<Response> {
  return proxyPublicBlog("/blog/categories", request.signal);
}
