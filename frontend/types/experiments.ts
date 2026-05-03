export interface Experiment {
  id: string;
  name: string;
  description?: string;
  status: string;
  variants: ExperimentVariant[];
  traffic_allocation?: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  description?: string;
  weight: number;
  config?: Record<string, unknown>;
}

export interface ExperimentResults {
  experiment_id: string;
  variants: Array<{
    variant_id: string;
    name: string;
    participants: number;
    events: Record<string, number>;
    conversion_rate?: number;
  }>;
  statistical_significance?: number;
}

export interface CreateExperimentInput {
  name: string;
  description?: string;
  variants: Array<{
    name: string;
    description?: string;
    weight: number;
    config?: Record<string, unknown>;
  }>;
  traffic_allocation?: number;
}

export interface ActiveExperimentsResponse {
  experiments: Experiment[];
  assignments: Record<string, string>;
}
