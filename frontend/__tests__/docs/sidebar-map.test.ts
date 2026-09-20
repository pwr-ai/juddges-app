/**
 * docs/reference/sidebar-map.md documented 6 routes while the sidebar rendered
 * 17 (APP_STATUS_2026-08-21 §5b called it stale). This test makes the doc a
 * mirror of lib/navigation/flows.ts: every step href must appear in the doc
 * as an inline-code route, and the doc must not list routes the sidebar does
 * not render. The "Not in the sidebar" section is excluded on purpose.
 */
import { readFileSync } from "fs";
import path from "path";

import { FLOWS } from "@/lib/navigation/flows";

const DOC = path.resolve(__dirname, "../../../docs/reference/sidebar-map.md");
const ALWAYS = ["/", "/saved-searches", "/topic-modeling", "/admin"]; // dashboard + admin group, defined in app-sidebar.tsx

function routesInDoc(): string[] {
  const md = readFileSync(DOC, "utf8");
  const sidebarPart = md.split("## Not in the sidebar")[0];
  const seen = new Set<string>();
  for (const m of sidebarPart.matchAll(/`(\/[a-z0-9\-\/]*)`/g)) seen.add(m[1]);
  return [...seen];
}

describe("docs/reference/sidebar-map.md", () => {
  const expected = new Set([...ALWAYS, ...FLOWS.flatMap((f) => f.steps.map((s) => s.href))]);

  it("lists every route the sidebar renders", () => {
    const doc = new Set(routesInDoc());
    for (const href of expected) expect(doc.has(href)).toBe(true);
  });

  it("does not list routes the sidebar does not render", () => {
    for (const href of routesInDoc()) {
      if (href.startsWith("/documents/") || href.startsWith("/auth/")) continue; // reader + sign-in are mentioned in prose
      expect(expected.has(href)).toBe(true);
    }
  });
});
