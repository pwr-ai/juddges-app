export type Jurisdiction = 'PL' | 'UK';
export type CourtLevel =
  | 'supreme'
  | 'constitutional'
  | 'appellate'
  | 'regional'
  | 'district'
  | 'local'
  | 'administrative';
export type CaseType = 'criminal' | 'civil' | 'administrative' | 'commercial';
export type DecisionType = 'judgment' | 'order' | 'resolution';
export type Outcome = 'granted' | 'dismissed' | 'partial' | 'remanded';

export interface NumericRange {
  min?: number;
  max?: number;
}

/**
 * Backend wire-format for base_* filters (snake_case, matches the
 * `EnvelopeBaseFilters` Pydantic model). The frontend store uses a
 * camelCase shape (`BaseFilters`); useQueryRewrite maps between them.
 */
export interface EnvelopeBaseFilters {
  base_num_victims?: NumericRange;
  base_victim_age_offence?: NumericRange;
  base_case_number?: NumericRange;
  base_co_def_acc_num?: NumericRange;
  base_date_of_appeal_court_judgment_ts?: NumericRange;
}

export interface RewrittenQueryEnvelope {
  rewritten_query: string;
  filters: {
    base: EnvelopeBaseFilters;
    facets: {
      jurisdiction?: Jurisdiction;
      court_level?: CourtLevel;
      case_type?: CaseType;
      decision_type?: DecisionType;
      outcome?: Outcome;
    };
    arrays: {
      keywords: string[];
      legal_topics: string[];
      cited_legislation: string[];
    };
    decision_date?: { from?: string; to?: string };
    languages: string[];
  };
  diagnostics: {
    dropped_terms: string[];
    latency_ms: number;
    model: string;
  };
  degraded: boolean;
}

export interface QueryRewriteRequest {
  query: string;
  languages_hint?: string[];
}
