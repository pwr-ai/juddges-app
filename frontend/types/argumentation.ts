export interface Argument {
  title: string;
  party: string;
  factual_premises: string[];
  legal_premises: string[];
  conclusion: string;
  reasoning_pattern:
    | "deductive"
    | "analogical"
    | "policy"
    | "textual"
    | "teleological";
  strength: "strong" | "moderate" | "weak";
  strength_explanation: string;
  counter_arguments: string[];
  legal_references: string[];
  source_section: string | null;
}

export interface OverallAnalysis {
  dominant_reasoning_pattern: string;
  argument_flow: string;
  key_disputes: string[];
  strongest_argument_index: number;
}

export interface ArgumentationResponse {
  arguments: Argument[];
  overall_analysis: OverallAnalysis;
  document_ids: string[];
  argument_count: number;
}

export interface ArgumentationRequest {
  document_ids: string[];
  focus_areas?: string[];
  detail_level?: "basic" | "detailed";
}
