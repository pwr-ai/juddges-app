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

  // ---------------------------------------------------------------------------
  // TOPICS section — the only autocomplete surface
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

    it('shows an empty state when there are no topic hits', () => {
      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={[]}
        />
      );

      expect(screen.getByText(/No matching topics/i)).toBeInTheDocument();
      expect(screen.queryByText(/^topics$/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('shows loading text while fetching, before any topic hits arrive', () => {
      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={[]}
          isAutocompleteLoading={true}
        />
      );

      expect(screen.getByText(/Loading suggestions/i)).toBeInTheDocument();
      expect(screen.queryByText(/No matching topics/i)).not.toBeInTheDocument();
    });

    it('clicking a topic chip calls router.push with /search?q=...&topic=... (en locale)', async () => {
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
          currentLocale="en"
        />
      );

      await user.click(screen.getByRole('option', { name: /Topic: Drug trafficking/i }));

      expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/search?'));
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

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search/topic-click',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('drug_trafficking'),
        })
      );
    });

    it('ArrowDown cycles through topic options', async () => {
      const user = userEvent.setup();

      render(
        <SearchForm
          {...defaultProps}
          query="narko"
          autocompleteTopicHits={sampleTopicHits}
          currentLocale="en"
        />
      );

      const input = screen.getByRole('textbox');

      await user.type(input, '{ArrowDown}');

      const firstTopic = screen.getByRole('option', { name: /Topic: Drug trafficking/i });
      expect(firstTopic).toHaveAttribute('aria-selected', 'true');

      const secondTopic = screen.getByRole('option', { name: /Topic: Fraud/i });
      expect(secondTopic).toHaveAttribute('aria-selected', 'false');

      await user.type(input, '{ArrowDown}');

      expect(secondTopic).toHaveAttribute('aria-selected', 'true');
      expect(firstTopic).toHaveAttribute('aria-selected', 'false');
    });
  });
});
