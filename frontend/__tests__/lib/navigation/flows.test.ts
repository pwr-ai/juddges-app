/**
 * flows.ts is the single source of truth for the signed-in sidebar and the
 * FlowStepper. These tests pin the route inventory (spec §4, #690) so a
 * refactor cannot silently drop a destination, and pin the matching rules
 * the stepper relies on.
 */
import {
  FLOWS,
  findFlowStep,
  isStepActive,
  visibleSteps,
} from "@/lib/navigation/flows";

const allHrefs = FLOWS.flatMap((f) => f.steps.map((s) => s.href));

describe("FLOWS inventory", () => {
  it("has the four flows in order", () => {
    expect(FLOWS.map((f) => f.id)).toEqual(["ask", "explore", "code", "case"]);
  });

  it("keeps every route the sidebar rendered before #690, plus the two extraction routes", () => {
    const expected = [
      "/search", "/chat", "/history",
      "/search/extractions", "/search/extractions?view=stats", "/collections", "/topics",
      "/schemas", "/extract", "/extractions",
      "/precedents", "/reasoning-lines", "/judge-fingerprint", "/argumentation-analysis",
    ];
    expect([...allHrefs].sort()).toEqual([...expected].sort());
  });

  it("does not promote hidden routes", () => {
    expect(allHrefs).not.toContain("/dataset-comparison");
    expect(allHrefs).not.toContain("/statistics");
  });

  it("marks judge fingerprint and argumentation analysis admin-only", () => {
    const caseFlow = FLOWS.find((f) => f.id === "case")!;
    const adminOnly = caseFlow.steps.filter((s) => s.adminOnly).map((s) => s.href);
    expect(adminOnly.sort()).toEqual(["/argumentation-analysis", "/judge-fingerprint"]);
  });

  it("uses only navigation.* label keys", () => {
    for (const f of FLOWS) {
      expect(f.labelKey.startsWith("navigation.")).toBe(true);
      for (const s of f.steps) expect(s.labelKey.startsWith("navigation.")).toBe(true);
    }
  });
});

describe("isStepActive", () => {
  const exact = { href: "/search", labelKey: "navigation.searchJudgments", icon: () => null, match: "exact" } as const;
  const prefix = { href: "/collections", labelKey: "navigation.researchCollections", icon: () => null, match: "prefix" } as const;

  it("exact matches only the same path", () => {
    expect(isStepActive(exact as never, "/search")).toBe(true);
    expect(isStepActive(exact as never, "/search/extractions")).toBe(false);
  });

  it("prefix matches the path and its children, not sibling prefixes", () => {
    expect(isStepActive(prefix as never, "/collections")).toBe(true);
    expect(isStepActive(prefix as never, "/collections/abc")).toBe(true);
    expect(isStepActive(prefix as never, "/collectionsX")).toBe(false);
  });
});

describe("visibleSteps / findFlowStep", () => {
  it("hides admin-only steps from non-admins and counts only visible steps", () => {
    const caseFlow = FLOWS.find((f) => f.id === "case")!;
    expect(visibleSteps(caseFlow, false).map((s) => s.href)).toEqual(["/precedents", "/reasoning-lines"]);
    expect(visibleSteps(caseFlow, true)).toHaveLength(4);
  });

  it("resolves a pathname to its flow, 1-based index and visible total", () => {
    expect(findFlowStep("/reasoning-lines/42", false)).toMatchObject({
      flow: expect.objectContaining({ id: "case" }),
      index: 2,
      total: 2,
    });
    expect(findFlowStep("/judge-fingerprint", true)).toMatchObject({ index: 3, total: 4 });
  });

  it("does not resolve an admin-only step for a non-admin", () => {
    expect(findFlowStep("/judge-fingerprint", false)).toBeNull();
  });

  it("/search/extractions belongs to Explore, not Ask, and /extract is not /extractions", () => {
    expect(findFlowStep("/search/extractions", false)?.flow.id).toBe("explore");
    expect(findFlowStep("/extract", false)?.step.href).toBe("/extract");
    expect(findFlowStep("/extractions/9", false)?.step.href).toBe("/extractions");
  });

  it("distinguishes the list and statistics steps of /search/extractions by the view param", () => {
    expect(findFlowStep("/search/extractions", false, "?view=stats")?.step.href).toBe("/search/extractions?view=stats");
    expect(findFlowStep("/search/extractions", false, "")?.step.href).toBe("/search/extractions");
    expect(findFlowStep("/search/extractions", false)?.step.href).toBe("/search/extractions");
  });

  it("returns null outside any flow", () => {
    expect(findFlowStep("/about", false)).toBeNull();
    expect(findFlowStep("/", true)).toBeNull();
  });
});
