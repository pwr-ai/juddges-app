export interface EmailAlertSubscription {
  id: string;
  user_id: string;
  type: string;
  query?: string;
  filters?: Record<string, unknown>;
  frequency: string;
  is_active: boolean;
  last_sent_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEmailAlertInput {
  type: string;
  query?: string;
  filters?: Record<string, unknown>;
  frequency: string;
}

export interface UpdateEmailAlertInput {
  query?: string;
  filters?: Record<string, unknown>;
  frequency?: string;
  is_active?: boolean;
}

export interface EmailAlertLog {
  id: string;
  subscription_id: string;
  sent_at: string;
  status: string;
  results_count: number;
  error?: string;
}
