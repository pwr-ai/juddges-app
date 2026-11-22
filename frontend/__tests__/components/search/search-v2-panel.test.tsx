/**
 * Full-corpus search panel states (#867): loading, results, filters, the two
 * kinds of 503 ("not configured" must not read like an outage and vice
 * versa), and an expired session (login redirect) as a clear message instead
 * of a crashed results list.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SearchV2Panel } from '@/components/search/v2/SearchV2Panel';

function renderPanel(props: Partial<React.ComponentProps<typeof SearchV2Panel>> = {}) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SearchV2Panel initialQuery="zachowek" {...props} />
    </QueryClientProvider>
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: false,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as Response;
}

function mockFetch(response: Response) {
  global.fetch = jest.fn(async () => response) as typeof global.fetch;
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /szukaj/i }));
}

const ONE_RESULT = {
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
};

describe('SearchV2Panel', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('has no test badge or test wording', () => {
    renderPanel();
    expect(screen.queryByText(/test/i)).not.toBeInTheDocument();
  });

  it('shows a loading state, then the results, and reports the query', async () => {
    let resolve: (value: Response) => void = () => {};
    global.fetch = jest.fn(
      () => new Promise<Response>((r) => (resolve = r))
    ) as typeof global.fetch;
    const onSubmitQuery = jest.fn();
    renderPanel({ onSubmitQuery });

    submit();
    expect(await screen.findByText(/Przeszukuję pełną bazę/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search/v2',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ query: 'zachowek' }) })
    );
    expect(onSubmitQuery).toHaveBeenCalledWith('zachowek');

    resolve(jsonResponse(200, ONE_RESULT));

    expect(await screen.findByText('II K 2/21')).toBeInTheDocument();
    expect(screen.queryByText(/Przeszukuję pełną bazę/)).not.toBeInTheDocument();
  });

  it('sends court type and date range filters', async () => {
    mockFetch(jsonResponse(200, ONE_RESULT));
    renderPanel();

    fireEvent.change(screen.getByLabelText('Rodzaj sądu'), {
      target: { value: 'administrative_court' },
    });
    fireEvent.change(screen.getByLabelText('Data od'), { target: { value: '2015-01-01' } });
    fireEvent.change(screen.getByLabelText('Data do'), { target: { value: '2015-12-31' } });
    submit();

    await screen.findByText('II K 2/21');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      query: 'zachowek',
      court_type: ['administrative_court'],
      date_from: '2015-01-01',
      date_to: '2015-12-31',
    });
  });

  it('says "nieskonfigurowana" when the backend has no v2 env', async () => {
    mockFetch(jsonResponse(503, { error: 'search v2 not configured' }));
    renderPanel();

    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Pełna baza nieskonfigurowana');
  });

  it('reports an outage as unavailable, not as unconfigured', async () => {
    mockFetch(jsonResponse(503, { error: 'search v2 unavailable' }));
    renderPanel();

    submit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Pełna baza niedostępna');
    expect(alert).not.toHaveTextContent('nieskonfigurowana');
  });

  it('turns an expired session (followed login redirect, HTML) into a message', async () => {
    mockFetch({
      ok: true,
      status: 200,
      redirected: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    } as unknown as Response);
    renderPanel();

    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sesja wygasła');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows other errors verbatim', async () => {
    mockFetch(jsonResponse(429, { error: 'Too many requests' }));
    renderPanel();

    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
  });
});
