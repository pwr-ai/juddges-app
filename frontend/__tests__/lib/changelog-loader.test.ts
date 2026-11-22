/**
 * @jest-environment node
 */
import path from "path";
import { loadChangelogEntries, loadChangelogEntry } from "@/lib/changelog";
import { logger } from "@/lib/logger";

const REPO_RELEASE_NOTES = path.join(__dirname, "..", "..", "..", "release-notes");

describe("loadChangelogEntries", () => {
  const original = process.env.CHANGELOG_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.CHANGELOG_DIR;
    else process.env.CHANGELOG_DIR = original;
    jest.restoreAllMocks();
  });

  it("loads the repo release notes via CHANGELOG_DIR (as the image sets it)", async () => {
    process.env.CHANGELOG_DIR = REPO_RELEASE_NOTES;
    const entries = await loadChangelogEntries();
    expect(entries.length).toBeGreaterThan(0);
    const first = entries[0];
    expect(await loadChangelogEntry(first.slug)).not.toBeNull();
    expect(await loadChangelogEntry("v0.0.0-nope")).toBeNull();
  });

  it("logs an error once instead of failing silently when the directory is missing", async () => {
    process.env.CHANGELOG_DIR = path.join(REPO_RELEASE_NOTES, "does-not-exist");
    const spy = jest.spyOn(logger, "error").mockImplementation(() => undefined);
    expect(await loadChangelogEntries()).toEqual([]);
    expect(await loadChangelogEntries()).toEqual([]);
    // once per process, not on every call
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
