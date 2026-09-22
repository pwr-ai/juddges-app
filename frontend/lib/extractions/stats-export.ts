/**
 * Export helpers for the Statistics view (#708): a flat CSV of the aggregate
 * and a cohort.json that reproduces the sample (spec §5.2 item 6 — the
 * "replicability of case selection" artefact).
 */
import type { AggregateResponse, BaseSchemaFilters } from "@/types/base-schema-filter";

export interface CohortDefinition {
  filters: BaseSchemaFilters;
  text_query?: string;
  sample_size?: number;
  seed: number | null;
  /** `null` when the dashboard stats were unavailable at export time. */
  corpus_total: number | null;
  cohort_total: number;
  sample_n: number;
  fields: string[];
  schema_version: "base-v1";
  generated_at: string;
}

export function buildCohortDefinition(args: {
  filters: BaseSchemaFilters;
  textQuery?: string;
  response: AggregateResponse;
  fields: string[];
  corpusTotal: number | null;
  now?: Date;
}): CohortDefinition {
  const { filters, textQuery, response, fields, corpusTotal } = args;
  const sampled = response.sample_n < response.total;
  const def: CohortDefinition = {
    filters,
    seed: response.seed,
    corpus_total: corpusTotal,
    cohort_total: response.total,
    sample_n: response.sample_n,
    fields,
    schema_version: "base-v1",
    generated_at: (args.now ?? new Date()).toISOString(),
  };
  if (textQuery && textQuery.trim() !== "") def.text_query = textQuery.trim();
  if (sampled) def.sample_size = response.sample_n;
  // key order matters for readers diffing two exports; rebuild in a fixed order
  return {
    filters: def.filters,
    ...(def.text_query !== undefined ? { text_query: def.text_query } : {}),
    ...(def.sample_size !== undefined ? { sample_size: def.sample_size } : {}),
    seed: def.seed,
    corpus_total: def.corpus_total,
    cohort_total: def.cohort_total,
    sample_n: def.sample_n,
    fields: def.fields,
    schema_version: def.schema_version,
    generated_at: def.generated_at,
  };
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function share(count: number, covered: number): string {
  return covered === 0 ? "0.0000" : (count / covered).toFixed(4);
}

/**
 * `order`, when given, iterates the requested field order (skipping names
 * absent from `response.fields`), then appends any remaining fields of
 * `response.fields` not in `order`, in their object order. The backend
 * returns `fields` as a JSONB object — `Object.entries` comes back in jsonb
 * key order, not the order the user requested, so without this the CSV rows
 * would not match the on-screen card order.
 */
export function aggregateToCsv(
  response: AggregateResponse,
  label: (field: string) => string,
  order?: readonly string[],
): string {
  const rows: string[] = ["field,label,kind,value,count,share_of_covered,covered,null"];
  const entries = Object.entries(response.fields);
  const orderedEntries = order
    ? [
        ...order.flatMap((field) => (field in response.fields ? [[field, response.fields[field]] as const] : [])),
        ...entries.filter(([field]) => !order.includes(field)),
      ]
    : entries;
  for (const [field, agg] of orderedEntries) {
    const push = (value: string, count: number) =>
      rows.push([field, label(field), agg.kind, value, count, share(count, agg.covered), agg.covered, agg.null].map(csvCell).join(","));
    if (agg.kind === "numeric") {
      for (const b of agg.buckets) push(`${b.lo}–${b.hi}`, b.count);
    } else {
      for (const v of agg.values) push(v.value, v.count);
      if (agg.kind === "categorical" && agg.other > 0) push("__other__", agg.other);
    }
    if (agg.null > 0) push("__null__", agg.null);
  }
  return rows.join("\n") + "\n";
}
