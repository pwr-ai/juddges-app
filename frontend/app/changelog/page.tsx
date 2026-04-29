import Link from "next/link";
import type { Metadata } from "next";
import { loadChangelogEntries } from "@/lib/changelog";
import { PageContainer, Header } from "@/lib/styles/components";

export const metadata: Metadata = {
  title: "Changelog — Juddges",
  description: "Release notes and product updates for Juddges.",
};

export const dynamic = "force-static";

export default async function ChangelogPage() {
  const entries = await loadChangelogEntries();

  return (
    <PageContainer>
      <Header
        title="Changelog"
        description="What's new in Juddges. Each release is generated from git history at build time."
      />
      {entries.length === 0 ? (
        <p className="text-muted-foreground">No release notes yet.</p>
      ) : (
        <ul className="mt-6 divide-y">
          {entries.map((e) => (
            <li key={e.slug} className="py-4">
              <Link
                href={`/changelog/${e.slug}`}
                className="flex items-baseline justify-between gap-4 hover:underline"
              >
                <span className="text-lg font-medium">v{e.version}</span>
                <span className="text-sm text-muted-foreground">
                  {e.date ?? "unreleased"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-sm text-muted-foreground">
        <Link href="/changelog/feed.xml" className="underline">
          RSS feed
        </Link>
      </p>
    </PageContainer>
  );
}
