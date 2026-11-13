/**
 * Collapse a concrete pathname into a route template for `page_viewed`.
 *
 * `/documents/153000000001006_II_K_000123_2020` → `/documents/[id]`. Counting
 * by template is what makes page views rankable per feature, and it keeps
 * identifiers (judgment ids, collection UUIDs, chat ids) out of app_events.
 * The query string never reaches this function: callers pass `usePathname()`,
 * which excludes it, so search text cannot leak in.
 *
 * Rule: a segment survives only if it looks like a static route name
 * (lowercase words joined by hyphens, as every static folder under `app/`
 * is named). Anything else — digits, uppercase, underscores, encoded
 * characters, very long segments — becomes `[id]`. `blog/<slug>` is the one
 * dynamic route whose values look static, so it is collapsed explicitly.
 */

const STATIC_SEGMENT = /^[a-z]+(?:-[a-z]+)*$/;
const MAX_STATIC_SEGMENT_LENGTH = 40;
const MAX_DEPTH = 4;

/** Parents whose next segment is always a slug, never a static child. */
const SLUG_PARENTS: Record<string, string> = { blog: "[slug]" };
/** Static children of a SLUG_PARENTS entry (e.g. `/blog/admin`). */
const SLUG_PARENT_STATIC_CHILDREN = new Set(["admin"]);

export function normalizeRoute(pathname: string | null | undefined): string {
  if (!pathname) return "/";
  const segments = pathname.split("/").filter(Boolean).slice(0, MAX_DEPTH);
  const out = segments.map((segment, index) => {
    const parent = index > 0 ? segments[index - 1] : undefined;
    if (
      index === 1 &&
      parent &&
      parent in SLUG_PARENTS &&
      !SLUG_PARENT_STATIC_CHILDREN.has(segment)
    ) {
      return SLUG_PARENTS[parent];
    }
    if (
      segment.length <= MAX_STATIC_SEGMENT_LENGTH &&
      STATIC_SEGMENT.test(segment)
    ) {
      return segment;
    }
    return "[id]";
  });
  return `/${out.join("/")}`;
}
