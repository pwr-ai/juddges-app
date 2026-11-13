/**
 * Client for the v2 (Weaviate, test) search engine — issue #867.
 *
 * The browser calls the `/api/search/v2` BFF route, which adds the user's
 * Supabase JWT and the backend API key before forwarding to `POST /search/v2`.
 */
import type { components } from "@/lib/api/generated/openapi";

export type SearchV2Request = Pick<
  components["schemas"]["SearchV2Request"],
  "query"
> &
  Partial<Omit<components["schemas"]["SearchV2Request"], "query">>;
export type SearchV2Result = components["schemas"]["SearchV2Result"];
export type SearchV2Response = components["schemas"]["SearchV2Response"];

export class SearchV2Error extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SearchV2Error";
  }
}

export async function searchV2(
  request: SearchV2Request,
  signal?: AbortSignal
): Promise<SearchV2Response> {
  const response = await fetch("/api/search/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.error === "string" ? data.error : `Search v2 failed (${response.status})`;
    throw new SearchV2Error(message, response.status);
  }
  return data as SearchV2Response;
}
