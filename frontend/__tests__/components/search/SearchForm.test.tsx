/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchForm } from '@/lib/styles/components/search/SearchForm';

describe('SearchForm', () => {
  const defaultProps = {
    query: '',
    setQuery: jest.fn(),
    searchType: 'thinking' as const,
    setSearchType: jest.fn(),
    selectedLanguages: new Set(['pl']),
    toggleLanguage: jest.fn(),
    setSelectedLanguages: jest.fn(),
    isSearching: false,
    hasResults: false,
    hasError: false,
    hasPerformedSearch: false,
    onSearch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the current search placeholder and button', () => {
    render(<SearchForm {...defaultProps} />);

    expect(
      screen.getByPlaceholderText(/Liability for defective construction works in Poland/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('shows popular searches before the first search', () => {
    render(<SearchForm {...defaultProps} />);

    expect(screen.getByText(/Popular searches/i)).toBeInTheDocument();
    expect(screen.getByText('Kredyty frankowe')).toBeInTheDocument();
    expect(screen.getByText('Intellectual property')).toBeInTheDocument();
  });

  it('hides popular searches after search results are shown', () => {
    render(<SearchForm {...defaultProps} hasPerformedSearch={true} hasResults={true} />);

    expect(screen.queryByText(/Popular searches/i)).not.toBeInTheDocument();
  });

  it('updates the query via setQuery while typing', async () => {
    const user = userEvent.setup();
    const setQuery = jest.fn();

    render(<SearchForm {...defaultProps} setQuery={setQuery} />);

    await user.type(screen.getByRole('textbox'), 'tax');

    expect(setQuery.mock.calls.map(([value]) => value)).toEqual(['t', 'a', 'x']);
  });

  it('submits only non-empty queries', async () => {
    const user = userEvent.setup();
    const onSearch = jest.fn();

    const { rerender } = render(<SearchForm {...defaultProps} onSearch={onSearch} query="" />);

    await user.click(screen.getByRole('button', { name: /search/i }));
    expect(onSearch).not.toHaveBeenCalled();

    rerender(<SearchForm {...defaultProps} onSearch={onSearch} query="contract law" />);
    await user.click(screen.getByRole('button', { name: /search/i }));

    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('applies a popular-search preset', async () => {
    const user = userEvent.setup();
    const setQuery = jest.fn();
    const setSearchType = jest.fn();
    const setSelectedLanguages = jest.fn();

    render(
      <SearchForm
        {...defaultProps}
        setQuery={setQuery}
        setSearchType={setSearchType}
        setSelectedLanguages={setSelectedLanguages}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Intellectual property' }));

    expect(setQuery).toHaveBeenCalledWith('Intellectual property');
    expect(setSearchType).toHaveBeenCalledWith('thinking');
    expect(setSelectedLanguages).toHaveBeenCalledWith(new Set(['uk']));
  });

  it('renders topic suggestions with count + source labels and selects one', async () => {
    const user = userEvent.setup();
    const onSelectAutocompleteSuggestion = jest.fn();

    render(
      <SearchForm
        {...defaultProps}
        query="kred"
        autocompleteSuggestions={[
          {
            value: 'Kredyty frankowe',
            count: 142,
            sources: ['legal_topics', 'keywords'],
          },
          {
            value: 'art. 720 k.c.',
            count: 12,
            sources: ['cited_legislation'],
          },
        ]}
        onSelectAutocompleteSuggestion={onSelectAutocompleteSuggestion}
      />
    );

    expect(screen.getByText(/Topics & keywords/i)).toBeInTheDocument();
    expect(screen.getByText('Topic, Keyword')).toBeInTheDocument();
    expect(screen.getByText('Citation')).toBeInTheDocument();
    expect(screen.getByText('142 cases')).toBeInTheDocument();

    await user.click(
      screen.getByRole('option', { name: /Use suggestion: Kredyty frankowe \(142 cases\)/i })
    );

    expect(onSelectAutocompleteSuggestion).toHaveBeenCalledWith('Kredyty frankowe');
  });

});
