/**
 * Client for the full-corpus search engine (Weaviate v2, ~2.7M Polish
 * judgments) — issue #867.
 *
 * The browser calls the `/api/search/v2` BFF routes, which add the user's
 * Supabase JWT and the backend API key before forwarding to the backend.
 */
import type { components } from "@/lib/api/generated/openapi";

export type SearchV2Request = Pick<
  components["schemas"]["SearchV2Request"],
  "query"
> &
  Partial<Omit<components["schemas"]["SearchV2Request"], "query">>;
export type SearchV2Result = components["schemas"]["SearchV2Result"];
export type SearchV2Response = components["schemas"]["SearchV2Response"];
export type SearchV2Judgment = components["schemas"]["SearchV2Judgment"];

/** Message used when the BFF answers with a login redirect instead of JSON. */
export const SESSION_EXPIRED_MESSAGE =
  "Sesja wygasła. Zaloguj się ponownie, aby przeszukać pełną bazę.";

export class SearchV2Error extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SearchV2Error";
  }
}

/**
 * The parsed JSON body, or a `SearchV2Error`.
 *
 * An expired session makes the middleware answer the BFF call with a JSON 401
 * (older builds sent a 307 to `/auth/login`, which `fetch` follows into a 200
 * HTML login page). Both must surface as a 401, never as an empty result.
 */
async function readJson(response: Response, failure: string): Promise<unknown> {
  const contentType = response.headers?.get("content-type") ?? "";
  // The middleware answers an expired session on /api/* with a JSON 401.
  if (response.status === 401) {
    throw new SearchV2Error(SESSION_EXPIRED_MESSAGE, 401);
  }
  if (response.redirected || !contentType.includes("application/json")) {
    if (response.redirected || response.ok) {
      throw new SearchV2Error(SESSION_EXPIRED_MESSAGE, 401);
    }
    throw new SearchV2Error(`${failure} (${response.status})`, response.status);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as { error?: unknown } | null)?.error;
    throw new SearchV2Error(
      typeof error === "string" ? error : `${failure} (${response.status})`,
      response.status
    );
  }
  return data;
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
  const data = await readJson(response, "Search v2 failed");
  if (!Array.isArray((data as SearchV2Response | null)?.results)) {
    throw new SearchV2Error("Search v2 returned an unexpected response", 502);
  }
  return data as SearchV2Response;
}

/** URL of the full-corpus detail page; NSA ids contain slashes. */
export function fullJudgmentHref(judgmentId: string): string {
  return `/judgments/full/${encodeURIComponent(judgmentId)}`;
}

/** Where a full-corpus result opens: the app's judgment page when it has one. */
export function searchV2ResultHref(result: Pick<SearchV2Result, "judgment_id" | "supabase_id">): string {
  return result.supabase_id
    ? `/documents/${result.supabase_id}`
    : fullJudgmentHref(result.judgment_id);
}

export async function getJudgmentV2(
  judgmentId: string,
  signal?: AbortSignal
): Promise<SearchV2Judgment> {
  const response = await fetch(
    `/api/search/v2/judgments/${encodeURIComponent(judgmentId)}`,
    { headers: { Accept: "application/json" }, signal }
  );
  const data = await readJson(response, "Judgment request failed");
  if (typeof (data as SearchV2Judgment | null)?.judgment_id !== "string") {
    throw new SearchV2Error("Judgment request returned an unexpected response", 502);
  }
  return data as SearchV2Judgment;
}
