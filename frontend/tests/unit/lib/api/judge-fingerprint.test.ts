/**
 * @jest-environment node
 */

import { compareJudges, getJudgeProfile, searchJudges } from '@/lib/api/judge-fingerprint';

global.fetch = jest.fn();

describe('judge fingerprint API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the same-origin BFF for judge search', async () => {
    const payload = [{ judge_name: 'Lady Smith', case_count: 3 }];
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => payload });

    await expect(searchJudges('Lady Smith', 5)).resolves.toEqual({
      judges: [{ name: 'Lady Smith', case_count: 3 }],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/judge-fingerprint/search?q=Lady+Smith&limit=5',
      expect.any(Object),
    );
  });

  it('uses an encoded same-origin BFF path for a judge profile', async () => {
    const payload = {
      judge_name: 'Lady Smith KC',
      total_cases: 1,
      style_scores: {
        textual: 100,
        deductive: 0,
        analogical: 0,
        policy: 0,
        teleological: 0,
      },
      dominant_style: 'textual',
      cases_analyzed: 1,
      period: { first_case: '2024-01-01', last_case: '2024-01-01' },
      sample_cases: [{
        case_id: 'case-1',
        case_number: 'UKSC 1',
        date: '2024-01-01',
        dominant_pattern: 'textual',
        court_name: 'UK Supreme Court',
      }],
    };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => payload });

    await expect(getJudgeProfile('Lady Smith KC')).resolves.toEqual({
      ...payload,
      sample_cases: [{
        document_id: 'case-1',
        title: 'UKSC 1',
        date: '2024-01-01',
        reasoning_pattern: 'textual',
      }],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/judge-fingerprint/profile/Lady%20Smith%20KC',
      expect.any(Object),
    );
  });

  it('uses the same-origin BFF for judge comparison', async () => {
    const profile = {
      total_cases: 0,
      style_scores: {
        textual: 0,
        deductive: 0,
        analogical: 0,
        policy: 0,
        teleological: 0,
      },
      dominant_style: 'deductive',
      cases_analyzed: 0,
      period: { first_case: null, last_case: null },
      sample_cases: [],
    };
    const payload = [
      { ...profile, judge_name: 'Lady Smith' },
      { ...profile, judge_name: 'Lord Jones' },
    ];
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => payload });

    await expect(compareJudges(['Lady Smith', 'Lord Jones'])).resolves.toEqual({ profiles: payload });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/judge-fingerprint/compare?judges=Lady+Smith%2CLord+Jones',
      expect.any(Object),
    );
  });
});
