import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';

import { useAdminStats } from '@/lib/api/admin';

const fetchMock = jest.fn();
global.fetch = fetchMock;

function wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('admin API client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          total_users: 1,
          total_documents: 2,
          searches_today: 3,
          active_sessions_24h: 4,
          documents_added_this_week: 5,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });

  it('uses the same-origin BFF without exposing backend credentials', async () => {
    const { result } = renderHook(() => useAdminStats(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/stats', {
      headers: { Accept: 'application/json' },
    });
    const options = fetchMock.mock.calls[0][1];
    expect(options.headers).not.toHaveProperty('Authorization');
    expect(options.headers).not.toHaveProperty('X-API-Key');
  });
});
