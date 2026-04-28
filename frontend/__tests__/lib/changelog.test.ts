import { parseChangelogEntry } from "@/lib/changelog";

describe("parseChangelogEntry", () => {
  it("extracts version from filename and date from _Generated on_ line", () => {
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
    expect(entry.body).not.toContain("# prod-v1.1.0");
  });

  it("returns null date when _Generated on_ line is missing", () => {
    const entry = parseChangelogEntry(
      "prod-v0.1.0.md",
      "# prod-v0.1.0\n\n## Summary\n",
    );
    expect(entry.date).toBeNull();
  });

  it("throws on unexpected filename", () => {
    expect(() => parseChangelogEntry("README.md", "# x")).toThrow();
  });
});
