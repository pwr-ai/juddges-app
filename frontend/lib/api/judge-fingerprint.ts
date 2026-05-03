import { apiLogger } from './client';
import type {
  JudgeSearchResponse,
  JudgeProfile,
  JudgeCompareResponse,
} from '@/types/judge-fingerprint';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

/**
 * Search for judges by name with autocomplete.
 * GET /judge-fingerprint/search?q=<name>&limit=<limit>
 */
export async function searchJudges(
  query: string,
  limit: number = 10
): Promise<JudgeSearchResponse> {
  apiLogger.info('searchJudges called', { query, limit });

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetch(`${API_BASE}/judge-fingerprint/search?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to search judges' }));
    apiLogger.error('Search judges API error:', response.status, errorData);
    throw new Error('Failed to search judges. Please try again.');
  }

  return response.json();
}

/**
 * Fetch a full profile for a single judge.
 * GET /judge-fingerprint/profile/<judge_name>
 */
export async function getJudgeProfile(judgeName: string): Promise<JudgeProfile> {
  apiLogger.info('getJudgeProfile called', { judgeName });

  const encoded = encodeURIComponent(judgeName);
  const response = await fetch(`${API_BASE}/judge-fingerprint/profile/${encoded}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to fetch judge profile' }));
    apiLogger.error('Get judge profile API error:', response.status, errorData);
    throw new Error(`Failed to fetch profile for ${judgeName}. Please try again.`);
  }

  return response.json();
}

/**
 * Compare 2-3 judges side by side.
 * GET /judge-fingerprint/compare?judges=Name1,Name2
 */
export async function compareJudges(judgeNames: string[]): Promise<JudgeCompareResponse> {
  apiLogger.info('compareJudges called', { judgeNames });

  const params = new URLSearchParams({ judges: judgeNames.join(',') });
  const response = await fetch(`${API_BASE}/judge-fingerprint/compare?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to compare judges' }));
    apiLogger.error('Compare judges API error:', response.status, errorData);
    throw new Error('Failed to compare judges. Please try again.');
  }

  return response.json();
}
