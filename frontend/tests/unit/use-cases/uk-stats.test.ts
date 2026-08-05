import type { DashboardStats } from "@/lib/api/dashboard";
import { selectUKDashboardStats } from "@/app/use-cases/uk-judgments/uk-stats";

const completeData: DashboardStats["data_completeness"] = {
  embeddings_pct: 0,
  structure_extraction_pct: 0,
  deep_analysis_pct: 0,
  with_summary_pct: 0,
  with_keywords_pct: 0,
  with_legal_topics_pct: 0,
  with_cited_legislation_pct: 0,
  avg_text_length_chars: 0,
};

function dashboardStats(): DashboardStats {
  return {
    total_judgments: 80,
    jurisdictions: { PL: 60, UK: 20 },
    court_levels: [],
    top_courts: [
      { name: "Supreme Court", count: 8, jurisdiction: "UK" },
      { name: "Court of Appeal", count: 12, jurisdiction: "UK" },
      { name: "Sąd Najwyższy", count: 60, jurisdiction: "PL" },
      { name: "Legacy aggregate", count: 80 },
    ],
    decisions_per_year: [{ year: 2024, count: 80 }],
    decisions_per_year_by_jurisdiction: [
      { year: 2024, count: 13, jurisdiction: "UK" },
      { year: 2022, count: 7, jurisdiction: "UK" },
      { year: 2024, count: 60, jurisdiction: "PL" },
    ],
    date_range: null,
    case_types: [],
    decision_types: [],
    data_completeness: completeData,
    top_legal_domains: null,
    top_keywords: [],
    computed_at: "2026-08-05T10:00:00Z",
  };
}

describe("selectUKDashboardStats", () => {
  it("uses the jurisdiction total and excludes PL and legacy unscoped rows", () => {
    const result = selectUKDashboardStats(dashboardStats());

    expect(result).toEqual({
      totalJudgments: 20,
      topCourts: [
        { name: "Court of Appeal", count: 12 },
        { name: "Supreme Court", count: 8 },
      ],
      yearlyTrend: [
        { year: 2022, count: 7 },
        { year: 2024, count: 13 },
      ],
      computedAt: "2026-08-05T10:00:00Z",
    });
  });

  it("does not mutate the dashboard response while sorting chart rows", () => {
    const stats = dashboardStats();
    const original = JSON.parse(JSON.stringify(stats)) as DashboardStats;

    selectUKDashboardStats(stats);

    expect(stats).toEqual(original);
  });
});
