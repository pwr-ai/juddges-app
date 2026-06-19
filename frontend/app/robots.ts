import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt
 *
 * Only marketing/landing routes are reachable unauthenticated (see
 * `lib/supabase/middleware.ts`); everything else 307-redirects to
 * `/auth/login`. We additionally disallow API, admin, auth and the
 * authenticated app sections so crawlers don't waste budget on
 * login-redirect URLs or index sensitive paths.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/auth/",
          "/settings/",
          "/search/",
          "/chat/",
          "/collections/",
          "/saved-searches/",
          "/extractions/",
          "/extract/",
          "/documents/",
          "/schema-chat/",
          "/reasoning-lines/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
