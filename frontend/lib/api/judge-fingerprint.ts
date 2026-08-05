import { apiLogger } from './client';
import type {
  JudgeSearchResponse,
  JudgeProfile,
  JudgeCompareResponse,
} from '@/types/judge-fingerprint';

const API_BASE = '/api/judge-fingerprint';

interface BackendJudgeSearchResult {
  judge_name: string;
  case_count: number;
}

interface BackendSampleCase {
  case_id: string;
  case_number: string | null;
  date: string | null;
  dominant_pattern: string;
  court_name: string | null;
}

interface BackendJudgeProfile extends Omit<JudgeProfile, 'dominant_style' | 'period' | 'sample_cases'> {
  dominant_style: string;
  period: {
    first_case: string | null;
    last_case: string | null;
  };
  sample_cases: BackendSampleCase[];
}

function toJudgeProfile(profile: BackendJudgeProfile): JudgeProfile {
  return {
    ...profile,
    dominant_style: profile.dominant_style as JudgeProfile['dominant_style'],
    period: profile.period,
    sample_cases: profile.sample_cases.map((sampleCase) => ({
      document_id: sampleCase.case_id,
      title: sampleCase.case_number ?? sampleCase.court_name ?? sampleCase.case_id,
      date: sampleCase.date,
      reasoning_pattern: sampleCase.dominant_pattern as JudgeProfile['dominant_style'],
    })),
  };
}

/**
 * Search for judges by name with autocomplete.
 * GET /api/judge-fingerprint/search?q=<name>&limit=<limit>
 */
export async function searchJudges(
  query: string,
  limit: number = 10
): Promise<JudgeSearchResponse> {
  apiLogger.info('searchJudges called', { query, limit });

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetch(`${API_BASE}/search?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch((parseError) => ({ error: 'Failed to search judges', parseError: String(parseError) }));
    apiLogger.error('Search judges API error:', response.status, errorData);
    throw new Error('Failed to search judges. Please try again.');
  }

  const results = await response.json() as BackendJudgeSearchResult[];
  return {
    judges: results.map((result) => ({
      name: result.judge_name,
      case_count: result.case_count,
    })),
  };
}

/**
 * Fetch a full profile for a single judge.
 * GET /api/judge-fingerprint/profile/<judge_name>
 */
export async function getJudgeProfile(judgeName: string): Promise<JudgeProfile> {
  apiLogger.info('getJudgeProfile called', { judgeName });

  const encoded = encodeURIComponent(judgeName);
  const response = await fetch(`${API_BASE}/profile/${encoded}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch((parseError) => ({ error: 'Failed to fetch judge profile', parseError: String(parseError) }));
    apiLogger.error('Get judge profile API error:', response.status, errorData);
    throw new Error(`Failed to fetch profile for ${judgeName}. Please try again.`);
  }

  return toJudgeProfile(await response.json() as BackendJudgeProfile);
}

/**
 * Compare 2-3 judges side by side.
 * GET /api/judge-fingerprint/compare?judges=Name1,Name2
 */
export async function compareJudges(judgeNames: string[]): Promise<JudgeCompareResponse> {
  apiLogger.info('compareJudges called', { judgeNames });

  const params = new URLSearchParams({ judges: judgeNames.join(',') });
  const response = await fetch(`${API_BASE}/compare?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch((parseError) => ({ error: 'Failed to compare judges', parseError: String(parseError) }));
    apiLogger.error('Compare judges API error:', response.status, errorData);
    throw new Error('Failed to compare judges. Please try again.');
  }

  const profiles = await response.json() as BackendJudgeProfile[];
  return { profiles: profiles.map(toJudgeProfile) };
}
