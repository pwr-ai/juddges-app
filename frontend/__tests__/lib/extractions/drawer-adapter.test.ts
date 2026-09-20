import {
  applyCoreChange,
  applyDrawerChange,
  coreToDrawerValue,
  epochSecondsToIso,
  isoToEpochSeconds,
  toDrawerFilters,
} from "@/lib/extractions/drawer-adapter";

describe("drawer-adapter dates", () => {
  it("maps ISO from/to into epoch-second min/max for DateRangeControl", () => {
    const out = toDrawerFilters({ date_of_appeal_court_judgment: { from: "2025-01-01", to: "2025-12-31" } });
    expect(out.date_of_appeal_court_judgment).toEqual({
      kind: "date_range",
      range: { min: isoToEpochSeconds("2025-01-01"), max: isoToEpochSeconds("2025-12-31") },
    });
  });

  it("writes epoch seconds back as ISO from/to (never raw numbers)", () => {
    const next = applyDrawerChange({}, "date_of_appeal_court_judgment", {
      kind: "date_range",
      range: { min: isoToEpochSeconds("2024-06-01") },
    });
    expect(next.date_of_appeal_court_judgment).toEqual({ from: "2024-06-01", to: undefined });
  });

  it("round-trips epoch <-> iso", () => {
    expect(epochSecondsToIso(isoToEpochSeconds("2015-01-01"))).toBe("2015-01-01");
    expect(isoToEpochSeconds(undefined)).toBeUndefined();
    expect(epochSecondsToIso(undefined)).toBeUndefined();
  });
});

describe("drawer-adapter core fields", () => {
  it("keeps jurisdiction and decision_date OUT of the drawer state", () => {
    const out = toDrawerFilters({
      jurisdiction: ["PL"],
      decision_date: { from: "2015-01-01" },
      offender_gender: ["gender_female"],
    });
    expect(Object.keys(out)).toEqual(["offender_gender"]);
  });

  it("exposes them through coreToDrawerValue/applyCoreChange", () => {
    expect(coreToDrawerValue("jurisdiction", ["PL", "UK"])).toEqual({ kind: "enum_multi", values: ["PL", "UK"] });
    expect(coreToDrawerValue("decision_date", { from: "2015-01-01", to: "2024-12-31" })).toEqual({
      kind: "date_range",
      range: { min: isoToEpochSeconds("2015-01-01"), max: isoToEpochSeconds("2024-12-31") },
    });
    const next = applyCoreChange({ offender_gender: ["gender_female"] }, "jurisdiction", { kind: "enum_multi", values: ["UK"] });
    expect(next).toEqual({ offender_gender: ["gender_female"], jurisdiction: ["UK"] });
    expect(applyCoreChange(next, "jurisdiction", undefined)).toEqual({ offender_gender: ["gender_female"] });
  });

  it("keeps numeric and boolean behaviour identical to the old page adapter", () => {
    expect(toDrawerFilters({ num_victims: 3 }).num_victims).toEqual({ kind: "numeric_range", range: { min: 3, max: 3 } });
    expect(applyDrawerChange({}, "did_offender_confess", { kind: "boolean_tri", value: false })).toEqual({ did_offender_confess: false });
    expect(applyDrawerChange({}, "co_def_acc_num", { kind: "numeric_range", range: { min: 2, max: 2 } })).toEqual({ co_def_acc_num: 2 });
  });
});

describe("drawer-adapter {min,max} date variant (ruling 3)", () => {
  it("treats a DateRange-typed {min,max} value (e.g. from a hand-edited URL) as {from,to}", () => {
    // BaseSchemaFilters.decision_date is typed `string | DateRange`, but the RPC
    // also accepts {min,max}; the FE never builds it, so a value carrying
    // min/max only reaches here via a hand-edited URL blob.
    const out = toDrawerFilters({
      date_of_appeal_court_judgment: { min: "2015-01-01", max: "2024-12-31" } as unknown as { from?: string; to?: string },
    });
    expect(out.date_of_appeal_court_judgment).toEqual({
      kind: "date_range",
      range: { min: isoToEpochSeconds("2015-01-01"), max: isoToEpochSeconds("2024-12-31") },
    });

    expect(
      coreToDrawerValue("decision_date", { min: "2015-01-01", max: "2024-12-31" } as unknown as { from?: string; to?: string }),
    ).toEqual({
      kind: "date_range",
      range: { min: isoToEpochSeconds("2015-01-01"), max: isoToEpochSeconds("2024-12-31") },
    });
  });
});
