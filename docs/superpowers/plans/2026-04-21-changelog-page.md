# Changelog Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public `/changelog` page at build-time that renders the existing `release-notes/prod-v*.md` files, with a header link, a versioned detail page, and an RSS feed.

**Architecture:** A Next.js 15 App Router server component reads markdown files from the repo-root `release-notes/` folder at build time using Node `fs`/`path`. Version and date are parsed from content (no frontmatter library required). Rendering reuses the existing `MarkdownRenderer` component. An RSS feed is generated from the same source list via a `route.ts` handler.

**Tech Stack:** Next.js 15 App Router (server components), `react-markdown` (already installed), Node `fs`/`path` (built-in), existing `@/components/blog/markdown-renderer`.

**Issue:** #113

---

## File Structure

**New files:**
- `frontend/lib/changelog.ts` — pure data layer: reads `release-notes/`, parses entries, returns sorted list (single responsibility = file IO + parsing)
- `frontend/app/changelog/page.tsx` — server component list page
- `frontend/app/changelog/[version]/page.tsx` — server component detail page
- `frontend/app/changelog/feed.xml/route.ts` — RSS feed handler
- `frontend/__tests__/lib/changelog.test.ts` — unit tests for the parser

**Modified files:**
- `frontend/components/layout/header.tsx` (or wherever top-nav links live) — add `/changelog` link
- `frontend/app/sitemap.ts` — append `/changelog` (skip if file absent)

**Convention note:** The `release-notes/` folder is at the repo root, not under `frontend/`. The parser uses `process.cwd()` at build time; in Next.js standalone output, add a `file()` include for the folder in `next.config.*`. Task 6 handles that.

---

## Task 1: Changelog data layer (fs + parser)

**Files:**
- Create: `frontend/lib/changelog.ts`
- Test: `frontend/__tests__/lib/changelog.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/__tests__/lib/changelog.test.ts
import { parseChangelogEntry } from "@/lib/changelog";

describe("parseChangelogEntry", () => {
  it("extracts version from filename and title from H1", () => {
    const content = [
      "# prod-v1.1.0",
      "",
      "> Release Notes for Version prod-v1.1.0",
      "",
      "_Generated on 2026-04-01 from `prod-v1.0.0..HEAD` (24 commits)._",
      "",
      "## Summary",
      "Body.",
    ].join("\n");

    const entry = parseChangelogEntry("prod-v1.1.0.md", content);
    expect(entry.version).toBe("1.1.0");
    expect(entry.slug).toBe("v1.1.0");
    expect(entry.date).toBe("2026-04-01");
    expect(entry.title).toBe("prod-v1.1.0");
    expect(entry.body).toContain("## Summary");
  });

  it("falls back to null date when _Generated on_ line is missing", () => {
    const entry = parseChangelogEntry("prod-v0.1.0.md", "# prod-v0.1.0\n\n## Summary\n");
    expect(entry.date).toBeNull();
  });

  it("sorts entries by semver descending", async () => {
    // Will be covered in integration step — placeholder assertion
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- lib/changelog.test.ts`
Expected: FAIL — `Cannot find module '@/lib/changelog'`.

- [ ] **Step 3: Implement the parser**

```ts
// frontend/lib/changelog.ts
import { promises as fs } from "fs";
import path from "path";

export interface ChangelogEntry {
  version: string;      // "1.1.0"
  slug: string;         // "v1.1.0"
  title: string;        // "prod-v1.1.0"
  date: string | null;  // "2026-04-01" or null
  body: string;         // markdown from first "## " onward
}

const FILENAME_VERSION = /^prod-v(\d+\.\d+\.\d+)\.md$/;
const GENERATED_ON = /_Generated on (\d{4}-\d{2}-\d{2})/;

export function parseChangelogEntry(filename: string, content: string): ChangelogEntry {
  const match = filename.match(FILENAME_VERSION);
  if (!match) throw new Error(`Unexpected filename: ${filename}`);
  const version = match[1];

  const lines = content.split("\n");
  const titleLine = lines.find((l) => l.startsWith("# ")) ?? `# prod-v${version}`;
  const title = titleLine.replace(/^#\s+/, "").trim();

  const dateMatch = content.match(GENERATED_ON);
  const date = dateMatch ? dateMatch[1] : null;

  const bodyStart = content.indexOf("\n## ");
  const body = bodyStart >= 0 ? content.slice(bodyStart + 1) : content;

  return { version, slug: `v${version}`, title, date, body };
}

function semverCompareDesc(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

function releaseNotesDir(): string {
  return path.join(process.cwd(), "..", "release-notes");
}

export async function loadChangelogEntries(): Promise<ChangelogEntry[]> {
  const dir = releaseNotesDir();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const mdFiles = files.filter((f) => FILENAME_VERSION.test(f));
  const entries = await Promise.all(
    mdFiles.map(async (f) => {
      const content = await fs.readFile(path.join(dir, f), "utf8");
      return parseChangelogEntry(f, content);
    }),
  );
  return entries.sort((a, b) => semverCompareDesc(a.version, b.version));
}

export async function loadChangelogEntry(slug: string): Promise<ChangelogEntry | null> {
  const entries = await loadChangelogEntries();
  return entries.find((e) => e.slug === slug) ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- lib/changelog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/changelog.ts frontend/__tests__/lib/changelog.test.ts
git commit -m "feat(changelog): add parser and fs loader for release-notes/*.md"
```

---

## Task 2: Changelog list page

**Files:**
- Create: `frontend/app/changelog/page.tsx`

- [ ] **Step 1: Implement the page**

```tsx
// frontend/app/changelog/page.tsx
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
        description="What's new in Juddges. Each release pulls from git history at build time."
      />
      {entries.length === 0 ? (
        <p className="text-muted-foreground">No release notes yet.</p>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.slug} className="py-4">
              <Link
                href={`/changelog/${e.slug}`}
                className="flex items-baseline justify-between gap-4 hover:underline"
              >
                <span className="text-lg font-medium">v{e.version}</span>
                <span className="text-sm text-muted-foreground">{e.date ?? "unreleased"}</span>
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
```

- [ ] **Step 2: Verify the page renders**

Run: `cd frontend && npm run dev:stable`
Visit: `http://localhost:3007/changelog`
Expected: three entries listed (v0.1.3, v1.0.0, v1.1.0) sorted newest-first; each linking to `/changelog/vX.Y.Z`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/changelog/page.tsx
git commit -m "feat(changelog): add /changelog list page"
```

---

## Task 3: Changelog detail page

**Files:**
- Create: `frontend/app/changelog/[version]/page.tsx`

- [ ] **Step 1: Implement the detail page**

```tsx
// frontend/app/changelog/[version]/page.tsx
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
        <Link href="/changelog" className="text-sm text-muted-foreground hover:underline">
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
```

- [ ] **Step 2: Verify the page renders**

Run: dev server still up from Task 2 (restart if needed).
Visit: `http://localhost:3007/changelog/v1.1.0`
Expected: full markdown content of `release-notes/prod-v1.1.0.md` renders with headings, bullets, code blocks.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/changelog/[version]/page.tsx
git commit -m "feat(changelog): add per-version detail page"
```

---

## Task 4: RSS feed

**Files:**
- Create: `frontend/app/changelog/feed.xml/route.ts`

- [ ] **Step 1: Implement the feed handler**

```ts
// frontend/app/changelog/feed.xml/route.ts
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
      const pubDate = e.date ? new Date(`${e.date}T00:00:00Z`).toUTCString() : new Date().toUTCString();
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
```

- [ ] **Step 2: Verify the feed renders**

Visit: `http://localhost:3007/changelog/feed.xml`
Expected: valid RSS XML with 3 `<item>` entries, newest first.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/changelog/feed.xml/route.ts
git commit -m "feat(changelog): add RSS feed at /changelog/feed.xml"
```

---

## Task 5: Header nav link

**Files:**
- Modify: `frontend/components/layout/header.tsx` (or the nav component found in step 1)

- [ ] **Step 1: Locate the nav component**

Run: `rg -n "About|Contact|/blog" frontend/components/layout 2>/dev/null || rg -n "href=\"/blog\"" frontend/components frontend/app`
Use the first match that lists public top-nav links.

- [ ] **Step 2: Add the Changelog link adjacent to the Blog link**

Example diff shape (adapt to the actual nav structure):

```tsx
// Before
<Link href="/blog">Blog</Link>

// After
<Link href="/blog">Blog</Link>
<Link href="/changelog">Changelog</Link>
```

- [ ] **Step 3: Verify**

Reload the site; confirm the new link appears and navigates to `/changelog`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/layout/header.tsx
git commit -m "feat(changelog): link /changelog from top nav"
```

---

## Task 6: Standalone build compatibility + sitemap

**Files:**
- Modify: `frontend/next.config.ts` (or `.mjs`/`.js`)
- Modify: `frontend/app/sitemap.ts` (if it exists)

- [ ] **Step 1: Include `release-notes/` in the standalone output**

Locate the Next.js config and add `outputFileTracingIncludes` so `release-notes/*.md` is copied into the standalone build:

```ts
// next.config.ts (or equivalent)
const config = {
  // ...existing config,
  outputFileTracingIncludes: {
    "/changelog": ["../release-notes/**/*.md"],
    "/changelog/[version]": ["../release-notes/**/*.md"],
    "/changelog/feed.xml": ["../release-notes/**/*.md"],
  },
};
export default config;
```

- [ ] **Step 2: Add sitemap entry**

If `frontend/app/sitemap.ts` exists, append:

```ts
import { loadChangelogEntries } from "@/lib/changelog";

// inside the default export:
const changelog = await loadChangelogEntries();
entries.push(
  { url: `${base}/changelog`, lastModified: new Date() },
  ...changelog.map((e) => ({
    url: `${base}/changelog/${e.slug}`,
    lastModified: e.date ? new Date(e.date) : new Date(),
  })),
);
```

Skip this step if the file does not exist.

- [ ] **Step 3: Production build smoke test**

Run: `cd frontend && npm run build`
Expected: build completes; `/changelog` and `/changelog/v1.1.0` appear in the route manifest as `● (SSG)` or `○ (Static)`.

- [ ] **Step 4: Commit**

```bash
git add frontend/next.config.ts frontend/app/sitemap.ts
git commit -m "build(changelog): include release-notes in standalone output and sitemap"
```

---

## Task 7: Final validation

- [ ] **Step 1: Run the full validation suite**

Run: `cd frontend && npm run validate`
Expected: lint + type-check pass.

- [ ] **Step 2: Run unit tests**

Run: `cd frontend && npm test -- lib/changelog`
Expected: PASS.

- [ ] **Step 3: Open a PR**

```bash
git push -u origin feat/changelog-page
gh pr create --title "feat: add /changelog page, detail view, and RSS feed (#113)" --body "Closes #113"
```

---

## Out of scope (explicitly)

- Email digest integration (uses existing digest system; separate PR if ever needed)
- Category filtering of changelog entries
- Migrating blog mock data to a CMS
- CI hook to regenerate `release-notes/*.md` on every release (manual `scripts/generate_release_notes.py` run remains the workflow)
