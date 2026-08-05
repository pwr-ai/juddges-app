import type { DashboardStats } from "@/lib/api/dashboard";

export interface JurisdictionDistributionItem {
  name: string;
  count: number;
}

export interface JurisdictionYearlyItem {
  year: number;
  count: number;
}

export interface UKDashboardStats {
  totalJudgments: number;
  topCourts: JurisdictionDistributionItem[];
  yearlyTrend: JurisdictionYearlyItem[];
  computedAt: string | null;
}

/**
 * Selects only rows explicitly attributed to the UK corpus.
 *
 * Legacy unscoped rows are deliberately excluded: showing them here could mix
 * Polish and UK statistics on a jurisdiction-specific public surface.
 */
export function selectUKDashboardStats(stats: DashboardStats): UKDashboardStats {
  return {
    totalJudgments: stats.jurisdictions.UK,
    topCourts: stats.top_courts
      .filter((item) => item.jurisdiction === "UK")
      .map(({ name, count }) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    yearlyTrend: stats.decisions_per_year_by_jurisdiction
      .filter((item) => item.jurisdiction === "UK")
      .map(({ year, count }) => ({ year, count }))
      .sort((a, b) => a.year - b.year),
    computedAt: stats.computed_at,
  };
}
