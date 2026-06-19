import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap.
 *
 * Lists only the publicly crawlable routes (the unauthenticated allow-list in
 * `lib/supabase/middleware.ts`). Authenticated app routes are intentionally
 * excluded — they redirect to login and are not indexable.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ecosystem`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
