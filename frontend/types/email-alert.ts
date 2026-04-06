export interface EmailAlertSubscription {
  id: string;
  user_id: string;
  name: string;
  query: string;
  search_config: Record<string, unknown>;
  is_active: boolean;
  frequency: 'daily' | 'weekly';
  channels: string[];  // e.g. ['email', 'in_app', 'webhook']
  webhook_url: string | null;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEmailAlertInput {
  name: string;
  query: string;
  search_config?: Record<string, unknown>;
  frequency?: 'daily' | 'weekly';
  channels?: string[];
  webhook_url?: string;
}

export interface UpdateEmailAlertInput {
  name?: string;
  query?: string;
  search_config?: Record<string, unknown>;
  is_active?: boolean;
  frequency?: 'daily' | 'weekly';
  channels?: string[];
  webhook_url?: string;
}

export interface EmailAlertLog {
  id: string;
  subscription_id: string | null;
  frequency: string;
  matches_count: number;
  channels_delivered: string[];
  error: string | null;
  created_at: string;
}
