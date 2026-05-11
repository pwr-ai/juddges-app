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

  it('renders autocomplete suggestions and selects one', async () => {
    const user = userEvent.setup();
    const onSelectAutocompleteSuggestion = jest.fn();

    render(
      <SearchForm
        {...defaultProps}
        query="con"
        autocompleteSuggestions={[
          {
            id: '1',
            title: 'Contract liability',
            summary: 'Example summary',
            caseNumber: 'I ACa 1/24',
            courtName: 'Court of Appeal',
            decisionDate: '2024-01-15',
          },
        ]}
        onSelectAutocompleteSuggestion={onSelectAutocompleteSuggestion}
      />
    );

    await user.click(screen.getByRole('option', { name: /Use suggestion: Contract liability/i }));

    expect(onSelectAutocompleteSuggestion).toHaveBeenCalledWith('Contract liability');
  });

  describe('language segmented control', () => {
    it('renders three options labelled All, Polish, English (UK)', () => {
      render(<SearchForm {...defaultProps} />);

      const group = screen.getByRole('radiogroup', { name: /filter by language/i });
      expect(group).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Polish' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'English (UK)' })).toBeInTheDocument();
    });

    it('marks All active when both pl and uk are selected', () => {
      render(<SearchForm {...defaultProps} selectedLanguages={new Set(['pl', 'uk'])} />);

      expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'Polish' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByRole('radio', { name: 'English (UK)' })).toHaveAttribute('aria-checked', 'false');
    });

    it('marks Polish active when only pl is selected', () => {
      render(<SearchForm {...defaultProps} selectedLanguages={new Set(['pl'])} />);

      expect(screen.getByRole('radio', { name: 'Polish' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByRole('radio', { name: 'English (UK)' })).toHaveAttribute('aria-checked', 'false');
    });

    it('marks English (UK) active when only uk is selected', () => {
      render(<SearchForm {...defaultProps} selectedLanguages={new Set(['uk'])} />);

      expect(screen.getByRole('radio', { name: 'English (UK)' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByRole('radio', { name: 'Polish' })).toHaveAttribute('aria-checked', 'false');
    });

    it('falls back to All when selectedLanguages is empty', () => {
      render(<SearchForm {...defaultProps} selectedLanguages={new Set()} />);

      expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    });

    it('selecting Polish calls setSelectedLanguages with a pl-only Set', async () => {
      const user = userEvent.setup();
      const setSelectedLanguages = jest.fn();

      render(
        <SearchForm
          {...defaultProps}
          selectedLanguages={new Set(['pl', 'uk'])}
          setSelectedLanguages={setSelectedLanguages}
        />
      );

      await user.click(screen.getByRole('radio', { name: 'Polish' }));

      expect(setSelectedLanguages).toHaveBeenCalledTimes(1);
      const arg = setSelectedLanguages.mock.calls[0][0] as Set<string>;
      expect(Array.from(arg).sort()).toEqual(['pl']);
    });

    it('selecting All calls setSelectedLanguages with both pl and uk', async () => {
      const user = userEvent.setup();
      const setSelectedLanguages = jest.fn();

      render(
        <SearchForm
          {...defaultProps}
          selectedLanguages={new Set(['pl'])}
          setSelectedLanguages={setSelectedLanguages}
        />
      );

      await user.click(screen.getByRole('radio', { name: 'All' }));

      expect(setSelectedLanguages).toHaveBeenCalledTimes(1);
      const arg = setSelectedLanguages.mock.calls[0][0] as Set<string>;
      expect(Array.from(arg).sort()).toEqual(['pl', 'uk']);
    });
  });
});
