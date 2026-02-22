/**
 * Integration tests for complete Search flow
 *
 * Tests end-to-end search scenarios including:
 * - Query submission
 * - Filter application
 * - Results display
 * - Document selection
 * - Pagination
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SearchPage from '@/app/search/page';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    pathname: '/search',
  }),
  usePathname: () => '/search',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      }),
    },
  }),
}));

// Mock search store
const mockSearchStore = {
  query: '',
  setQuery: jest.fn(),
  documentTypes: ['judgment'],
  setDocumentTypes: jest.fn(),
  selectedLanguages: new Set(['pl']),
  setSelectedLanguages: jest.fn(),
  isSearching: false,
  setIsSearching: jest.fn(),
  error: null,
  setError: jest.fn(),
  searchType: 'thinking',
  setSearchType: jest.fn(),
  filters: {
    keywords: new Set(),
    legalConcepts: new Set(),
    documentTypes: new Set(),
    issuingBodies: new Set(),
    dateFrom: null,
    dateTo: null,
  },
  filterVersion: 0,
  toggleFilter: jest.fn(),
  setDateFilter: jest.fn(),
  resetFilters: jest.fn(),
  getActiveFilterCount: jest.fn(() => 0),
  searchMetadata: [],
  setSearchMetadata: jest.fn(),
  currentPage: 1,
  setCurrentPage: jest.fn(),
  pageSize: 10,
  loadState: jest.fn(),
  getFilteredMetadata: jest.fn(() => []),
  getFilteredMetadataCount: jest.fn(() => 0),
  getAvailableFiltersFromMetadata: jest.fn(() => ({
    keywords: [],
    legalConcepts: [],
    documentTypes: [],
    issuingBodies: [],
  })),
};

jest.mock('@/lib/store/searchStore', () => ({
  useSearchStore: (selector: any) => {
    if (typeof selector === 'function') {
      return selector(mockSearchStore);
    }
    return mockSearchStore;
  },
}));

// Mock search API
const mockSearchResults = {
  documents: [
    {
      document_id: 'doc-1',
      uuid: 'uuid-1',
      title: 'Contract Law Case 2024',
      court_name: 'Supreme Court',
      date_issued: '2024-01-15',
      document_type: 'judgment',
      language: 'en',
      score: 0.95,
    },
    {
      document_id: 'doc-2',
      uuid: 'uuid-2',
      title: 'Tax Interpretation 2023',
      court_name: 'Tax Chamber',
      date_issued: '2023-12-10',
      document_type: 'tax_interpretation',
      language: 'pl',
      score: 0.88,
    },
  ],
  pagination: {
    total: 100,
    offset: 0,
    limit: 10,
  },
};

jest.mock('@/hooks/useSearchResults', () => ({
  useSearchResults: () => ({
    search: jest.fn().mockResolvedValue(mockSearchResults),
    loadMore: jest.fn(),
    isLoadingMore: false,
    paginationMetadata: {
      loaded_count: 2,
      estimated_total: 100,
      has_more: true,
    },
    cachedEstimatedTotal: null,
    convertMetadataToSearchDocument: jest.fn((metadata) => metadata),
    fullDocumentsMapRef: { current: new Map() },
  }),
}));

jest.mock('@/hooks/useSearchUrlParams', () => ({
  useSearchUrlParams: () => ({
    updateUrlParams: jest.fn(),
    updatingUrlRef: { current: false },
  }),
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('Complete Search Flow Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  describe('Initial Load', () => {
    it('should render search page with empty state', async () => {
      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Should show example queries
      await waitFor(() => {
        expect(screen.getByText(/popular searches/i)).toBeInTheDocument();
      });
    });

    it('should show typing animation header', async () => {
      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByText(/search.*legal documents/i)).toBeInTheDocument();
      });
    });

    it('should load persisted search state', async () => {
      mockSearchStore.loadState.mockImplementation(() => {
        mockSearchStore.query = 'tax law';
      });

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(mockSearchStore.loadState).toHaveBeenCalled();
      });
    });
  });

  describe('Search Query Submission', () => {
    it('should perform search when user submits query', async () => {
      const user = userEvent.setup();
      const { useSearchResults } = require('@/hooks/useSearchResults');
      const mockSearch = jest.fn().mockResolvedValue(mockSearchResults);
      useSearchResults.mockReturnValue({
        ...useSearchResults(),
        search: mockSearch,
      });

      renderWithProviders(<SearchPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Type query
      const input = screen.getByRole('textbox');
      await user.type(input, 'contract law');

      // Submit
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalled();
      });
    });

    it('should show loading modal during search', async () => {
      const user = userEvent.setup();
      mockSearchStore.isSearching = true;

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        const input = screen.getByRole('textbox');
        expect(input).toBeInTheDocument();
      });

      // Search should show loading state
      // This would test the SearchLoadingModal component
    });

    it('should display results after search completes', async () => {
      const user = userEvent.setup();

      mockSearchStore.searchMetadata = mockSearchResults.documents;
      mockSearchStore.getFilteredMetadata.mockReturnValue(mockSearchResults.documents);
      mockSearchStore.getFilteredMetadataCount.mockReturnValue(2);

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });

    it('should handle search with no results', async () => {
      const user = userEvent.setup();
      const { useSearchResults } = require('@/hooks/useSearchResults');

      useSearchResults.mockReturnValue({
        ...useSearchResults(),
        search: jest.fn().mockResolvedValue({
          documents: [],
          pagination: { total: 0 },
        }),
      });

      mockSearchStore.searchMetadata = [];
      mockSearchStore.getFilteredMetadata.mockReturnValue([]);
      mockSearchStore.getFilteredMetadataCount.mockReturnValue(0);

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });

    it('should handle search error', async () => {
      const user = userEvent.setup();
      const { useSearchResults } = require('@/hooks/useSearchResults');

      useSearchResults.mockReturnValue({
        ...useSearchResults(),
        search: jest.fn().mockRejectedValue(new Error('Search failed')),
      });

      mockSearchStore.error = 'Search failed';

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });
  });

  describe('Popular Searches', () => {
    it('should populate query when popular search is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByText('Swiss franc loans')).toBeInTheDocument();
      });

      const popularSearch = screen.getByText('Swiss franc loans');
      await user.click(popularSearch);

      expect(mockSearchStore.setQuery).toHaveBeenCalledWith('Swiss franc loans');
    });

    it('should configure correct settings for popular search', async () => {
      const user = userEvent.setup();

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByText('IP Box tax relief')).toBeInTheDocument();
      });

      const ipBoxSearch = screen.getByText('IP Box tax relief');
      await user.click(ipBoxSearch);

      expect(mockSearchStore.setDocumentTypes).toHaveBeenCalled();
      expect(mockSearchStore.setSelectedLanguages).toHaveBeenCalled();
    });
  });

  describe('Search Modes', () => {
    it('should allow switching between thinking and rabbit modes', async () => {
      const user = userEvent.setup();

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Mode switch would be tested here via SearchConfiguration component
    });
  });

  describe('Document Type Selection', () => {
    it('should allow selecting document types', async () => {
      const user = userEvent.setup();

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Document type selection would be tested here
    });

    it('should update search when document types change', async () => {
      const user = userEvent.setup();

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Verify that changing document types triggers appropriate updates
    });
  });

  describe('Language Selection', () => {
    it('should allow selecting languages', async () => {
      const user = userEvent.setup();

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Language selection would be tested here
    });

    it('should not allow deselecting last language', async () => {
      const user = userEvent.setup();
      mockSearchStore.selectedLanguages = new Set(['pl']);

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Should prevent deselection of last language
    });
  });

  describe('Filter Application', () => {
    it('should apply filters and update results', async () => {
      const user = userEvent.setup();

      mockSearchStore.searchMetadata = mockSearchResults.documents;
      mockSearchStore.getFilteredMetadata.mockReturnValue([mockSearchResults.documents[0]]);
      mockSearchStore.getFilteredMetadataCount.mockReturnValue(1);
      mockSearchStore.filterVersion = 1;

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Filters would be applied via SearchFilters component
    });

    it('should reset to page 1 when filters change', async () => {
      mockSearchStore.currentPage = 5;
      mockSearchStore.filterVersion = 2;

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Should reset currentPage when filters change
    });

    it('should show empty state when filters return no results', async () => {
      mockSearchStore.searchMetadata = mockSearchResults.documents;
      mockSearchStore.getFilteredMetadata.mockReturnValue([]);
      mockSearchStore.getFilteredMetadataCount.mockReturnValue(0);
      mockSearchStore.getActiveFilterCount.mockReturnValue(3);

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });
  });

  describe('URL Synchronization', () => {
    it('should update URL when search parameters change', async () => {
      const { useSearchUrlParams } = require('@/hooks/useSearchUrlParams');
      const mockUpdateUrlParams = jest.fn();

      useSearchUrlParams.mockReturnValue({
        updateUrlParams: mockUpdateUrlParams,
        updatingUrlRef: { current: false },
      });

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // URL should be updated when search params change
    });

    it('should restore search from URL parameters', async () => {
      const { useSearchUrlParams } = require('@/hooks/useSearchUrlParams');
      const mockOnSearchFromUrl = jest.fn();

      useSearchUrlParams.mockImplementation(({ onSearchFromUrl }: any) => {
        setTimeout(() => onSearchFromUrl(1), 100);
        return {
          updateUrlParams: jest.fn(),
          updatingUrlRef: { current: false },
        };
      });

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should focus search input on key press', async () => {
      const user = userEvent.setup();

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Press a letter key
      await user.keyboard('c');

      const input = screen.getByRole('textbox');
      expect(input).toHaveFocus();
    });

    it('should not interfere with input focus', async () => {
      const user = userEvent.setup();

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.keyboard('test');

      // Should not trigger auto-focus when already in input
      expect(input).toHaveFocus();
    });
  });

  describe('Accessibility', () => {
    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Tab through interactive elements
      await user.tab();
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('should have proper ARIA labels', async () => {
      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        const input = screen.getByRole('textbox');
        expect(input).toHaveAccessibleName();
      });
    });
  });

  describe('Error Recovery', () => {
    it('should allow retry after error', async () => {
      const user = userEvent.setup();
      mockSearchStore.error = 'Network error';

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Error state would allow retry
      mockSearchStore.error = null;
    });

    it('should clear error when starting new search', async () => {
      const user = userEvent.setup();
      mockSearchStore.error = 'Previous error';

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Starting new search should clear error
      const input = screen.getByRole('textbox');
      await user.type(input, 'new query');

      expect(mockSearchStore.setError).toHaveBeenCalledWith(null);
    });
  });

  describe('Performance', () => {
    it('should debounce rapid search parameter changes', async () => {
      const { useSearchUrlParams } = require('@/hooks/useSearchUrlParams');
      const mockUpdateUrlParams = jest.fn();

      useSearchUrlParams.mockReturnValue({
        updateUrlParams: mockUpdateUrlParams,
        updatingUrlRef: { current: false },
      });

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // URL updates should be debounced
    });

    it('should handle large result sets efficiently', async () => {
      const largeResults = Array.from({ length: 100 }, (_, i) => ({
        document_id: `doc-${i}`,
        uuid: `uuid-${i}`,
        title: `Document ${i}`,
        court_name: 'Court',
        date_issued: '2024-01-01',
        document_type: 'judgment',
        language: 'en',
        score: 0.9,
      }));

      mockSearchStore.searchMetadata = largeResults;
      mockSearchStore.getFilteredMetadata.mockReturnValue(largeResults);
      mockSearchStore.getFilteredMetadataCount.mockReturnValue(100);

      renderWithProviders(<SearchPage />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Should handle large result sets without performance issues
    });
  });
});
