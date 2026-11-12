import { isIP } from "net";

/**
 * Per-visitor rate-limit key for anonymous BFF traffic (issue #565).
 *
 * The backend limiter (`get_client_ip` in backend/app/rate_limiter.py) sees
 * this container's socket address on every proxied request, so without help
 * every signed-out visitor shares one bucket and one script can 429 search for
 * everyone. The backend honours `X-RateLimit-Client-IP` only alongside a
 * matching `X-API-Key`, so the value is trusted exactly as far as this BFF is.
 */
export const RATE_LIMIT_CLIENT_IP_HEADER = "X-RateLimit-Client-IP";

function isTrustedProxy(): boolean {
  const value = (process.env.TRUSTED_PROXY ?? "false").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/**
 * The visitor's address as reported by our reverse proxy, or `null`.
 *
 * Same contract as the backend's `TRUSTED_PROXY`: the leftmost
 * `X-Forwarded-For` entry is the real client only while the gateway
 * overwrites that header, so with the flag unset nothing is read and the
 * request falls back to the shared container bucket — the safe default.
 *
 * `X-Real-IP` is deliberately not consulted: Caddy passes a client-supplied
 * value through untouched (docs/how-to/mcp-server.md), so it is spoofable on
 * any site that does not explicitly overwrite it.
 */
export function getTrustedClientIp(request: Request): string | null {
  if (!isTrustedProxy()) return null;

  const forwardedFor = request.headers.get("x-forwarded-for");
  const first = forwardedFor?.split(",")[0]?.trim();
  if (!first || isIP(first) === 0) return null;
  return first;
}

/** Add the visitor's address to `headers` when it can be trusted. */
export function withClientIp(
  headers: Record<string, string>,
  request: Request
): Record<string, string> {
  const clientIp = getTrustedClientIp(request);
  if (clientIp) {
    headers[RATE_LIMIT_CLIENT_IP_HEADER] = clientIp;
  }
  return headers;
}
