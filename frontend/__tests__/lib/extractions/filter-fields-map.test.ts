import { BASE_FILTER_FIELDS } from "@/lib/extractions/filter-fields-map";

describe("BASE_FILTER_FIELDS", () => {
  it("maps registry-field → base_* Meili column", () => {
    expect(BASE_FILTER_FIELDS.appellant).toBe("base_appellant");
    expect(BASE_FILTER_FIELDS.num_victims).toBe("base_num_victims");
    expect(BASE_FILTER_FIELDS.vic_impact_statement).toBe("base_vic_impact_statement");
  });
  it("maps date_range fields to the epoch-sec _ts twin", () => {
    expect(BASE_FILTER_FIELDS.date_of_appeal_court_judgment)
      .toBe("base_date_of_appeal_court_judgment_ts");
    expect(BASE_FILTER_FIELDS.extracted_at).toBe("base_extracted_at_ts");
  });
});
