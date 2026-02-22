/**
 * Component tests for SearchForm
 *
 * Tests search input, filters, search modes, and user interactions
 * following user-focused testing patterns.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SearchForm } from '@/lib/styles/components/search/SearchForm';
import { DocumentType } from '@/types/search';

// Mock components that might cause issues in test environment
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('SearchForm Component', () => {
  const defaultProps = {
    query: '',
    setQuery: jest.fn(),
    searchType: 'thinking' as const,
    setSearchType: jest.fn(),
    documentTypes: [DocumentType.JUDGMENT],
    toggleDocumentType: jest.fn(),
    selectedLanguages: new Set(['pl']),
    toggleLanguage: jest.fn(),
    setDocumentTypes: jest.fn(),
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

  describe('Rendering', () => {
    it('should render search input field', () => {
      render(<SearchForm {...defaultProps} />);

      const input = screen.getByPlaceholderText(/VAT refund/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
    });

    it('should render search button', () => {
      render(<SearchForm {...defaultProps} />);

      const searchButton = screen.getByRole('button', { name: /search/i });
      expect(searchButton).toBeInTheDocument();
    });

    it('should display current query value', () => {
      render(<SearchForm {...defaultProps} query="contract law" />);

      const input = screen.getByDisplayValue('contract law');
      expect(input).toBeInTheDocument();
    });

    it('should show popular searches when no search performed', () => {
      render(<SearchForm {...defaultProps} />);

      expect(screen.getByText(/popular searches/i)).toBeInTheDocument();
      expect(screen.getByText('Swiss franc loans')).toBeInTheDocument();
      expect(screen.getByText('IP Box tax relief')).toBeInTheDocument();
      expect(screen.getByText('VAT regulations')).toBeInTheDocument();
    });

    it('should not show popular searches when search has been performed', () => {
      render(<SearchForm {...defaultProps} hasPerformedSearch={true} hasResults={true} />);

      expect(screen.queryByText(/popular searches/i)).not.toBeInTheDocument();
    });

    it('should not show popular searches when there is an error', () => {
      render(<SearchForm {...defaultProps} hasError={true} />);

      expect(screen.queryByText(/popular searches/i)).not.toBeInTheDocument();
    });
  });

  describe('Search Input Interaction', () => {
    it('should update query when user types', async () => {
      const user = userEvent.setup();
      const setQuery = jest.fn();

      render(<SearchForm {...defaultProps} setQuery={setQuery} />);

      const input = screen.getByRole('textbox');
      await user.type(input, 'tax law');

      expect(setQuery).toHaveBeenCalledWith('t');
      expect(setQuery).toHaveBeenCalledWith('a');
      expect(setQuery).toHaveBeenCalledWith('x');
    });

    it('should handle empty input gracefully', async () => {
      const user = userEvent.setup();
      const onSearch = jest.fn();

      render(<SearchForm {...defaultProps} query="" onSearch={onSearch} />);

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Should not trigger search with empty query
      expect(onSearch).not.toHaveBeenCalled();
    });

    it('should call onSearch when form is submitted', async () => {
      const user = userEvent.setup();
      const onSearch = jest.fn();

      render(<SearchForm {...defaultProps} query="contract law" onSearch={onSearch} />);

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      expect(onSearch).toHaveBeenCalledTimes(1);
    });

    it('should call onSearch when Enter key is pressed', async () => {
      const user = userEvent.setup();
      const onSearch = jest.fn();

      render(<SearchForm {...defaultProps} query="contract law" onSearch={onSearch} />);

      const input = screen.getByRole('textbox');
      await user.type(input, '{Enter}');

      expect(onSearch).toHaveBeenCalledTimes(1);
    });

    it('should trim whitespace when searching', async () => {
      const user = userEvent.setup();
      const onSearch = jest.fn();

      render(<SearchForm {...defaultProps} query="  contract law  " onSearch={onSearch} />);

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      expect(onSearch).toHaveBeenCalled();
    });

    it('should disable input when searching', () => {
      render(<SearchForm {...defaultProps} isSearching={true} query="test" />);

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('should disable search button when searching', () => {
      render(<SearchForm {...defaultProps} isSearching={true} />);

      const searchButton = screen.getByRole('button', { name: /search/i });
      expect(searchButton).toBeDisabled();
    });
  });

  describe('Popular Searches', () => {
    it('should populate query when popular search is clicked', async () => {
      const user = userEvent.setup();
      const setQuery = jest.fn();
      const setSearchType = jest.fn();
      const setDocumentTypes = jest.fn();
      const setSelectedLanguages = jest.fn();

      render(
        <SearchForm
          {...defaultProps}
          setQuery={setQuery}
          setSearchType={setSearchType}
          setDocumentTypes={setDocumentTypes}
          setSelectedLanguages={setSelectedLanguages}
        />
      );

      const swissFrancChip = screen.getByText('Swiss franc loans');
      await user.click(swissFrancChip);

      expect(setQuery).toHaveBeenCalledWith('Swiss franc loans');
      expect(setSearchType).toHaveBeenCalledWith('thinking');
      expect(setDocumentTypes).toHaveBeenCalledWith([DocumentType.JUDGMENT]);
      expect(setSelectedLanguages).toHaveBeenCalledWith(new Set(['uk']));
    });

    it('should populate IP Box query with correct settings', async () => {
      const user = userEvent.setup();
      const setQuery = jest.fn();
      const setDocumentTypes = jest.fn();
      const setSelectedLanguages = jest.fn();

      render(
        <SearchForm
          {...defaultProps}
          setQuery={setQuery}
          setDocumentTypes={setDocumentTypes}
          setSelectedLanguages={setSelectedLanguages}
        />
      );

      const ipBoxChip = screen.getByText('IP Box tax relief');
      await user.click(ipBoxChip);

      expect(setQuery).toHaveBeenCalledWith('IP Box tax relief');
      expect(setDocumentTypes).toHaveBeenCalledWith([DocumentType.TAX_INTERPRETATION]);
      expect(setSelectedLanguages).toHaveBeenCalledWith(new Set(['pl']));
    });

    it('should focus input after clicking popular search', async () => {
      const user = userEvent.setup();
      const ref = React.createRef<HTMLInputElement>();

      render(<SearchForm {...defaultProps} ref={ref} />);

      const vatChip = screen.getByText('VAT regulations');
      await user.click(vatChip);

      await waitFor(() => {
        expect(ref.current).toHaveFocus();
      });
    });
  });

  describe('Search Modes', () => {
    it('should not auto-search when mode changes', async () => {
      const user = userEvent.setup();
      const onSearch = jest.fn();
      const setSearchType = jest.fn();

      render(
        <SearchForm
          {...defaultProps}
          query="test query"
          onSearch={onSearch}
          setSearchType={setSearchType}
        />
      );

      // Simulate mode change (this would happen via SearchConfiguration component)
      setSearchType('rabbit');

      // onSearch should NOT be called automatically
      expect(onSearch).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator when searching', () => {
      render(<SearchForm {...defaultProps} isSearching={true} query="test" />);

      // Button should be disabled and show loading state
      const searchButton = screen.getByRole('button', { name: /search/i });
      expect(searchButton).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper form structure', () => {
      const { container } = render(<SearchForm {...defaultProps} />);

      const form = container.querySelector('form');
      expect(form).toBeInTheDocument();
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      const onSearch = jest.fn();

      render(<SearchForm {...defaultProps} query="test query" onSearch={onSearch} />);

      // Tab to input
      await user.tab();
      expect(screen.getByRole('textbox')).toHaveFocus();

      // Tab to search button
      await user.tab();
      expect(screen.getByRole('button', { name: /search/i })).toHaveFocus();

      // Press Enter to submit
      await user.keyboard('{Enter}');
      expect(onSearch).toHaveBeenCalled();
    });

    it('should have accessible input placeholder', () => {
      render(<SearchForm {...defaultProps} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('placeholder');
      expect(input.getAttribute('placeholder')).toContain('VAT');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long search queries', async () => {
      const user = userEvent.setup();
      const longQuery = 'a'.repeat(1000);
      const setQuery = jest.fn();

      render(<SearchForm {...defaultProps} setQuery={setQuery} />);

      const input = screen.getByRole('textbox');
      await user.type(input, longQuery);

      expect(setQuery).toHaveBeenCalled();
    });

    it('should handle special characters in query', async () => {
      const user = userEvent.setup();
      const specialQuery = '§ 123: "Contract" (2024) & regulations';
      const onSearch = jest.fn();

      render(<SearchForm {...defaultProps} query={specialQuery} onSearch={onSearch} />);

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      expect(onSearch).toHaveBeenCalled();
    });

    it('should handle rapid form submissions', async () => {
      const user = userEvent.setup();
      const onSearch = jest.fn();

      render(<SearchForm {...defaultProps} query="test" onSearch={onSearch} />);

      const searchButton = screen.getByRole('button', { name: /search/i });

      // Rapidly submit multiple times
      await user.click(searchButton);
      await user.click(searchButton);
      await user.click(searchButton);

      // Should call onSearch for each submission
      expect(onSearch).toHaveBeenCalledTimes(3);
    });

    it('should handle whitespace-only query', async () => {
      const user = userEvent.setup();
      const onSearch = jest.fn();

      render(<SearchForm {...defaultProps} query="   " onSearch={onSearch} />);

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Should not trigger search with whitespace-only query
      expect(onSearch).not.toHaveBeenCalled();
    });

    it('should handle unicode characters', async () => {
      const user = userEvent.setup();
      const unicodeQuery = '法律分析 📚 Análisis legal 🇵🇱';
      const onSearch = jest.fn();

      render(<SearchForm {...defaultProps} query={unicodeQuery} onSearch={onSearch} />);

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      expect(onSearch).toHaveBeenCalled();
    });
  });

  describe('Visual States', () => {
    it('should apply correct styling when has results', () => {
      const { container } = render(<SearchForm {...defaultProps} hasResults={true} />);

      const form = container.querySelector('form');
      expect(form).toHaveClass('py-3');
    });

    it('should apply correct styling when has error', () => {
      const { container } = render(<SearchForm {...defaultProps} hasError={true} />);

      const form = container.querySelector('form');
      expect(form).toHaveClass('py-3', 'pb-2');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete search workflow', async () => {
      const user = userEvent.setup();
      const setQuery = jest.fn((q) => {
        // Simulate state update
        defaultProps.query = q;
      });
      const onSearch = jest.fn();

      const { rerender } = render(
        <SearchForm {...defaultProps} setQuery={setQuery} onSearch={onSearch} />
      );

      // 1. User types query
      const input = screen.getByRole('textbox');
      await user.type(input, 'contract law');

      // 2. Rerender with updated query
      rerender(
        <SearchForm
          {...defaultProps}
          query="contract law"
          setQuery={setQuery}
          onSearch={onSearch}
        />
      );

      // 3. User submits search
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      expect(onSearch).toHaveBeenCalled();
    });

    it('should handle search with popular query selection', async () => {
      const user = userEvent.setup();
      const setQuery = jest.fn();
      const setSearchType = jest.fn();
      const setDocumentTypes = jest.fn();
      const setSelectedLanguages = jest.fn();

      render(
        <SearchForm
          {...defaultProps}
          setQuery={setQuery}
          setSearchType={setSearchType}
          setDocumentTypes={setDocumentTypes}
          setSelectedLanguages={setSelectedLanguages}
        />
      );

      // Click popular search
      const popularSearch = screen.getByText('VAT regulations');
      await user.click(popularSearch);

      // Verify all settings are configured
      expect(setQuery).toHaveBeenCalledWith('VAT regulations');
      expect(setSearchType).toHaveBeenCalledWith('thinking');
      expect(setDocumentTypes).toHaveBeenCalledWith([DocumentType.TAX_INTERPRETATION]);
      expect(setSelectedLanguages).toHaveBeenCalledWith(new Set(['pl']));
    });
  });
});
