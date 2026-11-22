/**
 * Full-corpus results list (#867). Every hit opens somewhere: the curated
 * judgment page when the backend matched it to a `judgments` row
 * (`supabase_id`), otherwise the full-corpus page `/judgments/full/<id>`.
 */
import { render, screen, within } from '@testing-library/react';

import { SearchV2Results } from '@/components/search/v2/SearchV2Results';
import type { SearchV2Response } from '@/lib/api/search-v2';

const RESPONSE: SearchV2Response = {
  engine: 'weaviate-v2',
  took_ms: 42,
  results: [
    {
      judgment_id: 'in-db',
      signature: 'I C 1/20',
      court_name: 'Sąd Okręgowy w Warszawie',
      decision_date: '2020-01-02',
      thesis: 'Teza orzeczenia o zachowku.',
      score: 0.8734,
      best_chunk: { text: 'Fragment uzasadnienia o zachowku.', chunk_idx: 3 },
      source_id: 'in-db',
      supabase_id: '11111111-1111-4111-a111-111111111111',
    },
    {
      judgment_id: '/doc/39FBE5DB09',
      signature: 'II FSK 2/21',
      court_name: 'Naczelny Sąd Administracyjny',
      decision_date: '2021-05-06',
      thesis: null,
      score: 0.5,
      best_chunk: { text: 'Inny fragment.', chunk_idx: 0 },
      source_id: '/doc/39FBE5DB09',
      supabase_id: null,
    },
  ],
};

describe('SearchV2Results', () => {
  it('names the engine in the results header', () => {
    render(<SearchV2Results response={RESPONSE} />);
    expect(screen.getByText('Results from the full Polish corpus (Weaviate)')).toBeInTheDocument();
    expect(screen.getByText(/2 orzeczeń · 42 ms/)).toBeInTheDocument();
  });

  it('renders each judgment with signature, court, date, score and excerpt', () => {
    render(<SearchV2Results response={RESPONSE} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);

    const first = within(items[0]);
    expect(first.getByText('I C 1/20')).toBeInTheDocument();
    expect(first.getByText('Sąd Okręgowy w Warszawie')).toBeInTheDocument();
    expect(first.getByText('2020-01-02')).toBeInTheDocument();
    expect(first.getByText('0.873')).toBeInTheDocument();
    expect(first.getByText('Fragment uzasadnienia o zachowku.')).toBeInTheDocument();
    expect(first.getByText('Teza orzeczenia o zachowku.')).toBeInTheDocument();
  });

  it('links to the curated page when matched, else to the full-corpus page', () => {
    render(<SearchV2Results response={RESPONSE} />);
    const [inDb, fullOnly] = screen.getAllByRole('listitem');

    expect(within(inDb).getByRole('link', { name: /I C 1\/20/ })).toHaveAttribute(
      'href',
      '/documents/11111111-1111-4111-a111-111111111111'
    );
    expect(within(inDb).getByText('także w bazie porównawczej')).toBeInTheDocument();

    expect(within(fullOnly).getByRole('link', { name: /II FSK 2\/21/ })).toHaveAttribute(
      'href',
      '/judgments/full/%2Fdoc%2F39FBE5DB09'
    );
    expect(within(fullOnly).getByText('tylko w pełnej bazie (bez ekstrakcji)')).toBeInTheDocument();
  });

  it('says so when nothing matched', () => {
    render(<SearchV2Results response={{ ...RESPONSE, results: [] }} />);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText(/Brak wyników w pełnej bazie/)).toBeInTheDocument();
  });
});
