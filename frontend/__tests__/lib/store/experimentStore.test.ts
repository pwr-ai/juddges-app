/**
 * Tests for the experimentStore Zustand store.
 *
 * Exercises: fetchExperiments, fetchActiveExperiments, fetchExperimentResults,
 * createExperiment, updateExperimentStatus, assignVariant, trackEvent,
 * setSelectedExperiment, getVariantForExperiment, clearError.
 */

// Provide type stubs for the missing @/types/experiments module
jest.mock('../../../types/experiments', () => ({}), { virtual: true });

// Mock fetch globally before any imports that use it
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

import { useExperimentStore } from '@/lib/store/experimentStore';
import { act } from '@testing-library/react';

// Factory helpers
function makeExperiment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    name: 'Test Experiment',
    description: 'A/B test for search',
    status: 'active',
    variants: [
      { id: 'var-a', name: 'Control', weight: 50 },
      { id: 'var-b', name: 'Variant B', weight: 50 },
    ],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeResults(overrides: Record<string, unknown> = {}) {
  return {
    experiment_id: 'exp-1',
    total_participants: 100,
    variants: [
      { id: 'var-a', name: 'Control', participants: 50, conversions: 10 },
      { id: 'var-b', name: 'Variant B', participants: 50, conversions: 15 },
    ],
    ...overrides,
  };
}

function okResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status, json: async () => ({ error: 'fail' }) } as Response;
}

describe('experimentStore', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Reset store to initial state
    useExperimentStore.setState({
      experiments: [],
      activeExperiments: [],
      assignments: {},
      selectedExperiment: null,
      results: null,
      isLoading: false,
      error: null,
    });
  });

  // -- Initial state ----------------------------------------------------------

  it('has correct initial state', () => {
    const state = useExperimentStore.getState();
    expect(state.experiments).toEqual([]);
    expect(state.activeExperiments).toEqual([]);
    expect(state.assignments).toEqual({});
    expect(state.selectedExperiment).toBeNull();
    expect(state.results).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  // -- fetchExperiments -------------------------------------------------------

  describe('fetchExperiments', () => {
    it('fetches experiments successfully', async () => {
      const experiments = [makeExperiment(), makeExperiment({ id: 'exp-2', name: 'Exp 2' })];
      mockFetch.mockResolvedValueOnce(okResponse({ experiments }));

      await act(async () => {
        await useExperimentStore.getState().fetchExperiments();
      });

      const state = useExperimentStore.getState();
      expect(state.experiments).toHaveLength(2);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('passes status filter as query param', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ experiments: [] }));

      await act(async () => {
        await useExperimentStore.getState().fetchExperiments('active');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/experiments?status=active');
    });

    it('handles missing experiments array in response', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));

      await act(async () => {
        await useExperimentStore.getState().fetchExperiments();
      });

      expect(useExperimentStore.getState().experiments).toEqual([]);
    });

    it('sets error on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      await act(async () => {
        await useExperimentStore.getState().fetchExperiments();
      });

      const state = useExperimentStore.getState();
      expect(state.error).toBe('Failed to fetch experiments');
      expect(state.isLoading).toBe(false);
    });

    it('sets error on network exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      await act(async () => {
        await useExperimentStore.getState().fetchExperiments();
      });

      expect(useExperimentStore.getState().error).toBe('Network down');
    });

    it('sets isLoading to true during fetch', async () => {
      let loadingDuringFetch = false;
      mockFetch.mockImplementationOnce(() => {
        loadingDuringFetch = useExperimentStore.getState().isLoading;
        return Promise.resolve(okResponse({ experiments: [] }));
      });

      await act(async () => {
        await useExperimentStore.getState().fetchExperiments();
      });

      expect(loadingDuringFetch).toBe(true);
      expect(useExperimentStore.getState().isLoading).toBe(false);
    });
  });

  // -- fetchActiveExperiments -------------------------------------------------

  describe('fetchActiveExperiments', () => {
    it('fetches active experiments and assignments', async () => {
      const experiments = [makeExperiment()];
      const assignments = { 'exp-1': 'var-a' };
      mockFetch.mockResolvedValueOnce(okResponse({ experiments, assignments }));

      await act(async () => {
        await useExperimentStore.getState().fetchActiveExperiments();
      });

      const state = useExperimentStore.getState();
      expect(state.activeExperiments).toHaveLength(1);
      expect(state.assignments).toEqual({ 'exp-1': 'var-a' });
    });

    it('handles missing data in response gracefully', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));

      await act(async () => {
        await useExperimentStore.getState().fetchActiveExperiments();
      });

      const state = useExperimentStore.getState();
      expect(state.activeExperiments).toEqual([]);
      expect(state.assignments).toEqual({});
    });

    it('does not set error on failure (silent fail)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await useExperimentStore.getState().fetchActiveExperiments();
      });

      // fetchActiveExperiments silently catches errors (no error state set)
      expect(useExperimentStore.getState().error).toBeNull();
    });
  });

  // -- fetchExperimentResults -------------------------------------------------

  describe('fetchExperimentResults', () => {
    it('fetches results for an experiment', async () => {
      const results = makeResults();
      mockFetch.mockResolvedValueOnce(okResponse(results));

      await act(async () => {
        await useExperimentStore.getState().fetchExperimentResults('exp-1');
      });

      const state = useExperimentStore.getState();
      expect(state.results).toEqual(results);
      expect(state.isLoading).toBe(false);
    });

    it('calls correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce(okResponse(makeResults()));

      await act(async () => {
        await useExperimentStore.getState().fetchExperimentResults('exp-42');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/experiments/exp-42/results');
    });

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404));

      await act(async () => {
        await useExperimentStore.getState().fetchExperimentResults('exp-1');
      });

      expect(useExperimentStore.getState().error).toBe('Failed to fetch experiment results');
    });
  });

  // -- createExperiment -------------------------------------------------------

  describe('createExperiment', () => {
    it('creates experiment and prepends to list', async () => {
      const existingExp = makeExperiment({ id: 'exp-existing' });
      useExperimentStore.setState({ experiments: [existingExp as any] });

      const newExp = makeExperiment({ id: 'exp-new', name: 'New' });
      mockFetch.mockResolvedValueOnce(okResponse(newExp));

      let result: unknown;
      await act(async () => {
        result = await useExperimentStore.getState().createExperiment({
          name: 'New',
          description: 'Test',
          variants: [],
        } as any);
      });

      const state = useExperimentStore.getState();
      expect(state.experiments).toHaveLength(2);
      expect(state.experiments[0].id).toBe('exp-new');
      expect(result).toEqual(newExp);
    });

    it('sends POST with correct body', async () => {
      const input = { name: 'Exp', description: 'Desc', variants: [] };
      mockFetch.mockResolvedValueOnce(okResponse(makeExperiment()));

      await act(async () => {
        await useExperimentStore.getState().createExperiment(input as any);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    });

    it('returns null on failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(400));

      let result: unknown;
      await act(async () => {
        result = await useExperimentStore.getState().createExperiment({} as any);
      });

      expect(result).toBeNull();
      expect(useExperimentStore.getState().error).toBe('Failed to create experiment');
    });
  });

  // -- updateExperimentStatus -------------------------------------------------

  describe('updateExperimentStatus', () => {
    it('updates experiment status in the list', async () => {
      const exp = makeExperiment({ status: 'active' });
      useExperimentStore.setState({ experiments: [exp as any] });

      mockFetch.mockResolvedValueOnce(okResponse({}));

      await act(async () => {
        await useExperimentStore.getState().updateExperimentStatus('exp-1', 'paused');
      });

      expect(useExperimentStore.getState().experiments[0].status).toBe('paused');
    });

    it('sends PATCH to correct endpoint', async () => {
      useExperimentStore.setState({ experiments: [makeExperiment() as any] });
      mockFetch.mockResolvedValueOnce(okResponse({}));

      await act(async () => {
        await useExperimentStore.getState().updateExperimentStatus('exp-1', 'completed');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/experiments?id=exp-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
    });

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      await act(async () => {
        await useExperimentStore.getState().updateExperimentStatus('exp-1', 'paused');
      });

      expect(useExperimentStore.getState().error).toBe('Failed to update experiment');
    });
  });

  // -- assignVariant ----------------------------------------------------------

  describe('assignVariant', () => {
    it('records assignment in state', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));

      await act(async () => {
        await useExperimentStore.getState().assignVariant('exp-1', 'var-b');
      });

      expect(useExperimentStore.getState().assignments).toEqual({ 'exp-1': 'var-b' });
    });

    it('sends POST with correct body', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));

      await act(async () => {
        await useExperimentStore.getState().assignVariant('exp-1', 'var-a');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/experiments?action=assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiment_id: 'exp-1', variant_id: 'var-a' }),
      });
    });

    it('does not crash on network error (silent fail)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      await act(async () => {
        await useExperimentStore.getState().assignVariant('exp-1', 'var-a');
      });

      // assignVariant catches silently
      expect(useExperimentStore.getState().error).toBeNull();
    });
  });

  // -- trackEvent -------------------------------------------------------------

  describe('trackEvent', () => {
    it('sends POST with all event data', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));

      await act(async () => {
        await useExperimentStore.getState().trackEvent(
          'exp-1', 'var-a', 'click', 1.5, { page: 'home' }
        );
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/experiments?action=track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experiment_id: 'exp-1',
          variant_id: 'var-a',
          event_type: 'click',
          event_value: 1.5,
          metadata: { page: 'home' },
        }),
      });
    });

    it('handles optional parameters', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));

      await act(async () => {
        await useExperimentStore.getState().trackEvent('exp-1', 'var-a', 'view');
      });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(body.event_value).toBeUndefined();
      expect(body.metadata).toBeUndefined();
    });

    it('does not crash on failure (silent fail)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Down'));

      await act(async () => {
        await useExperimentStore.getState().trackEvent('exp-1', 'var-a', 'click');
      });

      expect(useExperimentStore.getState().error).toBeNull();
    });
  });

  // -- setSelectedExperiment --------------------------------------------------

  describe('setSelectedExperiment', () => {
    it('sets selected experiment', () => {
      const exp = makeExperiment();
      useExperimentStore.getState().setSelectedExperiment(exp as any);
      expect(useExperimentStore.getState().selectedExperiment).toEqual(exp);
    });

    it('clears selected experiment with null', () => {
      useExperimentStore.setState({ selectedExperiment: makeExperiment() as any });
      useExperimentStore.getState().setSelectedExperiment(null);
      expect(useExperimentStore.getState().selectedExperiment).toBeNull();
    });
  });

  // -- getVariantForExperiment ------------------------------------------------

  describe('getVariantForExperiment', () => {
    it('returns variant for assigned experiment', () => {
      useExperimentStore.setState({ assignments: { 'exp-1': 'var-a' } });
      expect(useExperimentStore.getState().getVariantForExperiment('exp-1')).toBe('var-a');
    });

    it('returns null for unassigned experiment', () => {
      expect(useExperimentStore.getState().getVariantForExperiment('exp-unknown')).toBeNull();
    });
  });

  // -- clearError -------------------------------------------------------------

  describe('clearError', () => {
    it('clears error state', () => {
      useExperimentStore.setState({ error: 'Something broke' });
      useExperimentStore.getState().clearError();
      expect(useExperimentStore.getState().error).toBeNull();
    });
  });
});
