/**
 * Unit tests for `formatEnumOptionLabel` — the enum-checkbox label formatter
 * that strips a field's shared leading-token prefix (e.g. "gender_") so
 * option text doesn't duplicate the fieldset legend ("Gender").
 *
 * @jest-environment node
 */

import {
  formatEnumOptionLabel,
  formatEnumLabel,
  FILTER_FIELD_BY_NAME,
} from "@/lib/extractions/base-schema-filter-config";
import type { FilterFieldConfig } from "@/lib/extractions/base-schema-filter-config";

/** Register a throwaway field config for the duration of one test. */
function withField(field: string, config: FilterFieldConfig, fn: () => void): void {
  FILTER_FIELD_BY_NAME[field] = config;
  try {
    fn();
  } finally {
    delete FILTER_FIELD_BY_NAME[field];
  }
}

describe("formatEnumOptionLabel", () => {
  it("strips the leading token shared by all enum values when it also appears in the field name (real field: offender_gender)", () => {
    expect(formatEnumOptionLabel("offender_gender", "gender_female")).toBe("Female");
    expect(formatEnumOptionLabel("offender_gender", "gender_male")).toBe("Male");
  });

  it("strips the leading token shared by all enum values for appeal_outcome (real field)", () => {
    expect(formatEnumOptionLabel("appeal_outcome", "outcome_dismissed_or_refused")).toBe(
      "Dismissed or refused",
    );
  });

  it("does NOT strip a common prefix that is absent from the field name and label", () => {
    withField(
      "__test_hypothetical_widget__",
      {
        field: "__test_hypothetical_widget__",
        label: "Hypothetical widget",
        group: "other",
        control: "enum_multi",
        enumValues: ["not_alpha", "not_beta"],
      },
      () => {
        expect(formatEnumOptionLabel("__test_hypothetical_widget__", "not_alpha")).toBe(
          formatEnumLabel("not_alpha"),
        );
      },
    );
  });

  it("leaves the label unchanged when the enum values share no common leading token", () => {
    expect(formatEnumOptionLabel("offender_job_offence", "self_employed")).toBe(
      formatEnumLabel("self_employed"),
    );
  });

  it("returns the unstripped label for a single-value enum", () => {
    withField(
      "__test_single_value__",
      {
        field: "__test_single_value__",
        label: "Single value field",
        group: "other",
        control: "enum_multi",
        enumValues: ["single_only"],
      },
      () => {
        expect(formatEnumOptionLabel("__test_single_value__", "single_only")).toBe(
          formatEnumLabel("single_only"),
        );
      },
    );
  });

  it("falls back to the unstripped label when stripping would leave an empty string", () => {
    withField(
      "__test_empty_remainder__",
      {
        field: "__test_empty_remainder__",
        label: "Outcome",
        group: "other",
        control: "enum_multi",
        enumValues: ["outcome_", "outcome_other"],
      },
      () => {
        expect(formatEnumOptionLabel("__test_empty_remainder__", "outcome_")).toBe(
          formatEnumLabel("outcome_"),
        );
      },
    );
  });

  it("falls back to the unstripped label for a field with no enumValues configured", () => {
    expect(formatEnumOptionLabel("extraction_model", "gpt-4o")).toBe(
      formatEnumLabel("gpt-4o"),
    );
  });
});
