/**
 * @jest-environment node
 */

import {
  analyzeReasoningLineDrift,
  classifyOutcomes,
  createReasoningLine,
  deleteReasoningLine,
  detectEvents,
  discoverReasoningLines,
  getReasoningLineDAG,
  getReasoningLineDetail,
  getReasoningLineTimeline,
  getRelatedLines,
  listReasoningLines,
  searchReasoningLines,
} from '@/lib/api/reasoning-lines';

global.fetch = jest.fn();

describe('reasoning-lines API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it('uses the authenticated same-origin BFF for every reasoning-lines operation', async () => {
    await discoverReasoningLines({
      sample_size: 20,
      num_clusters: 2,
      legal_domain_filter: null,
      min_shared_legal_bases: 1,
    });
    await createReasoningLine({
      label: 'VAT deduction',
      legal_question: 'When is VAT deductible?',
      keywords: ['VAT'],
      legal_bases: [],
      judgment_ids: ['judgment-1'],
      coherence_score: 0.9,
    });
    await listReasoningLines('active', 25, 5);
    await getReasoningLineDetail('line-1');
    await deleteReasoningLine('line-1');
    await getReasoningLineTimeline('line-1');
    await analyzeReasoningLineDrift('line-1');
    await classifyOutcomes('line-1');
    await getReasoningLineDAG();
    await detectEvents();
    await searchReasoningLines('VAT deduction', 7, 0.4);
    await getRelatedLines('line-1');

    expect((global.fetch as jest.Mock).mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/api/reasoning-lines/discover', 'POST'],
      ['/api/reasoning-lines/create', 'POST'],
      ['/api/reasoning-lines/?status=active&limit=25&offset=5', 'GET'],
      ['/api/reasoning-lines/line-1', 'GET'],
      ['/api/reasoning-lines/line-1', 'DELETE'],
      ['/api/reasoning-lines/line-1/timeline', 'GET'],
      ['/api/reasoning-lines/line-1/drift-analysis', 'POST'],
      ['/api/reasoning-lines/line-1/analyze-outcomes', 'POST'],
      ['/api/reasoning-lines/dag', 'GET'],
      ['/api/reasoning-lines/detect-events', 'POST'],
      ['/api/reasoning-lines/search', 'POST'],
      ['/api/reasoning-lines/line-1/related', 'GET'],
    ]);
  });
});
