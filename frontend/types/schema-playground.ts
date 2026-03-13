/**
 * Type definitions for Schema Playground, Evaluation, and Version Management
 */

// ============================================
// Playground Types
// ============================================

export interface PlaygroundExtractionRequest {
  schema_id: string;
  schema_version_id?: string;
  document_id: string;
  extraction_context?: string;
  additional_instructions?: string;
  language?: 'pl' | 'en';
}

export interface PlaygroundTiming {
  total_ms: number;
  document_fetch_ms: number;
  extraction_ms: number;
  started_at: string;
  completed_at: string;
}

export interface PlaygroundExtractionResponse {
  document_id: string;
  schema_id: string;
  schema_version: number;
  schema_version_id: string | null;
  status: 'success' | 'failed';
  extracted_data: Record<string, unknown> | null;
  error_message: string | null;
  timing: PlaygroundTiming;
  schema_name: string;
  field_count: number;
  document_title: string | null;
  document_type: string | null;
}

export interface PlaygroundTestRun {
  id: string;
  schema_id: string;
  schema_version_id: string | null;
  document_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  execution_time_ms: number;
  created_at: string;
}

export interface PlaygroundState {
  // Document selection
  selectedDocumentId: string | null;
  selectedCollectionId: string | null;
  availableDocuments: PlaygroundDocument[];
  isLoadingDocuments: boolean;

  // Extraction state
  extractionResult: PlaygroundExtractionResponse | null;
  isExtracting: boolean;
  extractionError: string | null;

  // Test history
  recentRuns: PlaygroundTestRun[];

  // UI state
  selectedFieldPath: string | null;
}

export interface PlaygroundDocument {
  id: string;
  title: string;
  document_type?: string;
  created_at?: string;
}

// ============================================
// Evaluation Types
// ============================================

export type OverallRating = 'correct' | 'incorrect';
export type RatingStatus = OverallRating | 'unrated';

export interface FieldEvaluation {
  field_path: string;
  field_name: string;
  is_correct: boolean;
  extracted_value?: unknown;
  evaluator_notes?: string;
}

export interface CreateEvaluationRequest {
  schema_version_id: string;
  document_id: string;
  playground_run_id?: string;
  overall_rating: OverallRating;
  overall_notes?: string;
  field_evaluations: FieldEvaluation[];
  extracted_data: Record<string, unknown>;
}

export interface UpdateEvaluationRequest {
  overall_rating?: OverallRating;
  overall_notes?: string;
  field_evaluations?: FieldEvaluation[];
}

export interface EvaluationResponse {
  id: string;
  schema_version_id: string;
  document_id: string;
  playground_run_id: string | null;
  overall_rating: OverallRating;
  overall_notes: string | null;
  extracted_data: Record<string, unknown>;
  evaluator_user_id: string | null;
  created_at: string;
  updated_at: string;
  field_evaluations: FieldEvaluation[];
}

export interface AccuracyStats {
  total_evaluations: number;
  correct_count: number;
  incorrect_count: number;
  accuracy_rate: number;
  total_fields_evaluated: number;
  correct_fields: number;
  field_accuracy_rate: number;
}

export interface SchemaEvaluationsResponse {
  schema_id: string;
  schema_version_id: string | null;
  stats: AccuracyStats;
  evaluations: EvaluationResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface EvaluationState {
  // Current evaluation being edited
  evaluationId: string | null;
  schemaVersionId: string | null;
  documentId: string | null;

  // Ratings
  overallRating: RatingStatus;
  overallNotes: string;
  fieldRatings: Map<string, boolean>; // field_path -> is_correct

  // Status
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;

  // Stats
  accuracyStats: AccuracyStats | null;
}

// ============================================
// Version Management Types
// ============================================

export type SchemaChangeType =
  | 'create'
  | 'ai_update'
  | 'visual_edit'
  | 'code_edit'
  | 'import'
  | 'bulk_import'
  | 'rollback'
  | 'merge';

export interface SchemaVersionSummary {
  id: string;
  version_number: number;
  change_type: SchemaChangeType;
  change_summary: string | null;
  changed_fields: string[] | null;
  user_id: string | null;
  created_at: string;
}

export interface SchemaVersionDetail {
  id: string;
  schema_id: string;
  version_number: number;
  schema_snapshot: Record<string, unknown>;
  field_snapshot: SchemaFieldSnapshot[];
  change_type: SchemaChangeType;
  change_summary: string | null;
  changed_fields: string[] | null;
  diff_from_previous: VersionDiff | null;
  user_id: string | null;
  created_at: string;
}

export interface SchemaFieldSnapshot {
  id: string;
  field_path: string;
  field_name: string;
  field_type: string;
  description?: string;
  is_required?: boolean;
  parent_field_id?: string | null;
  position?: number;
  validation_rules?: Record<string, unknown>;
  visual_metadata?: Record<string, unknown>;
}

export interface VersionDiff {
  rollback_from_version?: number;
  rollback_to_version?: number;
  added_fields?: string[];
  removed_fields?: string[];
  modified_fields?: string[];
}

export interface VersionFieldChange {
  property: string;
  old: unknown;
  new: unknown;
}

export interface VersionModifiedField {
  field_path: string;
  field_name: string;
  changes: VersionFieldChange[];
}

export interface VersionComparisonResponse {
  schema_id: string;
  version_a: number;
  version_b: number;
  added_fields: SchemaFieldSnapshot[];
  removed_fields: SchemaFieldSnapshot[];
  modified_fields: VersionModifiedField[];
}

export interface SchemaVersionsResponse {
  schema_id: string;
  current_version: number;
  versions: SchemaVersionSummary[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface RollbackRequest {
  change_summary?: string;
}

export interface RollbackResponse {
  schema_id: string;
  previous_version: number;
  new_version: number;
  restored_from_version: number;
  new_version_id: string;
  change_summary: string;
}

export interface VersionState {
  // Version list
  versions: SchemaVersionSummary[];
  currentVersion: number;
  isLoadingVersions: boolean;

  // Selected version for viewing
  selectedVersion: SchemaVersionDetail | null;
  isLoadingVersion: boolean;

  // Comparison
  comparisonResult: VersionComparisonResponse | null;
  isComparing: boolean;

  // Rollback
  isRollingBack: boolean;
}

// ============================================
// Combined Store State
// ============================================

export interface SchemaPlaygroundStoreState {
  playground: PlaygroundState;
  evaluation: EvaluationState;
  versions: VersionState;
}

// ============================================
// UI Helper Types
// ============================================

export interface FieldRatingState {
  field_path: string;
  field_name: string;
  extracted_value: unknown;
  is_correct: boolean | null; // null = unrated
}

export interface PlaygroundTabState {
  activeTab: 'fields' | 'versions';
}

export interface DocumentSelectorOption {
  id: string;
  title: string;
  type?: string;
  selected: boolean;
}

// Change type display configuration
export const CHANGE_TYPE_CONFIG: Record<
  SchemaChangeType,
  { label: string; color: string; icon: string }
> = {
  create: { label: 'Created', color: 'green', icon: 'Plus' },
  ai_update: { label: 'AI Update', color: 'purple', icon: 'Sparkles' },
  visual_edit: { label: 'Visual Edit', color: 'blue', icon: 'Edit' },
  code_edit: { label: 'Code Edit', color: 'gray', icon: 'Code' },
  import: { label: 'Imported', color: 'cyan', icon: 'Download' },
  bulk_import: { label: 'Bulk Import', color: 'cyan', icon: 'Files' },
  rollback: { label: 'Rollback', color: 'orange', icon: 'RotateCcw' },
  merge: { label: 'Merged', color: 'indigo', icon: 'GitMerge' },
};
