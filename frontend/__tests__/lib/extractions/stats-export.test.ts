import { aggregateToCsv, buildCohortDefinition } from "@/lib/extractions/stats-export";
import type { AggregateResponse } from "@/types/base-schema-filter";

const response: AggregateResponse = {
  total: 120,
  sample_n: 50,
  seed: 42,
  fields: {
    appeal_outcome: { kind: "categorical", multi: true, values: [{ value: "dismissed", count: 30 }, { value: "allowed", count: 15 }], other: 2, null: 3, covered: 47 },
    num_victims: { kind: "numeric", buckets: [{ lo: 0, hi: 1, count: 20 }, { lo: 1, hi: 2, count: 27 }], null: 3, covered: 47, min: 0, max: 2 },
    decision_date: { kind: "year", values: [{ value: "2019", count: 50 }], null: 0, covered: 50 },
  },
};

describe("aggregateToCsv", () => {
  it("emits one row per value/bucket plus other and null rows, with label, share of covered", () => {
    const csv = aggregateToCsv(response, (f) => f.toUpperCase());
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("field,label,kind,value,count,share_of_covered,covered,null");
    expect(lines).toContain('appeal_outcome,APPEAL_OUTCOME,categorical,dismissed,30,0.6383,47,3');
    expect(lines).toContain('appeal_outcome,APPEAL_OUTCOME,categorical,__other__,2,0.0426,47,3');
    expect(lines).toContain('num_victims,NUM_VICTIMS,numeric,0–1,20,0.4255,47,3');
    expect(lines).toContain('decision_date,DECISION_DATE,year,2019,50,1.0000,50,0');
  });

  it("quotes values containing commas or quotes", () => {
    const r: AggregateResponse = { ...response, fields: { court_name: { kind: "categorical", multi: false, values: [{ value: 'Court of Appeal, "Criminal"', count: 1 }], other: 0, null: 0, covered: 1 } } };
    expect(aggregateToCsv(r, (f) => f)).toContain('"Court of Appeal, ""Criminal"""');
  });

  it("iterates fields in the given order, then appends any remaining object fields", () => {
    const r: AggregateResponse = {
      total: 2,
      sample_n: 2,
      seed: null,
      fields: {
        b_field: { kind: "year", values: [{ value: "2020", count: 1 }], null: 0, covered: 1 },
        a_field: { kind: "year", values: [{ value: "2021", count: 1 }], null: 0, covered: 1 },
      },
    };
    const csv = aggregateToCsv(r, (f) => f, ["a_field", "b_field"]);
    const lines = csv.trim().split("\n");
    const aIndex = lines.findIndex((l) => l.startsWith("a_field,"));
    const bIndex = lines.findIndex((l) => l.startsWith("b_field,"));
    expect(aIndex).toBeGreaterThan(0);
    expect(bIndex).toBeGreaterThan(aIndex);
  });

  it("keeps object key order when order is omitted", () => {
    const r: AggregateResponse = {
      total: 2,
      sample_n: 2,
      seed: null,
      fields: {
        b_field: { kind: "year", values: [{ value: "2020", count: 1 }], null: 0, covered: 1 },
        a_field: { kind: "year", values: [{ value: "2021", count: 1 }], null: 0, covered: 1 },
      },
    };
    const csv = aggregateToCsv(r, (f) => f);
    const lines = csv.trim().split("\n");
    const aIndex = lines.findIndex((l) => l.startsWith("a_field,"));
    const bIndex = lines.findIndex((l) => l.startsWith("b_field,"));
    expect(bIndex).toBeGreaterThan(0);
    expect(aIndex).toBeGreaterThan(bIndex);
  });
});

describe("buildCohortDefinition", () => {
  it("captures everything needed to reproduce the sample", () => {
    const def = buildCohortDefinition({
      filters: { appeal_outcome: ["outcome_conviction_quashed"] },
      textQuery: "narkotyki",
      response,
      fields: ["appeal_outcome", "num_victims", "decision_date"],
      corpusTotal: 12907,
      now: new Date("2026-09-21T10:00:00Z"),
    });
    expect(def).toEqual({
      filters: { appeal_outcome: ["outcome_conviction_quashed"] },
      text_query: "narkotyki",
      sample_size: 50,
      seed: 42,
      corpus_total: 12907,
      cohort_total: 120,
      sample_n: 50,
      fields: ["appeal_outcome", "num_victims", "decision_date"],
      schema_version: "base-v1",
      generated_at: "2026-09-21T10:00:00.000Z",
    });
  });

  it("omits sample_size when the whole cohort was used", () => {
    const def = buildCohortDefinition({ filters: {}, response: { ...response, sample_n: 120, seed: null }, fields: [], corpusTotal: 12907 });
    expect(def.sample_size).toBeUndefined();
    expect(def.seed).toBeNull();
  });
});
