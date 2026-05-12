/**
 * Sanity tests for the base-schema filter registry.
 *
 * Guards against drift between:
 *   - types/base-schema-filter.ts (BaseSchemaFilters interface)
 *   - lib/extractions/base-schema-filter-config.ts (FILTER_FIELDS registry)
 *
 * @jest-environment node
 */

import {
  FILTER_FIELDS,
  FILTER_FIELD_BY_NAME,
  FIELDS_BY_GROUP,
  GROUP_LABELS,
  GROUP_ORDER,
  formatEnumLabel,
} from "@/lib/extractions/base-schema-filter-config";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

// Sentinel object pinning every BaseSchemaFilters key. Matches the Pydantic
// model in backend/app/extraction_domain/nl_filter_generator.py.
const REQUIRED_KEYS: Record<keyof BaseSchemaFilters, true> = {
  appellant: true,
  plea_point: true,
  remand_decision: true,
  victim_type: true,
  pre_sent_report: true,
  offender_job_offence: true,
  offender_home_offence: true,
  offender_victim_relationship: true,
  appeal_against: true,
  appeal_outcome: true,
  sentence_serve: true,
  offender_gender: true,
  offender_intox_offence: true,
  victim_gender: true,
  victim_intox_offence: true,
  keywords: true,
  convict_offences: true,
  acquit_offences: true,
  appeal_ground: true,
  sentences_received: true,
  what_ancilliary_orders: true,
  pros_evid_type_trial: true,
  def_evid_type_trial: true,
  agg_fact_sent: true,
  mit_fact_sent: true,
  sent_guide_which: true,
  reason_quash_conv: true,
  reason_sent_excessive: true,
  reason_sent_lenient: true,
  reason_dismiss: true,
  convict_plea_dates: true,
  did_offender_confess: true,
  vic_impact_statement: true,
  num_victims: true,
  case_number: true,
  victim_age_offence: true,
  co_def_acc_num: true,
  date_of_appeal_court_judgment: true,
  case_name: true,
  neutral_citation_number: true,
  appeal_court_judges_names: true,
  offender_representative_name: true,
};

// Fields registered in the UI registry but not (yet) mirrored in the
// `BaseSchemaFilters` RPC payload type. These will be wired through to the
// backend in follow-up tasks of the base_* schema rollout — until then the
// registry is allowed to be a strict superset of `BaseSchemaFilters`.
const REGISTRY_ONLY_FIELDS = new Set<string>([
  "conv_court_names",
  "sent_court_name",
  "victim_job_offence",
  "victim_home_offence",
  "extraction_model",
  "extracted_at",
  "extraction_status",
]);

// `enum_multi` fields whose canonical enum values are discovered at runtime
// from Meili facet counts rather than baked into the registry. Mirrors the
// note in base-schema-filter-config.ts.
const RUNTIME_DISCOVERED_ENUM_FIELDS = new Set<string>([
  "extraction_model",
  "extraction_status",
]);

describe("base-schema filter registry", () => {
  it("covers every BaseSchemaFilters key (registry may be a superset)", () => {
    const fields = new Set(FILTER_FIELDS.map((c) => c.field));
    const required = new Set(Object.keys(REQUIRED_KEYS));

    const missing = [...required].filter((k) => !fields.has(k));
    const extra = [...fields].filter(
      (k) => !required.has(k) && !REGISTRY_ONLY_FIELDS.has(k),
    );

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("has a unique field name per entry", () => {
    const seen = new Set<string>();
    for (const c of FILTER_FIELDS) {
      expect(seen.has(c.field)).toBe(false);
      seen.add(c.field);
    }
  });

  it("indexes every entry by field in FILTER_FIELD_BY_NAME", () => {
    for (const c of FILTER_FIELDS) {
      expect(FILTER_FIELD_BY_NAME[c.field]).toBe(c);
    }
  });

  it("groups every entry into a known group, total covers FILTER_FIELDS", () => {
    let total = 0;
    for (const g of GROUP_ORDER) {
      const fields = FIELDS_BY_GROUP[g];
      expect(Array.isArray(fields)).toBe(true);
      total += fields.length;
    }
    expect(total).toBe(FILTER_FIELDS.length);
  });

  it("requires enumValues on enum_multi controls (except runtime-discovered enums)", () => {
    for (const c of FILTER_FIELDS) {
      if (c.control !== "enum_multi") continue;
      if (RUNTIME_DISCOVERED_ENUM_FIELDS.has(c.field)) {
        // Runtime-discovered enums intentionally omit enumValues; the drawer
        // pulls option lists from Meili facets at render time.
        expect(c.enumValues).toBeUndefined();
        continue;
      }
      expect(Array.isArray(c.enumValues)).toBe(true);
      expect(c.enumValues!.length).toBeGreaterThan(0);
    }
  });

  it("formatEnumLabel humanises snake_case", () => {
    expect(formatEnumLabel("gender_male")).toBe("Gender male");
    expect(formatEnumLabel("appeal_conviction_unsafe")).toBe(
      "Appeal conviction unsafe",
    );
    expect(formatEnumLabel("low")).toBe("Low");
  });
});

describe("base-schema-filter-config — operational group + new fields", () => {
  it("declares the operational group last in GROUP_ORDER", () => {
    expect(GROUP_ORDER[GROUP_ORDER.length - 1]).toBe("operational");
    expect(GROUP_LABELS.operational).toMatch(/Operational/i);
  });
  it.each([
    ["conv_court_names",     "court_date",  "tag_array"],
    ["sent_court_name",      "court_date",  "tag_array"],
    ["victim_job_offence",   "victim",      "tag_array"],
    ["victim_home_offence",  "victim",      "tag_array"],
    ["extraction_model",     "operational", "enum_multi"],
    ["extracted_at",         "operational", "date_range"],
    ["extraction_status",    "operational", "enum_multi"],
  ])("registers %s under %s as %s", (field, group, control) => {
    const cfg = FILTER_FIELD_BY_NAME[field];
    expect(cfg).toBeDefined();
    expect(cfg!.group).toBe(group);
    expect(cfg!.control).toBe(control);
  });
});
