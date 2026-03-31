/**
 * Tests for the emailAlertStore Zustand store.
 *
 * Exercises: fetchAlerts, createAlert, updateAlert, deleteAlert, toggleAlert, fetchLogs.
 */

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

import { useEmailAlertStore } from '@/lib/store/emailAlertStore';
import { act } from '@testing-library/react';

// Factory helper
function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    user_id: 'u-1',
    name: 'Test Alert',
    query: 'contract dispute',
    alert_type: 'search',
    is_active: true,
    frequency: 'daily',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function okResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status, json: async () => ({ error: 'fail' }) } as Response;
}

describe('emailAlertStore', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    useEmailAlertStore.setState({
      alerts: [],
      logs: [],
      isLoading: false,
      isLoadingLogs: false,
      error: null,
    });
  });

  // ── fetchAlerts ────────────────────────────────────────────────────────

  describe('fetchAlerts', () => {
    it('fetches and stores alerts', async () => {
      const alerts = [makeAlert({ id: 'a1' }), makeAlert({ id: 'a2' })];
      mockFetch.mockResolvedValueOnce(okResponse(alerts));

      await act(async () => {
        await useEmailAlertStore.getState().fetchAlerts();
      });

      expect(useEmailAlertStore.getState().alerts).toHaveLength(2);
      expect(useEmailAlertStore.getState().isLoading).toBe(false);
    });

    it('passes type filter when provided', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([]));
      await act(async () => {
        await useEmailAlertStore.getState().fetchAlerts('search');
      });
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('type=search'));
    });

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));
      await act(async () => {
        await useEmailAlertStore.getState().fetchAlerts();
      });
      expect(useEmailAlertStore.getState().error).toBe('Failed to load email alerts');
    });
  });

  // ── createAlert ────────────────────────────────────────────────────────

  describe('createAlert', () => {
    it('creates alert and prepends to list', async () => {
      const created = makeAlert({ id: 'new-1' });
      mockFetch.mockResolvedValueOnce(okResponse(created));

      let result: unknown = null;
      await act(async () => {
        result = await useEmailAlertStore.getState().createAlert({ name: 'New', query: 'test' } as any);
      });

      expect(result).not.toBeNull();
      expect(useEmailAlertStore.getState().alerts[0].id).toBe('new-1');
    });

    it('returns null on failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));
      let result: unknown = 'initial';
      await act(async () => {
        result = await useEmailAlertStore.getState().createAlert({} as any);
      });
      expect(result).toBeNull();
    });
  });

  // ── updateAlert ────────────────────────────────────────────────────────

  describe('updateAlert', () => {
    it('updates existing alert in list', async () => {
      useEmailAlertStore.setState({ alerts: [makeAlert({ id: 'a1', name: 'Old' })] as any[] });
      const updated = makeAlert({ id: 'a1', name: 'Updated' });
      mockFetch.mockResolvedValueOnce(okResponse(updated));

      await act(async () => {
        await useEmailAlertStore.getState().updateAlert('a1', { name: 'Updated' } as any);
      });

      expect(useEmailAlertStore.getState().alerts[0].name).toBe('Updated');
    });
  });

  // ── deleteAlert ────────────────────────────────────────────────────────

  describe('deleteAlert', () => {
    it('removes alert from list', async () => {
      useEmailAlertStore.setState({ alerts: [makeAlert({ id: 'a1' }), makeAlert({ id: 'a2' })] as any[] });
      mockFetch.mockResolvedValueOnce(okResponse({}));

      const result = await act(async () => {
        return await useEmailAlertStore.getState().deleteAlert('a1');
      });

      expect(result).toBe(true);
      expect(useEmailAlertStore.getState().alerts).toHaveLength(1);
    });
  });

  // ── toggleAlert ────────────────────────────────────────────────────────

  describe('toggleAlert', () => {
    it('optimistically toggles is_active', async () => {
      useEmailAlertStore.setState({ alerts: [makeAlert({ id: 'a1', is_active: true })] as any[] });
      mockFetch.mockResolvedValueOnce(okResponse({}));

      await act(async () => {
        await useEmailAlertStore.getState().toggleAlert('a1', false);
      });

      expect(useEmailAlertStore.getState().alerts[0].is_active).toBe(false);
    });

    it('reverts on failure', async () => {
      useEmailAlertStore.setState({ alerts: [makeAlert({ id: 'a1', is_active: true })] as any[] });
      mockFetch.mockRejectedValueOnce(new Error('network'));

      await act(async () => {
        await useEmailAlertStore.getState().toggleAlert('a1', false);
      });

      // Should revert back to true
      expect(useEmailAlertStore.getState().alerts[0].is_active).toBe(true);
    });
  });

  // ── fetchLogs ──────────────────────────────────────────────────────────

  describe('fetchLogs', () => {
    it('fetches logs and stores them', async () => {
      const logs = [{ id: 'l1', subscription_id: 'a1', sent_at: '2025-01-01' }];
      mockFetch.mockResolvedValueOnce(okResponse(logs));

      await act(async () => {
        await useEmailAlertStore.getState().fetchLogs('a1');
      });

      expect(useEmailAlertStore.getState().logs).toHaveLength(1);
      expect(useEmailAlertStore.getState().isLoadingLogs).toBe(false);
    });

    it('handles log fetch failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      await act(async () => {
        await useEmailAlertStore.getState().fetchLogs();
      });

      expect(useEmailAlertStore.getState().isLoadingLogs).toBe(false);
    });
  });
});
