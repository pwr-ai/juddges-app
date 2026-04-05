/**
 * Types for the Judge Reasoning Fingerprint feature.
 * Maps to backend API responses from /judge-fingerprint/ endpoints.
 */

/** The 5 reasoning style dimensions scored 0-100 */
export interface StyleScores {
  textual: number;
  deductive: number;
  analogical: number;
  policy: number;
  teleological: number;
}

/** A sample case returned as part of a judge's profile */
export interface SampleCase {
  document_id: string;
  title: string;
  date: string;
  reasoning_pattern: keyof StyleScores;
}

/** The time period over which cases were analyzed */
export interface JudgePeriod {
  first_case: string;
  last_case: string;
}

/** Full profile for a single judge */
export interface JudgeProfile {
  judge_name: string;
  total_cases: number;
  style_scores: StyleScores;
  dominant_style: keyof StyleScores;
  cases_analyzed: number;
  period: JudgePeriod;
  sample_cases: SampleCase[];
}

/** Search result entry for judge name autocomplete */
export interface JudgeSearchResult {
  name: string;
  case_count: number;
}

/** Response from GET /judge-fingerprint/search */
export interface JudgeSearchResponse {
  judges: JudgeSearchResult[];
}

/** Response from GET /judge-fingerprint/compare */
export interface JudgeCompareResponse {
  profiles: JudgeProfile[];
}
