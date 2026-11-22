/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
  SEARCH_MODES,
  SearchModesOverview,
  searchModeHref,
} from '@/components/search-modes/SearchModes';

describe('SearchModesOverview', () => {
  it('shows the Polish-native and the comparative mode', () => {
    render(<SearchModesOverview />);
    expect(screen.getByRole('heading', { name: 'All Polish judgments' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Curated Polish & English set' })
    ).toBeInTheDocument();
    expect(screen.getByText(/~2\.7 million judgments/)).toBeInTheDocument();
  });

  it('links each mode to /search with its engine', () => {
    render(<SearchModesOverview />);
    expect(screen.getByRole('link', { name: /Search the full corpus/ })).toHaveAttribute(
      'href',
      '/search?engine=full'
    );
    expect(screen.getByRole('link', { name: /Compare jurisdictions/ })).toHaveAttribute(
      'href',
      '/search?engine=curated'
    );
  });

  it('shows the live size of the curated set when given', () => {
    render(<SearchModesOverview curatedCount={12345} />);
    const curated = screen.getByRole('region', { name: 'Curated Polish & English set' });
    expect(within(curated).getByText(/12,345 judgments/)).toBeInTheDocument();
  });

  it('keeps mode ids aligned with the search engine parameter', () => {
    expect(SEARCH_MODES.map((m) => m.id)).toEqual(['full', 'curated']);
    expect(searchModeHref('full', 'kara umowna')).toBe('/search?engine=full&q=kara%20umowna');
  });
});
