/**
 * React hook for fetching and polling system status
 */

import { useEffect, useState, useCallback } from 'react';
import { DetailedStatusResponse } from '@/types/health';
import { getDetailedStatus } from '@/lib/api/health';

interface UseSystemStatusOptions {
  pollInterval?: number; // in milliseconds
  enabled?: boolean;
}

interface UseSystemStatusReturn {
  status: DetailedStatusResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useSystemStatus(
  options: UseSystemStatusOptions = {}
): UseSystemStatusReturn {
  const { pollInterval = 30000, enabled = true } = options; // Default: 30 seconds

  const [status, setStatus] = useState<DetailedStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDetailedStatus();
      setStatus(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch status');
      setError(error);
      console.error('Failed to fetch system status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchStatus();
    }
  }, [enabled, fetchStatus]);

  // Set up polling
  useEffect(() => {
    if (!enabled || !pollInterval) {
      return;
    }

    const interval = setInterval(() => {
      fetchStatus();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [enabled, pollInterval, fetchStatus]);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
  };
}
