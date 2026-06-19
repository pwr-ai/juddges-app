/**
 * Canonical site URL resolution.
 *
 * Single source of truth for the production origin used by metadata,
 * `robots.ts`, `sitemap.ts`, OG images, and the changelog RSS feed.
 *
 * Precedence: explicit `NEXT_PUBLIC_SITE_URL`, then Vercel-provided hosts,
 * then the production fallback. The value is normalised to a bare origin
 * (scheme + host, no trailing slash).
 */

const FALLBACK_SITE_URL = "https://juddges.augustyniak.ai";

function resolveSiteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    FALLBACK_SITE_URL;

  try {
    const url = configured.startsWith("http") ? configured : `https://${configured}`;
    return new URL(url).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

/** Bare production origin, e.g. `https://juddges.augustyniak.ai` (no trailing slash). */
export const SITE_URL = resolveSiteUrl();

/** `metadataBase` value for Next.js Metadata. */
export const siteMetadataBase = new URL(SITE_URL);
