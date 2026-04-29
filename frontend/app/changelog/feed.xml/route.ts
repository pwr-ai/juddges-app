import { loadChangelogEntries } from "@/lib/changelog";

export const dynamic = "force-static";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://juddges.app";
  const entries = await loadChangelogEntries();

  const items = entries
    .map((e) => {
      const pubDate = e.date
        ? new Date(`${e.date}T00:00:00Z`).toUTCString()
        : new Date().toUTCString();
      const link = `${siteUrl}/changelog/${e.slug}`;
      return `
    <item>
      <title>${escapeXml(e.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(e.body.slice(0, 500))}</description>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Juddges Changelog</title>
    <link>${siteUrl}/changelog</link>
    <description>Release notes for Juddges.</description>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
