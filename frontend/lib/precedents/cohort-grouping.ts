import type { PrecedentCohortItem } from "@/lib/api/advanced";
import type { FieldAggregate } from "@/types/base-schema-filter";

/** Fields the "In similar cases…" block can group by (spec §7.2). */
export const COHORT_GROUP_FIELDS = [
  "appeal_outcome",
  "sentences_received",
  "convict_offences",
] as const;

export type CohortGroupField = (typeof COHORT_GROUP_FIELDS)[number];

/** How many distinct values a card shows before the rest folds into "other". */
const DEFAULT_TOP_N = 10;

function valuesOf(item: PrecedentCohortItem, field: CohortGroupField): string[] {
  const raw = item[field] ?? [];
  const cleaned = raw.map((v) => v.trim()).filter((v) => v.length > 0);
  return Array.from(new Set(cleaned));
}

/**
 * Group the cohort by one multi-valued base field into the same shape the
 * statistics view renders (#708), so `FieldCard` can draw it unchanged.
 *
 * A judgment counts once per distinct value it carries; one with no values at
 * all counts as `null`, never as a category.
 */
export function groupCohort(
  cohort: PrecedentCohortItem[],
  field: CohortGroupField,
  topN: number = DEFAULT_TOP_N,
): FieldAggregate {
  const counts = new Map<string, number>();
  let covered = 0;
  let missing = 0;

  for (const item of cohort) {
    const values = valuesOf(item, field);
    if (values.length === 0) {
      missing += 1;
      continue;
    }
    covered += 1;
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const sorted = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  const kept = sorted.slice(0, topN);
  const other = sorted.slice(topN).reduce((sum, v) => sum + v.count, 0);

  return { kind: "categorical", multi: true, values: kept, other, null: missing, covered };
}

/** Document ids of every cohort member carrying `value` in `field`. */
export function cohortIdsWithValue(
  cohort: PrecedentCohortItem[],
  field: CohortGroupField,
  value: string,
): Set<string> {
  const ids = new Set<string>();
  for (const item of cohort) {
    if (valuesOf(item, field).includes(value)) ids.add(item.document_id);
  }
  return ids;
}

/** The largest value bucket — the one the headline sentence talks about. */
export function topBucket(aggregate: FieldAggregate): { value: string; count: number } | null {
  if (aggregate.kind === "numeric") return null;
  return aggregate.values[0] ?? null;
}
