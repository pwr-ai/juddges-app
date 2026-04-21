import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { loadChangelogEntries, loadChangelogEntry } from "@/lib/changelog";
import { PageContainer } from "@/lib/styles/components";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";

interface PageProps {
  params: Promise<{ version: string }>;
}

export async function generateStaticParams() {
  const entries = await loadChangelogEntries();
  return entries.map((e) => ({ version: e.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { version } = await params;
  const entry = await loadChangelogEntry(version);
  if (!entry) return { title: "Release not found — Juddges" };
  return {
    title: `${entry.title} — Juddges Changelog`,
    description: `Release notes for Juddges ${entry.title}.`,
  };
}

export default async function ChangelogDetailPage({ params }: PageProps) {
  const { version } = await params;
  const entry = await loadChangelogEntry(version);
  if (!entry) notFound();

  return (
    <PageContainer>
      <div className="mb-6">
        <Link
          href="/changelog"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All releases
        </Link>
      </div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">{entry.title}</h1>
        {entry.date && (
          <p className="mt-1 text-sm text-muted-foreground">Released {entry.date}</p>
        )}
      </header>
      <MarkdownRenderer content={entry.body} />
    </PageContainer>
  );
}
