import type { CompareField, CoverageStat } from "./types";

const pct = (share: number | null | undefined) => (share == null ? 0 : Math.round(share * 1000) / 10);

/** Grouped-bar input: one category per value, share as percent (0–100, one decimal). */
export function toShareChart(
  field: CompareField,
  labelOf: (field: string, value: string) => string,
): { categories: string[]; plData: number[]; ukData: number[] } {
  return {
    categories: field.values.map((v) => labelOf(field.field, v.value)),
    plData: field.values.map((v) => pct(v.shares.PL)),
    ukData: field.values.map((v) => pct(v.shares.UK)),
  };
}

export function coveragePercent(stat: CoverageStat): number | null {
  return stat.ratio == null ? null : Math.round(stat.ratio * 100);
}

/** One `'PL 76 % (153/200)'`-style piece per jurisdiction in a field's coverage map. */
export function formatCoverage(coverage: Record<string, CoverageStat>): string[] {
  return Object.entries(coverage).map(([jurisdiction, stat]) => {
    const percent = coveragePercent(stat);
    const pctLabel = percent == null ? "—" : `${percent} %`;
    return `${jurisdiction} ${pctLabel} (${stat.covered}/${stat.total})`;
  });
}
