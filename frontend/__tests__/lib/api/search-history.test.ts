import { getUserSearchHistory, clearUserSearchHistory } from '@/lib/api/search-history';

describe('search-history API client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('getUserSearchHistory', () => {
    it('fetches search history for authenticated user', async () => {
      const mockItems = [
        {
          query: 'tax evasion',
          hit_count: 12,
          topic_hits_count: 3,
          processing_ms: 45,
          filters: "language = 'pl'",
          created_at: '2026-08-13T10:00:00Z',
        },
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockItems,
      } as Response);

      const result = await getUserSearchHistory(30, 50);
      expect(result).toEqual(mockItems);
      expect(global.fetch).toHaveBeenCalledWith('/api/search/analytics/history?days=30&limit=50');
    });

    it('returns empty array when user is unauthenticated (401)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      const result = await getUserSearchHistory();
      expect(result).toEqual([]);
    });

    it('throws error when server responds with 500', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(getUserSearchHistory()).rejects.toThrow('Failed to fetch search history: Internal Server Error');
    });
  });

  describe('clearUserSearchHistory', () => {
    it('sends DELETE request and returns true', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      const result = await clearUserSearchHistory();
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/search/analytics/history', {
        method: 'DELETE',
      });
    });

    it('throws error on failure response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(clearUserSearchHistory()).rejects.toThrow('Failed to clear search history');
    });
  });
});
