/**
 * Sanitize a `next` query param destination.
 *
 * Used by the auth callback, the middleware redirect target, and the login
 * form to prevent open-redirect attacks. Only allows in-app relative paths
 * starting with a single `/` — protocol-relative `//host` and absolute URLs
 * fall back to `/`.
 */
export function sanitizeNextPath(nextParam: string | null | undefined): string {
  if (!nextParam) return "/";
  if (!nextParam.startsWith("/") || nextParam.startsWith("//")) return "/";
  return nextParam;
}
