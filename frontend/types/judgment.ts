/**
 * TypeScript models for Judgment data structures.
 *
 * These types match the database schema in supabase/schema_updated.sql
 * and the Python Pydantic models in backend/app/models/judgment_models.py
 */

// =============================================================================
// CODING SCHEME TYPES
// =============================================================================

// Section 2: Court Hearings Information
export interface CourtHearingData {
  /** Neutral citation number including year, e.g., '[2023] EWCA Crim 123' */
  neutral_citation_number?: string;

  /** Case number at hearing */
  case_number_hearing?: string;

  /** Date of appeal court judgment (ISO format) */
  appeal_date?: string;

  /** Names of appeal court judges */
  appeal_judges?: string[];

  /** Case name, e.g., 'Regina v. Casim Scott' */
  case_name?: string;

  /** Name of offender's legal representative */
  offender_representative?: string;

  /** Name of Crown/Attorney General representative */
  crown_representative?: string;
}

// Section 3: Offence/Trial/Sentence Information
export type PleaPoint =
  | 'police_presence'
  | 'first_court_appearance'
  | 'before_trial'
  | 'first_day_trial'
  | 'after_first_day_trial'
  | 'dont_know';

export interface PleaInformation {
  /** Did offender confess/plead guilty? */
  confessed?: boolean;

  /** At what point during proceedings? */
  plea_point?: PleaPoint;
}

export type Gender = 'male' | 'female' | 'all_male' | 'all_female' | 'male_and_female';

export type EmploymentStatus =
  | 'employed'
  | 'self_employed'
  | 'unemployed'
  | 'student'
  | 'retired'
  | 'other'
  | 'dont_know';

export type AccommodationStatus =
  | 'fixed_address'
  | 'homeless'
  | 'temporary_accommodation'
  | 'dont_know';

export type IntoxicationStatus =
  | 'yes_drinking'
  | 'yes_drugs'
  | 'yes_drinking_and_drugs'
  | 'no'
  | 'dont_know';

export type OffenderVictimRelationship = 'stranger' | 'relative' | 'acquaintance' | 'dont_know';

export interface OffenderInformation {
  /** Offender(s) gender */
  gender?: Gender;

  /** Age at time of offence */
  age_at_offence?: number;

  /** Employment status at time of offence */
  employment_status?: EmploymentStatus;

  /** Accommodation status at time of offence */
  accommodation_status?: AccommodationStatus;

  /** Mental health status */
  mental_health?: string;

  /** Was offender intoxicated? */
  intoxicated?: IntoxicationStatus;

  /** Offender-victim relationship */
  victim_relationship?: OffenderVictimRelationship;
}

export type VictimType = 'individual' | 'organisation';

export interface VictimInformation {
  /** Type of victim */
  victim_type?: VictimType;

  /** Number of victims */
  count?: number;

  /** Victim(s) gender */
  gender?: Gender;

  /** Age at time of offence */
  age_at_offence?: number;

  /** Employment status */
  employment_status?: EmploymentStatus;

  /** Accommodation status */
  accommodation_status?: AccommodationStatus;

  /** Mental health status */
  mental_health?: string;

  /** Was victim intoxicated? */
  intoxicated?: IntoxicationStatus;
}

export type RemandDecision =
  | 'unconditional_bail'
  | 'conditional_bail'
  | 'remanded_custody'
  | 'dont_know';

export type SentenceServeType =
  | 'all_concurrent'
  | 'all_consecutive'
  | 'combination'
  | 'dont_know';

export type RiskLevel = 'low' | 'medium' | 'high' | 'dont_know';

export interface OffenceTrialData {
  // Conviction details
  /** Court name(s) where offender convicted/pled guilty */
  conviction_courts?: string[];

  /** Conviction/guilty plea date(s) in ISO format */
  conviction_dates?: string[];

  /** Offence(s) offender was convicted of */
  convicted_offences?: string[];

  /** Offence(s) offender was acquitted of */
  acquitted_offences?: string[];

  // Plea information
  plea?: PleaInformation;

  // Remand information
  remand_decision?: RemandDecision;
  remand_custody_duration?: string;

  // Sentencing details
  sentence_court?: string;
  sentences?: string[];
  sentence_serve_type?: SentenceServeType;
  ancillary_orders?: string[];

  // Offender and victim information
  offender?: OffenderInformation;
  victim?: VictimInformation;

  // Evidence presented
  /** Types of evidence prosecution presented at trial */
  prosecution_evidence?: string[];

  /** Types of evidence defence presented at trial */
  defence_evidence?: string[];

  // Sentencing factors
  pre_sentence_report?: RiskLevel;
  aggravating_factors?: string[];
  mitigating_factors?: string[];
  victim_impact_statement?: boolean;
}

// Section 4: Appeal Information
export type AppellantType = 'offender' | 'attorney_general' | 'other';

export type AppealAgainst =
  | 'conviction_unsafe'
  | 'sentence_excessive'
  | 'sentence_lenient'
  | 'both_conviction_and_sentence'
  | 'other';

export type AppealOutcome =
  | 'dismissed'
  | 'allowed_conviction_quashed'
  | 'allowed_sentence_more_excessive'
  | 'allowed_sentence_more_lenient'
  | 'mixed_decision'
  | 'other';

export interface CoDefendantInfo {
  /** Were there co-defendants? */
  present?: boolean;

  /** Number of co-defendants */
  count?: number;
}

export interface AppealReasons {
  /** Reasons why conviction is unsafe/quashed */
  quash_conviction?: string[];

  /** Reasons why sentence is unduly excessive */
  sentence_excessive?: string[];

  /** Reasons why sentence is unduly lenient */
  sentence_lenient?: string[];

  /** Reasons why appeal was dismissed */
  dismissed?: string[];
}

export interface AppealData {
  /** Who is the appellant? */
  appellant?: AppellantType;

  /** Co-defendant information */
  co_defendants?: CoDefendantInfo;

  /** What is the appeal against? */
  appeal_against?: AppealAgainst;

  /** Ground(s) for appeal */
  appeal_grounds?: string[];

  /** Sentencing guidelines/laws/acts mentioned */
  sentencing_guidelines?: string[];

  /** Outcome of appeal */
  appeal_outcome?: AppealOutcome;

  /** Appeal court's reasoning */
  reasons?: AppealReasons;
}

// =============================================================================
// MAIN JUDGMENT TYPE
// =============================================================================

export interface Judgment {
  // Primary identification
  id: string;

  // Core metadata
  case_number: string;
  jurisdiction: 'PL' | 'UK';
  language?: string;
  country?: string;
  court_name?: string;
  court_level?: string;
  decision_date?: string; // ISO date string
  publication_date?: string;

  // Content
  title?: string;
  summary?: string;
  full_text: string;

  // Legal details
  judges?: Record<string, any>;
  case_type?: string;
  decision_type?: string;
  outcome?: string;

  // Classification
  keywords?: string[];
  legal_topics?: string[];
  cited_legislation?: string[];

  // Vector embedding
  embedding?: number[];

  // Coding scheme data
  court_hearing_data?: CourtHearingData;
  offence_trial_data?: OffenceTrialData;
  appeal_data?: AppealData;

  // Flexible metadata
  metadata?: Record<string, any>;

  // Source information
  source_dataset?: string;
  source_id?: string;
  source_url?: string;

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

export interface JudgmentCreateRequest {
  case_number: string;
  jurisdiction: 'PL' | 'UK';
  language?: string;
  country?: string;
  court_name?: string;
  court_level?: string;
  decision_date?: string;
  publication_date?: string;
  title?: string;
  summary?: string;
  full_text: string;
  judges?: Record<string, any>;
  case_type?: string;
  decision_type?: string;
  outcome?: string;
  keywords?: string[];
  legal_topics?: string[];
  cited_legislation?: string[];
  court_hearing_data?: CourtHearingData;
  offence_trial_data?: OffenceTrialData;
  appeal_data?: AppealData;
  metadata?: Record<string, any>;
  source_dataset?: string;
  source_id?: string;
  source_url?: string;
}

export interface JudgmentUpdateRequest {
  case_number?: string;
  language?: string;
  country?: string;
  court_name?: string;
  court_level?: string;
  decision_date?: string;
  publication_date?: string;
  title?: string;
  summary?: string;
  full_text?: string;
  judges?: Record<string, any>;
  case_type?: string;
  decision_type?: string;
  outcome?: string;
  keywords?: string[];
  legal_topics?: string[];
  cited_legislation?: string[];
  court_hearing_data?: CourtHearingData;
  offence_trial_data?: OffenceTrialData;
  appeal_data?: AppealData;
  metadata?: Record<string, any>;
  source_url?: string;
}

export interface JudgmentListResponse {
  judgments: Judgment[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

// =============================================================================
// SEARCH TYPES
// =============================================================================

export interface HybridSearchResult extends Judgment {
  /** Vector similarity score (0-1) */
  vector_score?: number;

  /** Full-text search score */
  text_score?: number;

  /** Combined hybrid score */
  combined_score?: number;
}

export interface HybridSearchResponse {
  results: HybridSearchResult[];
  total: number;
  query_time_ms: number;
  search_params: Record<string, any>;
}

// =============================================================================
// FILTER TYPES
// =============================================================================

export interface JudgmentFilters {
  jurisdictions?: string[];
  languages?: string[];
  countries?: string[];
  court_names?: string[];
  court_levels?: string[];
  case_types?: string[];
  decision_types?: string[];
  outcomes?: string[];
  keywords?: string[];
  legal_topics?: string[];
  cited_legislation?: string[];
  date_from?: string;
  date_to?: string;
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

/**
 * Example: Creating a judgment with coding scheme data
 *
 * const newJudgment: JudgmentCreateRequest = {
 *   case_number: "2023/EWCA/Crim/123",
 *   jurisdiction: "UK",
 *   language: "en",
 *   country: "UK",
 *   court_name: "Court of Appeal (Criminal Division)",
 *   full_text: "Full judgment text...",
 *   case_type: "Criminal",
 *
 *   // Section 2: Court hearing data
 *   court_hearing_data: {
 *     neutral_citation_number: "[2023] EWCA Crim 123",
 *     appeal_judges: ["Lord Justice Smith", "Mr Justice Jones"],
 *     case_name: "Regina v. John Smith"
 *   },
 *
 *   // Section 4: Appeal data
 *   appeal_data: {
 *     appellant: "offender",
 *     appeal_against: "conviction_unsafe",
 *     appeal_grounds: ["trial_judge_summing_up", "evidence_admissibility"],
 *     appeal_outcome: "dismissed",
 *     reasons: {
 *       dismissed: [
 *         "Trial judge considered all relevant facts",
 *         "No merit in appeal"
 *       ]
 *     }
 *   }
 * };
 */

/**
 * Example: Querying nested JSONB data
 *
 * // In SQL:
 * SELECT * FROM judgments
 * WHERE appeal_data->>'appeal_outcome' = 'dismissed';
 *
 * // In TypeScript with Supabase client:
 * const { data } = await supabase
 *   .from('judgments')
 *   .select('*')
 *   .eq('appeal_data->appeal_outcome', 'dismissed');
 */
