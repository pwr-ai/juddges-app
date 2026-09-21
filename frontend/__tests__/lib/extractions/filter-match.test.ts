import { matchedMetadataKeys } from "@/lib/extractions/filter-match";

const meta = {
  country: "UK",
  date_issued: "2021-07-15T00:00:00",
  base_offender_gender: ["gender_female"],
  base_appeal_outcome: ["outcome_dismissed_or_refused"],
  base_co_def_acc_num: 3,
  base_did_offender_confess: true,
  base_appeal_court_judges_names: "Lord Justice Edis, Mr Justice Garnham",
  base_date_of_appeal_court_judgment: "2021-07-15",
  base_convict_offences: ["fraud", "theft"],
};

describe("matchedMetadataKeys", () => {
  it("maps core fields to country / date_issued", () => {
    const hits = matchedMetadataKeys(
      { jurisdiction: ["PL", "UK"], decision_date: { from: "2020-01-01", to: "2024-12-31" } },
      meta,
    );
    expect(hits).toEqual(new Set(["country", "date_issued"]));
  });

  it("does not flag a core field that does not match", () => {
    expect(matchedMetadataKeys({ jurisdiction: ["PL"] }, meta).size).toBe(0);
    expect(matchedMetadataKeys({ decision_date: { to: "2019-12-31" } }, meta).size).toBe(0);
  });

  it("array overlap, numeric range/equality, boolean, substring, date", () => {
    const hits = matchedMetadataKeys(
      {
        offender_gender: ["gender_female"],
        convict_offences: ["fraud"],
        co_def_acc_num: { min: 2 },
        num_victims: 1, // absent in metadata → no hit
        did_offender_confess: true,
        appeal_court_judges_names: "edis",
        date_of_appeal_court_judgment: "2021-07-15",
      },
      meta,
    );
    expect(hits).toEqual(
      new Set([
        "base_offender_gender",
        "base_convict_offences",
        "base_co_def_acc_num",
        "base_did_offender_confess",
        "base_appeal_court_judges_names",
        "base_date_of_appeal_court_judgment",
      ]),
    );
  });

  it("returns an empty set for empty filters or metadata", () => {
    expect(matchedMetadataKeys({}, meta).size).toBe(0);
    expect(matchedMetadataKeys({ offender_gender: ["gender_male"] }, {}).size).toBe(0);
  });
});
