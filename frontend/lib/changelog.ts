import { promises as fs } from "fs";
import path from "path";

export interface ChangelogEntry {
  version: string;
  slug: string;
  title: string;
  date: string | null;
  body: string;
}

const FILENAME_VERSION = /^prod-v(\d+\.\d+\.\d+)\.md$/;
const GENERATED_ON = /_Generated on (\d{4}-\d{2}-\d{2})/;

export function parseChangelogEntry(filename: string, content: string): ChangelogEntry {
  const match = filename.match(FILENAME_VERSION);
  if (!match) throw new Error(`Unexpected changelog filename: ${filename}`);
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
  const envDir = process.env.CHANGELOG_DIR;
  if (envDir) return envDir;
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
