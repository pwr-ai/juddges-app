import type { PrecedentCohortItem } from "@/lib/api/advanced";

function item(id: string, patch: Partial<PrecedentCohortItem> = {}): PrecedentCohortItem {
  return {
    document_id: id,
    similarity_score: 0.7,
    case_number: `case-${id}`,
    title: `Judgment ${id}`,
    jurisdiction: "UK",
    court_name: "Court of Appeal",
    decision_date: "2023-01-01",
    appeal_outcome: [],
    sentences_received: [],
    convict_offences: [],
    ...patch,
  };
}

/** Five judgments: 3 dismissed, 1 allowed, 1 with no outcome; 2 carry "theft". */
export function makeCohort(): PrecedentCohortItem[] {
  return [
    item("d1", { appeal_outcome: ["dismissed"], convict_offences: ["theft"] }),
    item("d2", { appeal_outcome: ["dismissed"], convict_offences: ["theft"] }),
    item("d3", { appeal_outcome: ["dismissed"] }),
    item("a1", { appeal_outcome: ["allowed"], convict_offences: ["burglary"] }),
    item("n1", {}),
  ];
}
