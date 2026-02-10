export type AlertType = 'saved_search' | 'citation_update' | 'collection_change';
export type AlertFrequency = 'immediate' | 'daily' | 'weekly';
export type DigestDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type AlertLogStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface EmailAlertSubscription {
  id: string;
  user_id: string;
  alert_type: AlertType;
  saved_search_id: string | null;
  document_id: string | null;
  collection_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  frequency: AlertFrequency;
  digest_day: DigestDay | null;
  digest_time: string;
  email_address: string | null;
  last_triggered_at: string | null;
  last_sent_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
  // Joined data (when fetched with saved search)
  saved_search?: {
    name: string;
    query: string;
  };
}

export interface CreateEmailAlertInput {
  alert_type: AlertType;
  saved_search_id?: string;
  document_id?: string;
  collection_id?: string;
  name: string;
  description?: string;
  frequency: AlertFrequency;
  digest_day?: DigestDay;
  digest_time?: string;
  email_address?: string;
}

export interface UpdateEmailAlertInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  frequency?: AlertFrequency;
  digest_day?: DigestDay | null;
  digest_time?: string;
  email_address?: string | null;
}

export interface EmailAlertLog {
  id: string;
  subscription_id: string;
  user_id: string;
  alert_type: string;
  subject: string;
  digest_period_start: string | null;
  digest_period_end: string | null;
  new_documents_count: number;
  matched_query: string | null;
  status: AlertLogStatus;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  saved_search: 'New Documents',
  citation_update: 'Citation Updates',
  collection_change: 'Collection Changes',
};

export const FREQUENCY_LABELS: Record<AlertFrequency, string> = {
  immediate: 'Immediate',
  daily: 'Daily Digest',
  weekly: 'Weekly Digest',
};

export const DAY_LABELS: Record<DigestDay, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};
