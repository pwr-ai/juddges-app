export interface UserSearchHistoryItem {
  query: string;
  hit_count?: number | null;
  topic_hits_count?: number | null;
  processing_ms?: number | null;
  filters?: string | null;
  created_at: string;
}

/**
  * Fetch search history for the currently logged-in user.
  */
export async function getUserSearchHistory(
  days: number = 30,
  limit: number = 100
): Promise<UserSearchHistoryItem[]> {
  const response = await fetch(`/api/search/analytics/history?days=${days}&limit=${limit}`);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return [];
    }
    throw new Error(`Failed to fetch search history: ${response.statusText}`);
  }

  return await response.json();
}

/**
  * Clear all search history for the currently logged-in user.
  */
export async function clearUserSearchHistory(): Promise<boolean> {
  const response = await fetch('/api/search/analytics/history', {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to clear search history: ${response.statusText}`);
  }

  const data = await response.json();
  return data.success ?? true;
}
