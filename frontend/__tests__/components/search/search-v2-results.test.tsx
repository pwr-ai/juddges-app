/**
 * v2 (Weaviate, test) engine results list (issue #867).
 *
 * A v2 hit links to the judgment page only when the backend matched it to a
 * row in the app database (`supabase_id`); otherwise it says the ruling is
 * outside the app corpus instead of rendering a dead link.
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

describe('SearchV2Results', () => {
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

  it('links to the judgment page only when supabase_id is set', () => {
    render(<SearchV2Results response={RESPONSE} />);
    const [inDb, v2Only] = screen.getAllByRole('listitem');

    expect(within(inDb).getByRole('link', { name: /I C 1\/20/ })).toHaveAttribute(
      'href',
      '/documents/11111111-1111-4111-a111-111111111111'
    );
    expect(within(inDb).queryByText(/spoza bazy aplikacji/)).not.toBeInTheDocument();

    expect(within(v2Only).queryByRole('link')).not.toBeInTheDocument();
    expect(within(v2Only).getByText('spoza bazy aplikacji (tylko v2)')).toBeInTheDocument();
  });

  it('says so when nothing matched', () => {
    render(<SearchV2Results response={{ ...RESPONSE, results: [] }} />);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText(/No results/i)).toBeInTheDocument();
  });
});
