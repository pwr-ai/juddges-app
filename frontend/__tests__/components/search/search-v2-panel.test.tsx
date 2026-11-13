/**
 * v2 (Weaviate, test) engine panel states (issue #867): loading, results,
 * and the two kinds of 503 — "not configured" (env unset) must not read like
 * an outage, and an outage must not read like a config problem.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SearchV2Panel } from '@/components/search/v2/SearchV2Panel';

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SearchV2Panel initialQuery="zachowek" />
    </QueryClientProvider>
  );
}

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      }) as Response
  ) as typeof global.fetch;
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /search/i }));
}

describe('SearchV2Panel', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows a test badge', () => {
    mockFetch(200, { results: [], took_ms: 1, engine: 'weaviate-v2' });
    renderPanel();
    expect(screen.getByText('TEST')).toBeInTheDocument();
  });

  it('shows a loading state, then the results', async () => {
    let resolve: (value: Response) => void = () => {};
    global.fetch = jest.fn(
      () => new Promise<Response>((r) => (resolve = r))
    ) as typeof global.fetch;
    renderPanel();

    submit();
    expect(await screen.findByText(/Searching the v2 corpus/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search/v2',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ query: 'zachowek' }) })
    );

    resolve({
      ok: true,
      status: 200,
      json: async () => ({
        engine: 'weaviate-v2',
        took_ms: 7,
        results: [
          {
            judgment_id: 'v2-only',
            signature: 'II K 2/21',
            court_name: 'Sąd Rejonowy w Bolesławcu',
            decision_date: '2021-05-06',
            thesis: null,
            score: 0.5,
            best_chunk: { text: 'Inny fragment.', chunk_idx: 0 },
            source_id: 'v2-only',
            supabase_id: null,
          },
        ],
      }),
    } as Response);

    expect(await screen.findByText('II K 2/21')).toBeInTheDocument();
    expect(screen.queryByText(/Searching the v2 corpus/)).not.toBeInTheDocument();
  });

  it('says "v2 nieskonfigurowane" when the backend has no v2 env', async () => {
    mockFetch(503, { error: 'search v2 not configured' });
    renderPanel();

    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('v2 nieskonfigurowane');
  });

  it('reports an outage as unavailable, not as unconfigured', async () => {
    mockFetch(503, { error: 'search v2 unavailable' });
    renderPanel();

    submit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('v2 niedostępne');
    expect(alert).not.toHaveTextContent('nieskonfigurowane');
  });

  it('shows other errors verbatim', async () => {
    mockFetch(401, { error: 'Authentication required' });
    renderPanel();

    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication required');
  });
});
