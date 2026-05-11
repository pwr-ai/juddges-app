/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchForm } from '@/lib/styles/components/search/SearchForm';
import type { TopicHit } from '@/hooks/useSearchAutocomplete';

// DOMPurify is a DOM-dependent library; return the input unchanged in tests.
jest.mock('dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (value: string) => value,
  },
}));

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

  // ---------------------------------------------------------------------------
  // TOPICS section
  // ---------------------------------------------------------------------------

  const sampleTopicHits: TopicHit[] = [
    {
      id: 'drug_trafficking',
      label_pl: 'Handel narkotykami',
      label_en: 'Drug trafficking',
      aliases_pl: ['narkomania'],
      aliases_en: ['narcotics'],
      category: 'drug_offences',
      doc_count: 247,
      jurisdictions: ['pl', 'uk'],
      _formatted: null,
    },
    {
      id: 'fraud',
      label_pl: 'Oszustwo',
      label_en: 'Fraud',
      aliases_pl: [],
      aliases_en: [],
      category: 'economic_offences',
      doc_count: 299,
      jurisdictions: ['pl', 'uk'],
      _formatted: null,
    },
  ];

  describe('TOPICS section', () => {
    it('renders TOPICS section eyebrow when topic hits are present', () => {
      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={sampleTopicHits}
        />
      );

      expect(screen.getByText(/topics/i)).toBeInTheDocument();
    });

    it('renders topic primary labels for en locale (label_en first)', () => {
      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={sampleTopicHits}
          currentLocale="en"
        />
      );

      expect(screen.getByText('Drug trafficking')).toBeInTheDocument();
      expect(screen.getByText('Fraud')).toBeInTheDocument();
    });

    it('renders topic primary labels for pl locale (label_pl first)', () => {
      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={sampleTopicHits}
          currentLocale="pl"
        />
      );

      expect(screen.getByText('Handel narkotykami')).toBeInTheDocument();
      expect(screen.getByText('Oszustwo')).toBeInTheDocument();
    });

    it('shows secondary label for pl locale (label_en as secondary)', () => {
      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={sampleTopicHits}
          currentLocale="pl"
        />
      );

      // secondary labels are the English ones
      expect(screen.getByText('Drug trafficking')).toBeInTheDocument();
    });

    it('renders doc_count for each topic', () => {
      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={sampleTopicHits}
          currentLocale="en"
        />
      );

      expect(screen.getByText('(247)')).toBeInTheDocument();
      expect(screen.getByText('(299)')).toBeInTheDocument();
    });

    it('hides TOPICS section when autocompleteTopicHits is empty', () => {
      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={[]}
          autocompleteSuggestions={[
            { id: '1', title: 'Contract liability' },
          ]}
        />
      );

      // TOPICS eyebrow must not appear
      expect(screen.queryByText(/^topics$/i)).not.toBeInTheDocument();
      // JUDGMENTS section should still render
      expect(screen.getByText(/judgments/i)).toBeInTheDocument();
    });

    it('hides JUDGMENTS section when autocompleteSuggestions is empty but topics present', () => {
      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={sampleTopicHits}
          autocompleteSuggestions={[]}
        />
      );

      expect(screen.getByText(/topics/i)).toBeInTheDocument();
      expect(screen.queryByText(/^judgments$/i)).not.toBeInTheDocument();
    });

    it('renders both TOPICS and JUDGMENTS when both have data', () => {
      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={sampleTopicHits}
          autocompleteSuggestions={[
            { id: '1', title: 'Contract liability' },
          ]}
        />
      );

      expect(screen.getByText(/topics/i)).toBeInTheDocument();
      expect(screen.getByText(/judgments/i)).toBeInTheDocument();
    });

    it('clicking a topic chip calls router.push with /search?q=...&topic=... (en locale)', async () => {
      const pushMock = jest.fn();
      // The global jest.mock('next/navigation', ...) in tests/setup.ts is the
      // live mock; mutate useRouter directly on the already-hoisted module mock.
      const navigation = jest.requireMock('next/navigation') as {
        useRouter: jest.Mock;
      };
      navigation.useRouter = jest.fn().mockReturnValue({ push: pushMock });

      const user = userEvent.setup();

      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={[sampleTopicHits[0]]}
          currentLocale="en"
        />
      );

      await user.click(screen.getByRole('option', { name: /Topic: Drug trafficking/i }));

      expect(pushMock).toHaveBeenCalledWith(
        expect.stringContaining('/search?')
      );
      const url = pushMock.mock.calls[0][0] as string;
      expect(url).toContain('q=Drug+trafficking');
      expect(url).toContain('topic=drug_trafficking');
    });

    it('clicking a topic chip calls router.push with pl primary label for pl locale', async () => {
      const pushMock = jest.fn();
      const navigation = jest.requireMock('next/navigation') as {
        useRouter: jest.Mock;
      };
      navigation.useRouter = jest.fn().mockReturnValue({ push: pushMock });

      const user = userEvent.setup();

      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={[sampleTopicHits[0]]}
          currentLocale="pl"
        />
      );

      await user.click(screen.getByRole('option', { name: /Topic: Handel narkotykami/i }));

      expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('topic=drug_trafficking'));
      const url = pushMock.mock.calls[0][0] as string;
      expect(url).toContain('Handel');
    });

    it('fires postTopicClick when a topic chip is clicked', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock;

      const user = userEvent.setup();

      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={[sampleTopicHits[0]]}
          currentLocale="en"
        />
      );

      await user.click(screen.getByRole('option', { name: /Topic: Drug trafficking/i }));

      // Fire-and-forget, so we check fetch was called
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search/topic-click',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('drug_trafficking'),
        })
      );
    });

    it('ArrowDown focuses topics before judgments when both are populated', async () => {
      const user = userEvent.setup();

      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={sampleTopicHits}
          autocompleteSuggestions={[
            { id: 's1', title: 'Contract liability' },
            { id: 's2', title: 'Tort law' },
          ]}
          currentLocale="en"
        />
      );

      const input = screen.getByRole('textbox');

      // Press ArrowDown once — should activate the first topic (index 0)
      await user.type(input, '{ArrowDown}');

      const firstTopic = screen.getByRole('option', { name: /Topic: Drug trafficking/i });
      expect(firstTopic).toHaveAttribute('aria-selected', 'true');

      // The second topic should not be active yet
      const secondTopic = screen.getByRole('option', { name: /Topic: Fraud/i });
      expect(secondTopic).toHaveAttribute('aria-selected', 'false');

      // Press ArrowDown 3 more times (total 4 presses) — skips second topic (index 1)
      // and both judgment suggestions (indices 2, 3) → second suggestion at index 3
      await user.type(input, '{ArrowDown}{ArrowDown}{ArrowDown}');

      const secondSuggestion = screen.getByRole('option', { name: /Use suggestion: Tort law/i });
      expect(secondSuggestion).toHaveAttribute('aria-selected', 'true');

      // First topic should no longer be active
      expect(firstTopic).toHaveAttribute('aria-selected', 'false');
    });
  });
});
