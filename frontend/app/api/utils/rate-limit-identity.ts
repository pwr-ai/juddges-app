import { createHash } from "node:crypto";

/**
 * Identity header for backend requests. The user id was verified by
 * supabase.auth.getUser() before this helper is called; only its one-way hash
 * crosses the BFF boundary.
 */
export function rateLimitIdentity(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

export function withRateLimitIdentity(
  headers: HeadersInit,
  userId: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) result[key] = value;
  } else if (headers instanceof Headers) {
    headers.forEach((value, key) => { result[key] = value; });
  } else {
    Object.assign(result, headers);
  }
  for (const key of Object.keys(result)) {
    if (key.toLowerCase() === "x-ratelimit-identity") delete result[key];
  }
  result["X-RateLimit-Identity"] = rateLimitIdentity(userId);
  return result;
}
