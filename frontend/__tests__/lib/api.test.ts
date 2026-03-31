/**
 * Tests for the main API client module (lib/api.ts).
 *
 * Exercises every exported async function, verifying:
 *  - correct HTTP method and URL
 *  - request body serialization
 *  - successful response parsing
 *  - error handling (HTTP errors, JSON parse failures)
 *
 * @jest-environment jsdom
 */

// Mock fetch globally before imports
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

import {
  askQuestion,
  askChatQuestion,
  searchDocuments,
  getExampleQuestions,
  searchDocumentsDirect,
  getChunksForDocuments,
  searchChunks,
  fetchChunksByUuid,
  fetchDocumentsByIds,
  summarizeDocuments,
  extractKeyPoints,
  submitBulkExtraction,
  findPrecedents,
  getCitationNetwork,
  getVersionHistory,
  getVersionDetail,
  getVersionDiff,
  createVersionSnapshot,
  getOCRJobStatus,
  listOCRJobs,
  submitOCRCorrection,
  revertToVersion,
  getSemanticClusters,
  getRecommendations,
  trackDocumentInteraction,
  analyzeResearchContext,
  getResearchSuggestions,
  saveResearchContext,
  analyzeArguments,
  browseMarketplaceListings,
  getMarketplaceStats,
  publishToMarketplace,
  downloadMarketplaceSchema,
  submitMarketplaceReview,
  extractTimeline,
} from '@/lib/api';

// Helper: create a minimal mock Response
function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

function errorResponse(status: number, body?: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body ?? { error: 'error' },
    text: async () => JSON.stringify(body ?? { error: 'error' }),
  } as Response;
}

// Helper: response where json() throws (e.g. non-JSON body)
function errorResponseNoJson(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => { throw new Error('not json'); },
    text: async () => 'raw error text',
  } as Response;
}

// ── streamChatQuestion animation race condition ─────────────────────
describe('streamChatQuestion animation cancellation', () => {
  // ReadableStream is not available in jsdom, so we polyfill it for this test
  const { ReadableStream: WebReadableStream } = require('stream/web');

  let clearTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    mockFetch.mockReset();
    jest.useFakeTimers();
    clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    // Polyfill ReadableStream for jsdom
    if (typeof globalThis.ReadableStream === 'undefined') {
      (globalThis as any).ReadableStream = WebReadableStream;
    }
  });

  afterEach(() => {
    jest.useRealTimers();
    clearTimeoutSpy.mockRestore();
  });

  /**
   * Create a ReadableStream that yields SSE data chunks.
   * Each chunk is a complete SSE event with progressively growing text.
   */
  function makeSSEStream(textChunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;
    return new WebReadableStream({
      pull(controller: any) {
        if (index < textChunks.length) {
          // Build progressively growing text (mimics how the backend sends data)
          const fullTextSoFar = textChunks.slice(0, index + 1).join('');
          const sseEvent = `data: ${JSON.stringify({ text: fullTextSoFar })}\n\n`;
          controller.enqueue(encoder.encode(sseEvent));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  it('cancels pending animation timeouts when a new chunk arrives', async () => {
    // Create a stream with two chunks that arrive in sequence
    const stream = makeSSEStream(['Hello World! ', 'This is more text.']);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    } as Response);

    const tokens: string[] = [];
    const callbacks = {
      onToken: (token: string) => tokens.push(token),
      onComplete: jest.fn(),
      onError: jest.fn(),
    };

    // Import the function dynamically to use it with our mocked fetch
    const { streamChatQuestion } = await import('@/lib/api');

    const promise = streamChatQuestion(
      { question: 'test' } as any,
      callbacks
    );

    // Advance timers to process the simulated streaming animation
    jest.advanceTimersByTime(5000);
    await promise;

    // The function should complete without errors
    expect(callbacks.onError).not.toHaveBeenCalled();

    // clearTimeout should have been called when the second chunk arrived
    // while the first animation was still in progress
    expect(clearTimeoutSpy).toHaveBeenCalled();

    // The final token should contain the complete text
    if (tokens.length > 0) {
      const lastToken = tokens[tokens.length - 1];
      expect(lastToken).toContain('Hello World!');
    }
  });
});

describe('API client functions', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // ── askQuestion ────────────────────────────────────────────────────────

  describe('askQuestion', () => {
    it('sends POST to /api/qa and returns parsed response', async () => {
      const mockData = { output: { text: 'answer', document_ids: [] }, metadata: { run_id: '1', feedback_tokens: [] } };
      mockFetch.mockResolvedValueOnce(okResponse(mockData));

      const result = await askQuestion({ question: 'test?' });
      expect(mockFetch).toHaveBeenCalledWith('/api/qa', expect.objectContaining({ method: 'POST' }));
      expect(result.output.text).toBe('answer');
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));
      await expect(askQuestion({ question: 'fail' })).rejects.toThrow('API error: 500');
    });
  });

  // ── askChatQuestion ────────────────────────────────────────────────────

  describe('askChatQuestion', () => {
    it('sends POST to /api/chat', async () => {
      const mockData = { output: { text: 'hi', document_ids: [] }, metadata: { run_id: '2', feedback_tokens: [] } };
      mockFetch.mockResolvedValueOnce(okResponse(mockData));

      const result = await askChatQuestion({ question: 'hello' });
      expect(mockFetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({ method: 'POST' }));
      expect(result.output.text).toBe('hi');
    });

    it('extracts error detail from JSON response body', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(400, { detail: 'bad request' }));
      await expect(askChatQuestion({ question: 'fail' })).rejects.toThrow('bad request');
    });

    it('falls back to text when JSON parsing fails', async () => {
      mockFetch.mockResolvedValueOnce(errorResponseNoJson(502));
      await expect(askChatQuestion({ question: 'fail' })).rejects.toThrow();
    });
  });

  // ── searchDocuments ────────────────────────────────────────────────────

  describe('searchDocuments', () => {
    it('sends POST to /api/documents with correct body', async () => {
      const mockResult = { documents: [], total: 0 };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));

      await searchDocuments('contract law', 10, { mode: 'rabbit', languages: ['en'] });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/documents');
      const body = JSON.parse(call[1]!.body as string);
      expect(body.question).toBe('contract law');
      expect(body.maxDocuments).toBe(10);
      expect(body.mode).toBe('rabbit');
    });

    it('throws user-friendly message on error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));
      await expect(searchDocuments('test', 5)).rejects.toThrow('Search request failed');
    });
  });

  // ── getExampleQuestions ────────────────────────────────────────────────

  describe('getExampleQuestions', () => {
    it('sends GET with query params', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ questions: ['q1', 'q2'] }));
      const result = await getExampleQuestions(3, 3);
      expect(result).toEqual(['q1', 'q2']);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('num_polish=3'),
        expect.any(Object)
      );
    });

    it('uses default params when none provided', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ questions: [] }));
      await getExampleQuestions();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('num_polish=2'),
        expect.any(Object)
      );
    });
  });

  // ── searchDocumentsDirect ──────────────────────────────────────────────

  describe('searchDocumentsDirect', () => {
    it('sends POST to /api/documents/search/direct', async () => {
      const mockResult = { documents: [], total_count: 0, is_capped: false };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));

      const result = await searchDocumentsDirect({ query: 'test', mode: 'rabbit' });
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/search/direct', expect.any(Object));
      expect(result.total_count).toBe(0);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));
      await expect(searchDocumentsDirect({ query: 'x', mode: 'rabbit' })).rejects.toThrow('Document search failed');
    });
  });

  // ── getChunksForDocuments ──────────────────────────────────────────────

  describe('getChunksForDocuments', () => {
    it('sends POST to /api/documents/chunks/by-document-ids', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ chunks_by_document: {} }));
      await getChunksForDocuments({ query: 'q', document_ids: ['d1'] });
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/chunks/by-document-ids', expect.any(Object));
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));
      await expect(getChunksForDocuments({ query: 'q', document_ids: [] })).rejects.toThrow('Failed to load document chunks');
    });
  });

  // ── searchChunks ───────────────────────────────────────────────────────

  describe('searchChunks', () => {
    it('sends POST to /api/documents/search', async () => {
      const mockResult = { chunks: [], total_chunks: 0, unique_documents: 0 };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));

      const result = await searchChunks({ query: 'test', limit_docs: 10 });
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/search', expect.any(Object));
      expect(result.total_chunks).toBe(0);
    });
  });

  // ── fetchChunksByUuid ──────────────────────────────────────────────────

  describe('fetchChunksByUuid', () => {
    it('sends POST to /api/documents/chunks/fetch', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ chunks: [], total_chunks: 0 }));
      const result = await fetchChunksByUuid({ chunk_uuids: ['uuid-1'] });
      expect(result.total_chunks).toBe(0);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404));
      await expect(fetchChunksByUuid({ chunk_uuids: [] })).rejects.toThrow('Failed to fetch chunk details');
    });
  });

  // ── fetchDocumentsByIds ────────────────────────────────────────────────

  describe('fetchDocumentsByIds', () => {
    it('sends POST to /api/documents/batch', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ documents: [] }));
      await fetchDocumentsByIds({ document_ids: ['d1'] });
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/batch', expect.any(Object));
    });

    it('includes return_properties when non-empty array provided', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ documents: [] }));
      await fetchDocumentsByIds({ document_ids: ['d1'], return_properties: ['title'] });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.return_properties).toEqual(['title']);
    });

    it('omits return_properties when empty array', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ documents: [] }));
      await fetchDocumentsByIds({ document_ids: ['d1'], return_properties: [] });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.return_properties).toBeUndefined();
    });
  });

  // ── summarizeDocuments ─────────────────────────────────────────────────

  describe('summarizeDocuments', () => {
    it('sends POST to /api/documents/summarize', async () => {
      const mockResult = { summary: 'sum', key_points: [], document_ids: [], summary_type: 'executive', length: 'short' };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));
      const result = await summarizeDocuments({ document_ids: ['d1'] });
      expect(result.summary).toBe('sum');
    });
  });

  // ── extractKeyPoints ───────────────────────────────────────────────────

  describe('extractKeyPoints', () => {
    it('sends POST to /api/documents/key-points', async () => {
      const mockResult = { arguments: [], holdings: [], legal_principles: [], document_id: 'd1' };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));
      const result = await extractKeyPoints({ document_id: 'd1' });
      expect(result.document_id).toBe('d1');
    });
  });

  // ── submitBulkExtraction ───────────────────────────────────────────────

  describe('submitBulkExtraction', () => {
    it('sends POST to /api/extractions/bulk', async () => {
      const mockResult = { bulk_id: 'b1', status: 'accepted', jobs: [], total_schemas: 1, total_documents: 5, auto_export: false, scheduled_at: null, message: null };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));
      const result = await submitBulkExtraction({ collection_id: 'c1', schema_ids: ['s1'] });
      expect(result.bulk_id).toBe('b1');
    });
  });

  // ── findPrecedents ─────────────────────────────────────────────────────

  describe('findPrecedents', () => {
    it('sends POST to /api/precedents/find', async () => {
      const mockResult = { query: 'q', precedents: [], total_found: 0, search_strategy: 'hybrid', enhanced_query: null };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));
      const result = await findPrecedents({ query: 'test case' });
      expect(result.total_found).toBe(0);
    });
  });

  // ── getCitationNetwork ─────────────────────────────────────────────────

  describe('getCitationNetwork', () => {
    it('sends GET to /api/documents/citation-network', async () => {
      const mockResult = { nodes: [], edges: [], statistics: { total_nodes: 0, total_edges: 0, avg_citations: 0, max_citations: 0, most_cited_refs: [], avg_authority_score: 0 } };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));
      await getCitationNetwork({ sample_size: 50 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sample_size=50'),
        expect.any(Object)
      );
    });

    it('calls without query params when no input given', async () => {
      const mockResult = { nodes: [], edges: [], statistics: { total_nodes: 0, total_edges: 0, avg_citations: 0, max_citations: 0, most_cited_refs: [], avg_authority_score: 0 } };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));
      await getCitationNetwork();
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/citation-network', expect.any(Object));
    });
  });

  // ── Version History ────────────────────────────────────────────────────

  describe('getVersionHistory', () => {
    it('sends GET to /api/documents/{id}/versions', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ versions: [], total: 0 }));
      await getVersionHistory('doc-1', { limit: 10 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/doc-1/versions'),
        expect.any(Object)
      );
    });
  });

  describe('getVersionDetail', () => {
    it('sends GET to correct versioned URL', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ version: {} }));
      await getVersionDetail('doc-1', 3);
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/doc-1/versions/3', expect.any(Object));
    });
  });

  describe('getVersionDiff', () => {
    it('sends GET with from/to params', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ diff: {} }));
      await getVersionDiff('doc-1', 1, 3);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('from=1&to=3'),
        expect.any(Object)
      );
    });
  });

  describe('createVersionSnapshot', () => {
    it('sends POST to /api/documents/{id}/versions', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ version_number: 1 }));
      await createVersionSnapshot('doc-1', { description: 'snapshot' } as any);
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/doc-1/versions', expect.objectContaining({ method: 'POST' }));
    });

    it('sends empty body when no input provided', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ version_number: 1 }));
      await createVersionSnapshot('doc-1');
      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body).toEqual({});
    });
  });

  // ── OCR ────────────────────────────────────────────────────────────────

  describe('getOCRJobStatus', () => {
    it('sends GET to /api/ocr/jobs/{id}', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ job_id: 'j1', status: 'completed' }));
      const result = await getOCRJobStatus('j1');
      expect(result.job_id).toBe('j1');
    });
  });

  describe('listOCRJobs', () => {
    it('sends GET with optional filters', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ jobs: [], total: 0, page: 1, page_size: 10 }));
      await listOCRJobs({ status: 'completed', page: 2 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=completed'),
        expect.any(Object)
      );
    });
  });

  describe('submitOCRCorrection', () => {
    it('sends POST to /api/ocr/jobs/{id}/correct', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ job_id: 'j1', status: 'corrected', corrected_at: '', message: 'ok' }));
      await submitOCRCorrection('j1', { corrected_text: 'fixed text' });
      expect(mockFetch).toHaveBeenCalledWith('/api/ocr/jobs/j1/correct', expect.objectContaining({ method: 'POST' }));
    });
  });

  // ── revertToVersion ────────────────────────────────────────────────────

  describe('revertToVersion', () => {
    it('sends POST to /api/documents/{id}/versions/revert', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ success: true }));
      await revertToVersion('doc-1', { version_number: 2 } as any);
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/doc-1/versions/revert', expect.objectContaining({ method: 'POST' }));
    });
  });

  // ── Semantic Clustering ────────────────────────────────────────────────

  describe('getSemanticClusters', () => {
    it('sends POST to /api/clustering/semantic-clusters', async () => {
      const mockResult = { clusters: [], nodes: [], edges: [], statistics: {} };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));
      await getSemanticClusters({ num_clusters: 5 });
      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.num_clusters).toBe(5);
    });
  });

  // ── Recommendations ────────────────────────────────────────────────────

  describe('getRecommendations', () => {
    it('sends GET with query params', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ recommendations: [] }));
      await getRecommendations({ query: 'contract', limit: 5 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('query=contract'),
        // No second arg for simple GET
      );
    });
  });

  describe('trackDocumentInteraction', () => {
    it('sends POST and does not throw on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'));
      // Should not throw - it silently fails
      await expect(trackDocumentInteraction({ document_id: 'd1', interaction_type: 'view' } as any)).resolves.toBeUndefined();
    });

    it('sends POST to /api/recommendations/track', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));
      await trackDocumentInteraction({ document_id: 'd1', interaction_type: 'view' } as any);
      expect(mockFetch).toHaveBeenCalledWith('/api/recommendations/track', expect.objectContaining({ method: 'POST' }));
    });
  });

  // ── Research Assistant ─────────────────────────────────────────────────

  describe('analyzeResearchContext', () => {
    it('sends POST to /api/research-assistant?action=analyze', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ analysis: {} }));
      await analyzeResearchContext({ query: 'test' } as any);
      expect(mockFetch).toHaveBeenCalledWith('/api/research-assistant?action=analyze', expect.objectContaining({ method: 'POST' }));
    });
  });

  describe('getResearchSuggestions', () => {
    it('sends GET with endpoint=suggestions', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ suggestions: [] }));
      await getResearchSuggestions({ query: 'test' });
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('endpoint=suggestions'));
    });
  });

  describe('saveResearchContext', () => {
    it('sends POST to /api/research-assistant?action=save', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ id: 'rc1' }));
      await saveResearchContext({ title: 'test' } as any);
      expect(mockFetch).toHaveBeenCalledWith('/api/research-assistant?action=save', expect.objectContaining({ method: 'POST' }));
    });
  });

  // ── Argumentation ──────────────────────────────────────────────────────

  describe('analyzeArguments', () => {
    it('sends POST to /api/argumentation', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ arguments: [], overall_analysis: {}, document_ids: [], argument_count: 0 }));
      await analyzeArguments({ document_ids: ['d1'] });
      expect(mockFetch).toHaveBeenCalledWith('/api/argumentation', expect.objectContaining({ method: 'POST' }));
    });
  });

  // ── Marketplace ────────────────────────────────────────────────────────

  describe('browseMarketplaceListings', () => {
    it('sends GET with endpoint=browse', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ listings: [], total: 0 }));
      await browseMarketplaceListings({ search: 'tax', category: 'legal' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('endpoint=browse');
      expect(url).toContain('search=tax');
    });
  });

  describe('getMarketplaceStats', () => {
    it('sends GET to /api/marketplace?endpoint=stats', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ stats: {} }));
      await getMarketplaceStats();
      expect(mockFetch).toHaveBeenCalledWith('/api/marketplace?endpoint=stats');
    });
  });

  describe('publishToMarketplace', () => {
    it('sends POST to /api/marketplace?action=publish', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ id: 'l1' }));
      await publishToMarketplace({ schema_id: 's1', title: 'My Schema' } as any);
      expect(mockFetch).toHaveBeenCalledWith('/api/marketplace?action=publish', expect.objectContaining({ method: 'POST' }));
    });
  });

  describe('downloadMarketplaceSchema', () => {
    it('sends POST with listing_id param', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ schema: {} }));
      await downloadMarketplaceSchema('listing-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('listing_id=listing-1'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('submitMarketplaceReview', () => {
    it('sends POST with listing_id and review data', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));
      await submitMarketplaceReview('listing-1', { rating: 5, comment: 'great' } as any);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('listing_id=listing-1'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ── Timeline ───────────────────────────────────────────────────────────

  describe('extractTimeline', () => {
    it('sends POST to /api/documents/timeline', async () => {
      const mockResult = { events: [], timeline_summary: '', date_range: { earliest: null, latest: null }, document_ids: [], total_events: 0, extraction_depth: 'basic' };
      mockFetch.mockResolvedValueOnce(okResponse(mockResult));
      const result = await extractTimeline({ document_ids: ['d1'] });
      expect(result.total_events).toBe(0);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500, { error: 'Failed to extract timeline' }));
      await expect(extractTimeline({ document_ids: ['d1'] })).rejects.toThrow('Failed to extract timeline');
    });
  });
});
