import {
  COHORT_GROUP_FIELDS,
  groupCohort,
  projectRankedPrecedents,
  topBucket,
} from "@/lib/precedents/cohort-grouping";
import type { PrecedentCohortItem, PrecedentMatch } from "@/lib/api/advanced";

function item(id: string, patch: Partial<PrecedentCohortItem> = {}): PrecedentCohortItem {
  return {
    document_id: id,
    similarity_score: 0.5,
    case_number: null,
    title: null,
    jurisdiction: null,
    court_name: null,
    decision_date: null,
    appeal_outcome: [],
    sentences_received: [],
    convict_offences: [],
    ...patch,
  };
}

function precedent(id: string): PrecedentMatch {
  return {
    document_id: id,
    title: id,
    document_type: null,
    date_issued: null,
    court_name: null,
    outcome: null,
    legal_bases: null,
    summary: null,
    similarity_score: 0.5,
    relevance_score: null,
    matching_factors: [],
    relevance_explanation: null,
  };
}

describe("groupCohort", () => {
  it("counts one judgment once per distinct value and marks the field multi-valued", () => {
    const cohort = [
      item("a", { convict_offences: ["theft", "theft", "burglary"] }),
      item("b", { convict_offences: ["theft"] }),
    ];

    const agg = groupCohort(cohort, "convict_offences");

    expect(agg.kind).toBe("categorical");
    if (agg.kind !== "categorical") throw new Error("expected categorical");
    expect(agg.multi).toBe(true);
    expect(agg.values).toEqual([
      { value: "theft", count: 2 },
      { value: "burglary", count: 1 },
    ]);
    expect(agg.covered).toBe(2);
    expect(agg.null).toBe(0);
  });

  it("counts an empty array and a missing value as null, not as a category", () => {
    const cohort = [
      item("a", { appeal_outcome: ["outcome_appeal_dismissed"] }),
      item("b", { appeal_outcome: [] }),
      item("c", { appeal_outcome: ["", "   "] }),
    ];

    const agg = groupCohort(cohort, "appeal_outcome");
    if (agg.kind !== "categorical") throw new Error("expected categorical");

    expect(agg.values).toEqual([{ value: "outcome_appeal_dismissed", count: 1 }]);
    expect(agg.null).toBe(2);
    expect(agg.covered).toBe(1);
  });

  it("sorts by count descending with the value as a stable tie-break", () => {
    const cohort = [
      item("a", { sentences_received: ["b_two_years"] }),
      item("b", { sentences_received: ["a_one_year"] }),
      item("c", { sentences_received: ["c_life", "c_life"] }),
      item("d", { sentences_received: ["c_life"] }),
    ];

    const agg = groupCohort(cohort, "sentences_received");
    if (agg.kind !== "categorical") throw new Error("expected categorical");

    expect(agg.values.map((v) => v.value)).toEqual(["c_life", "a_one_year", "b_two_years"]);
  });

  it("keeps the top N values and folds the rest into other", () => {
    const cohort = [
      item("a", { convict_offences: ["x1", "x2", "x3"] }),
      item("b", { convict_offences: ["x1", "x2"] }),
      item("c", { convict_offences: ["x1"] }),
    ];

    const agg = groupCohort(cohort, "convict_offences", 2);
    if (agg.kind !== "categorical") throw new Error("expected categorical");

    expect(agg.values).toEqual([
      { value: "x1", count: 3 },
      { value: "x2", count: 2 },
    ]);
    expect(agg.other).toBe(1);
    expect(agg.covered).toBe(3);
  });

  it("returns a zeroed aggregate for an empty cohort", () => {
    const agg = groupCohort([], "appeal_outcome");
    if (agg.kind !== "categorical") throw new Error("expected categorical");

    expect(agg.values).toEqual([]);
    expect(agg.covered).toBe(0);
    expect(agg.null).toBe(0);
    expect(agg.other).toBe(0);
  });
});

describe("projectRankedPrecedents", () => {
  it("keeps ranking order and original ordinals when cohort order differs", () => {
    const cohort = [
      item("third", { appeal_outcome: ["allowed"] }),
      item("first", { appeal_outcome: ["allowed"] }),
      item("second", { appeal_outcome: ["dismissed"] }),
    ];
    const ranked = [precedent("first"), precedent("second"), precedent("third")];

    expect(typeof projectRankedPrecedents).toBe("function");
    expect(
      projectRankedPrecedents(ranked, cohort, {
        field: "appeal_outcome",
        value: "allowed",
      }),
    ).toEqual([
      { precedent: ranked[0], rank: 1 },
      { precedent: ranked[2], rank: 3 },
    ]);
  });

  it("preserves duplicate ranked ids and excludes ids missing from the cohort", () => {
    const duplicate = precedent("duplicate");
    const missing = precedent("missing");
    const ranked = [duplicate, missing, duplicate];
    const cohort = [item("duplicate", { convict_offences: ["theft"] })];

    expect(
      projectRankedPrecedents(ranked, cohort, {
        field: "convict_offences",
        value: "theft",
      }),
    ).toEqual([
      { precedent: duplicate, rank: 1 },
      { precedent: duplicate, rank: 3 },
    ]);
  });

  it("projects every ranked precedent when no cohort selection is active", () => {
    const ranked = [precedent("a"), precedent("a")];

    expect(projectRankedPrecedents(ranked, [], null)).toEqual([
      { precedent: ranked[0], rank: 1 },
      { precedent: ranked[1], rank: 2 },
    ]);
  });
});

describe("topBucket", () => {
  it("returns the largest value bucket, or null when there is none", () => {
    const agg = groupCohort(
      [item("a", { appeal_outcome: ["dismissed"] }), item("b", { appeal_outcome: ["dismissed"] })],
      "appeal_outcome",
    );

    expect(topBucket(agg)).toEqual({ value: "dismissed", count: 2 });
    expect(topBucket(groupCohort([], "appeal_outcome"))).toBeNull();
  });
});

describe("COHORT_GROUP_FIELDS", () => {
  it("is the spec's three fields, appeal outcome first", () => {
    expect(COHORT_GROUP_FIELDS).toEqual([
      "appeal_outcome",
      "sentences_received",
      "convict_offences",
    ]);
  });
});
