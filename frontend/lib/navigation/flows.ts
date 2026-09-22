/**
 * Persona flows — the single source of truth for the signed-in sidebar
 * groups and the FlowStepper (spec: docs/superpowers/specs/
 * 2026-09-20-persona-flows-design.md §4, issue #690).
 *
 * Four flows, each an ordered list of steps that map 1:1 onto existing
 * routes. Adding a route to the sidebar means adding a step here — nothing
 * else. `docs/reference/sidebar-map.md` mirrors this file and a Jest test
 * keeps the two in sync.
 */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  FileJson,
  Fingerprint,
  FolderOpen,
  GitBranch,
  History,
  ListChecks,
  MessageSquare,
  Play,
  Scale,
  Search,
  TrendingUp,
  Waypoints,
} from "lucide-react";

import type { TranslationKey } from "@/lib/i18n/types";

export type FlowId = "ask" | "explore" | "code" | "case";

export interface FlowStep {
  href: string;
  /** Always a `navigation.*` key — the sidebar and stepper both call t(). */
  labelKey: TranslationKey;
  icon: LucideIcon;
  /**
   * `exact`: pathname === href. `prefix`: href itself or any child route.
   * An `exact` href may carry a `?query`; it then matches only when the
   * current search string contains that query (see `isStepActive`).
   */
  match: "exact" | "prefix";
  /** Rendered only when `user.app_metadata.is_admin === true` (#607). */
  adminOnly?: boolean;
}

export interface Flow {
  id: FlowId;
  labelKey: TranslationKey;
  steps: readonly FlowStep[];
}

export const FLOWS: readonly Flow[] = [
  {
    id: "ask",
    labelKey: "navigation.flowAsk",
    steps: [
      { href: "/search", labelKey: "navigation.searchJudgments", icon: Search, match: "exact" },
      { href: "/chat", labelKey: "navigation.chat", icon: MessageSquare, match: "prefix" },
      { href: "/history", labelKey: "navigation.searchHistory", icon: History, match: "exact" },
    ],
  },
  {
    id: "explore",
    labelKey: "navigation.flowExplore",
    steps: [
      { href: "/search/extractions", labelKey: "navigation.searchExtractedData", icon: FileJson, match: "exact" },
      { href: "/search/extractions?view=stats", labelKey: "navigation.statistics", icon: BarChart3, match: "exact" },
      { href: "/collections", labelKey: "navigation.researchCollections", icon: FolderOpen, match: "prefix" },
      { href: "/topics", labelKey: "navigation.topicTrends", icon: TrendingUp, match: "exact" },
    ],
  },
  {
    id: "code",
    labelKey: "navigation.flowCode",
    steps: [
      { href: "/schemas", labelKey: "navigation.schemas", icon: FileJson, match: "prefix" },
      { href: "/extract", labelKey: "navigation.runExtraction", icon: Play, match: "exact" },
      { href: "/extractions", labelKey: "navigation.extractionJobs", icon: ListChecks, match: "prefix" },
    ],
  },
  {
    id: "case",
    labelKey: "navigation.flowCase",
    steps: [
      { href: "/precedents", labelKey: "navigation.precedentSearch", icon: Scale, match: "exact" },
      { href: "/reasoning-lines", labelKey: "navigation.reasoningLines", icon: Waypoints, match: "prefix" },
      { href: "/judge-fingerprint", labelKey: "navigation.judgeFingerprint", icon: Fingerprint, match: "exact", adminOnly: true },
      { href: "/argumentation-analysis", labelKey: "navigation.argumentationAnalysis", icon: GitBranch, match: "exact", adminOnly: true },
    ],
  },
];

/**
 * `search` is the current query string (`?view=stats`), passed in explicitly:
 * reading `window.location` here would render differently on the server and
 * trip hydration. Callers without it (the sidebar) get plain path matching.
 */
export function isStepActive(step: FlowStep, pathname: string, search = ""): boolean {
  const [path, query] = step.href.split("?");
  if (step.match === "prefix") return pathname === path || pathname.startsWith(`${path}/`);
  if (pathname !== path) return false;
  if (query) return search.includes(query); // "/search/extractions?view=stats"
  return !search.includes("view=stats"); // the plain list step yields to the stats step
}

export function visibleSteps(flow: Flow, isAdmin: boolean): FlowStep[] {
  return flow.steps.filter((s) => !s.adminOnly || isAdmin);
}

export function findFlowStep(
  pathname: string,
  isAdmin: boolean,
  search = "",
): { flow: Flow; step: FlowStep; index: number; total: number } | null {
  for (const flow of FLOWS) {
    const steps = visibleSteps(flow, isAdmin);
    const i = steps.findIndex((s) => isStepActive(s, pathname, search));
    if (i !== -1) {
      return { flow, step: steps[i], index: i + 1, total: steps.length };
    }
  }
  return null;
}
