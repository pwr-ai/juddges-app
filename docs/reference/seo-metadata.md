# SEO & Metadata Reference

How search-engine and social-sharing metadata is produced for the Next.js
frontend (`frontend/`). The app is **auth-gated**: only the unauthenticated
allow-list in `lib/supabase/middleware.ts` is crawlable, so SEO is intentionally
scoped to those public surfaces.

## Canonical site URL

Single source of truth: `frontend/lib/site.ts` → `SITE_URL` / `siteMetadataBase`.

Resolution precedence:

1. `NEXT_PUBLIC_SITE_URL`
2. `VERCEL_PROJECT_PRODUCTION_URL`
3. `VERCEL_URL`
4. Fallback `https://juddges.augustyniak.ai`

The value is normalised to a bare origin (no trailing slash). Consumed by the
root layout `metadataBase`, `robots.ts`, `sitemap.ts`, and the changelog RSS
feed (`app/changelog/feed.xml/route.ts`). **Set `NEXT_PUBLIC_SITE_URL` in
production** so canonical/OG/sitemap URLs are correct.

## What lives where

| Concern | File |
|---|---|
| Global metadata (title template, description, keywords, OG, Twitter, robots) | `app/layout.tsx` |
| Title template | `%s · Juddges` — per-page `title` values must be **bare** (e.g. `"Changelog"`, not `"Changelog — Juddges"`) to avoid double-branding |
| `robots.txt` | `app/robots.ts` — allows `/`, disallows API/admin/auth + authenticated app sections, points to the sitemap |
| `sitemap.xml` | `app/sitemap.ts` — lists only public routes (`/`, `/about`, `/ecosystem`) |
| Open Graph image (1200×630, dynamic) | `app/opengraph-image.tsx` — rendered via `next/og` `ImageResponse` in the Editorial Jurisprudence palette; no binary asset |
| Twitter image | `app/twitter-image.tsx` — re-exports the OG image |
| JSON-LD structured data | `lib/structured-data.ts` (Organization + WebSite + SoftwareApplication `@graph`) rendered by `components/JsonLd.tsx` in the root layout |
| PWA manifest | `app/manifest.ts` |

## Middleware interaction (important)

The middleware matcher excludes static-extension paths (`.txt`, `.xml`, …), so
`/robots.txt` and `/sitemap.xml` are served without auth. The metadata **image**
routes (`/opengraph-image`, `/twitter-image`) have **no extension**, so they are
matched by middleware and must be present in the unauthenticated allow-list in
`lib/supabase/middleware.ts` — otherwise social/search crawlers receive a 307
redirect to `/auth/login` instead of the image.

## Adding a new public (indexable) page

1. Add its path prefix to the allow-list in `lib/supabase/middleware.ts`.
2. Add an entry to `app/sitemap.ts`.
3. Export page `metadata` with a **bare** `title` plus a `description`
   (and `alternates.canonical` if the path differs from the slug).

> Do **not** add `/search` or its APIs to the public allow-list — search stays
> auth-gated by product decision.

## Verify locally

```bash
cd frontend && npm run build && npx next start -p 3099
curl -s localhost:3099/robots.txt
curl -s localhost:3099/sitemap.xml
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' localhost:3099/opengraph-image  # 200 image/png
```

External validators: Google Rich Results Test, Schema.org Validator, Facebook
Sharing Debugger, PageSpeed Insights.
