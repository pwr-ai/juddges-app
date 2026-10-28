/**
 * Build a /search href. Values are percent-encoded exactly once by
 * URLSearchParams - never pre-encode them with encodeURIComponent.
 */
export function buildSearchHref(
  params: Record<string, string | undefined | null>
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) sp.set(key, value);
  }
  // URLSearchParams emits '+' for spaces; keep %20 so links match encodeURIComponent output.
  const qs = sp.toString().replace(/\+/g, '%20');
  return qs ? `/search?${qs}` : '/search';
}
