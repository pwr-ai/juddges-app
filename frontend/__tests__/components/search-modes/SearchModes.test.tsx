/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { LanguageProvider } from '@/contexts/LanguageContext';
import {
  SEARCH_MODES,
  SearchModesOverview,
  searchModeHref,
} from '@/components/search-modes/SearchModes';

describe('SearchModesOverview', () => {
  it('names the modes with the same labels as the /search switch (EN)', () => {
    render(<SearchModesOverview />);
    expect(
      screen.getByRole('heading', { name: 'Polish native · full corpus (~2.7M judgments)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Comparative · PL + EN across jurisdictions (with extractions)',
      })
    ).toBeInTheDocument();
  });

  it('uses the Polish labels under the PL locale', () => {
    render(
      <LanguageProvider initialLocale="pl">
        <SearchModesOverview />
      </LanguageProvider>
    );
    expect(
      screen.getByRole('heading', { name: 'Polski natywny · pełna baza (~2,7 mln orzeczeń)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Porównawczy · PL + EN, jurysdykcje (z ekstrakcjami)' })
    ).toBeInTheDocument();
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
    const curated = screen.getByRole('region', { name: /^Comparative/ });
    expect(within(curated).getByText(/12,345 · Poland/)).toBeInTheDocument();
  });

  it('keeps mode ids aligned with the search engine parameter', () => {
    expect(SEARCH_MODES.map((m) => m.id)).toEqual(['full', 'curated']);
    expect(searchModeHref('full', 'kara umowna')).toBe('/search?engine=full&q=kara%20umowna');
  });
});
