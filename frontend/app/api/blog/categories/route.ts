import { proxyPublicBlog } from "@/app/api/blog/public-proxy";

export async function GET(): Promise<Response> {
  return proxyPublicBlog("/blog/categories");
}
