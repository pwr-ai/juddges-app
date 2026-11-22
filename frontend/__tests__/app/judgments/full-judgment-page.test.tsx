/**
 * `/judgments/full/[judgmentId]` (#867): a full-corpus judgment that may have
 * no row in the app database, rendered from `GET /api/search/v2/judgments/:id`.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

import FullJudgmentPage from '@/app/judgments/full/[judgmentId]/page';
import { FullJudgmentView } from '@/app/judgments/full/[judgmentId]/FullJudgmentView';

const JUDGMENT = {
  judgment_id: '/doc/39FBE5DB09',
  signature: 'II FSK 1234/19',
  court_name: 'Naczelny Sąd Administracyjny',
  court_type: 'administrative_court',
  department_name: 'Izba Finansowa',
  judgment_type: 'Wyrok',
  decision_date: '2021-07-08',
  thesis: 'Teza o podatku od spadków.',
  full_text: 'UZASADNIENIE\nSąd zważył, co następuje.',
  full_text_truncated: false,
  keywords: ['podatek od spadków', 'zachowek'],
  judges: ['Anna Nowak', 'Jan Kowalski'],
  presiding_judge: 'Anna Nowak',
  legal_bases: ['art. 1 ust. 1 u.p.s.d.'],
  references: [],
  source: 'nsa',
  source_id: '/doc/39FBE5DB09',
  source_url: 'https://orzeczenia.nsa.gov.pl/doc/39FBE5DB09',
  language: 'pl',
  supabase_id: null,
  engine: 'weaviate-v2',
};

function renderView(judgmentId = JUDGMENT.judgment_id) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FullJudgmentView judgmentId={judgmentId} />
    </QueryClientProvider>
  );
}

function mockFetch(status: number, body: unknown, extra: Partial<Response> = {}) {
  global.fetch = jest.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        redirected: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => body,
        ...extra,
      }) as unknown as Response
  ) as typeof global.fetch;
}

describe('FullJudgmentView', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders signature, court, date, thesis, metadata and full text with the note', async () => {
    mockFetch(200, JUDGMENT);
    renderView();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'II FSK 1234/19' })
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search/v2/judgments/%2Fdoc%2F39FBE5DB09',
      expect.anything()
    );
    expect(
      screen.getByText('Naczelny Sąd Administracyjny · Izba Finansowa · 2021-07-08')
    ).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Orzeczenie z pełnej bazy (bez ekstrakcji).');
    expect(screen.getByText('Teza o podatku od spadków.')).toBeInTheDocument();
    expect(screen.getByText('Sąd administracyjny')).toBeInTheDocument();
    expect(screen.getByText('podatek od spadków, zachowek')).toBeInTheDocument();
    expect(screen.getByText('Jan Kowalski')).toBeInTheDocument();
    expect(screen.getByText('art. 1 ust. 1 u.p.s.d.')).toBeInTheDocument();
    expect(screen.getByText(/Sąd zważył, co następuje/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Centralna Baza Orzeczeń Sądów Administracyjnych' })
    ).toHaveAttribute('href', JUDGMENT.source_url);
    expect(screen.queryByRole('link', { name: /bazie porównawczej/ })).not.toBeInTheDocument();
  });

  it('links to the curated page when the ruling is also in the app database', async () => {
    mockFetch(200, { ...JUDGMENT, supabase_id: 'uuid-1' });
    renderView();
    expect(
      await screen.findByRole('link', { name: 'Otwórz w bazie porównawczej' })
    ).toHaveAttribute('href', '/documents/uuid-1');
  });

  it('says when the judgment is not in the corpus', async () => {
    mockFetch(404, { error: 'judgment not found' });
    renderView('missing');
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie znaleziono orzeczenia');
  });

  it('reports an expired session instead of rendering the login page', async () => {
    mockFetch(200, null, {
      redirected: true,
      headers: new Headers({ 'content-type': 'text/html' }),
    } as Partial<Response>);
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sesja wygasła');
  });
});

describe('FullJudgmentPage', () => {
  it('404s on a malformed id', async () => {
    await expect(
      FullJudgmentPage({ params: Promise.resolve({ judgmentId: 'a b' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('decodes an encoded NSA id', async () => {
    const element = await FullJudgmentPage({
      params: Promise.resolve({ judgmentId: '%2Fdoc%2F39FBE5DB09' }),
    });
    expect(element.props.judgmentId).toBe('/doc/39FBE5DB09');
  });
});
