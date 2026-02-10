export type ExperimentStatus = "draft" | "running" | "paused" | "completed" | "archived";
export type ExperimentType = "ab_test" | "multivariate" | "feature_flag";
export type TargetAudience = "all_users" | "new_users" | "returning_users" | "percentage";
export type FeatureArea = "ui" | "search" | "chat" | "prompts" | "navigation" | "other";

export interface ExperimentVariant {
  id: string;
  experiment_id: string;
  name: string;
  description: string | null;
  is_control: boolean;
  weight: number;
  config: Record<string, unknown>;
  created_at: string;
}

export interface Experiment {
  id: string;
  name: string;
  description: string | null;
  hypothesis: string | null;
  status: ExperimentStatus;
  experiment_type: ExperimentType;
  target_audience: TargetAudience;
  target_percentage: number;
  primary_metric: string;
  secondary_metrics: string[];
  start_date: string | null;
  end_date: string | null;
  feature_area: FeatureArea | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  experiment_variants: ExperimentVariant[];
}

export interface VariantResult {
  variant_id: string;
  variant_name: string;
  is_control: boolean;
  total_users: number;
  total_events: number;
  conversion_count: number;
  conversion_rate: number;
  avg_event_value: number | null;
}

export interface ExperimentResults {
  experiment_id: string;
  experiment_name: string;
  status: string;
  variants: VariantResult[];
  total_participants: number;
  statistical_significance: number | null;
}

export interface CreateExperimentInput {
  name: string;
  description?: string;
  hypothesis?: string;
  experiment_type?: ExperimentType;
  target_audience?: TargetAudience;
  target_percentage?: number;
  primary_metric?: string;
  secondary_metrics?: string[];
  start_date?: string;
  end_date?: string;
  feature_area?: FeatureArea;
  variants: {
    name: string;
    description?: string;
    is_control: boolean;
    weight: number;
    config?: Record<string, unknown>;
  }[];
}

export interface TrackExperimentEventInput {
  experiment_id: string;
  variant_id: string;
  event_type: string;
  event_value?: number;
  metadata?: Record<string, unknown>;
}

export interface ActiveExperimentsResponse {
  experiments: Experiment[];
  assignments: Record<string, string>;
}
