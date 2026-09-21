import canonical from "@/lib/extractions/aggregable-fields.json";
import {
  AGGREGABLE_FIELDS,
  DEFAULT_AGGREGATE_FIELDS,
  SCALE_STOPS,
  aggregateFieldLabel,
  isAggregableField,
} from "@/lib/extractions/aggregate-fields";
import { FILTER_FIELDS } from "@/lib/extractions/base-schema-filter-config";

describe("aggregate-fields", () => {
  it("mirrors the canonical JSON", () => {
    expect([...AGGREGABLE_FIELDS]).toEqual(canonical.fields);
    expect([...DEFAULT_AGGREGATE_FIELDS]).toEqual(canonical.default);
  });

  it("never lists a free-text (substring) filter field", () => {
    const substring = FILTER_FIELDS.filter((f) => f.control === "substring").map((f) => f.field);
    for (const f of substring) expect(isAggregableField(f)).toBe(false);
  });

  it("labels filter fields from the filter config and core fields from its own map", () => {
    expect(aggregateFieldLabel("appeal_outcome")).toBe(FILTER_FIELDS.find((f) => f.field === "appeal_outcome")!.label);
    expect(aggregateFieldLabel("court_name")).toBe("Court");
    expect(aggregateFieldLabel("deep_complexity_score")).toMatch(/model score/i);
    expect(aggregateFieldLabel("no_such_field")).toBe("no_such_field");
  });

  it("has ascending scale stops below the corpus size", () => {
    expect(SCALE_STOPS).toEqual([10, 50, 100, 1000, 5000]);
  });
});
