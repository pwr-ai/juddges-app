/**
 * Component tests for SearchResultsSection
 *
 * Tests search results display, document cards, selection, and infinite scroll
 * following user-focused testing patterns.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SearchResultsSection } from '@/lib/styles/components/search/SearchResultsSection';
import { LegalDocumentMetadata, SearchDocument, DocumentType } from '@/types/search';

// Mock child components
jest.mock('@/lib/styles/components', () => ({
  ...jest.requireActual('@/lib/styles/components'),
  SearchDocumentCard: ({ doc, isSelected, onToggleSelection, resultPosition }: any) => (
    <div data-testid={`document-card-${doc.document_id}`}>
      <h3>{doc.title}</h3>
      <p>{doc.court_name}</p>
      <p>Position: {resultPosition}</p>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelection(doc.document_id)}
        aria-label={`Select ${doc.title}`}
      />
    </div>
  ),
  Accordion: ({ children }: any) => <div data-testid="accordion">{children}</div>,
}));

jest.mock('@/components/search', () => ({
  SaveToCollectionPopover: ({ documents, onClose }: any) => (
    <div data-testid="save-popover">
      <p>Save {documents.length} documents</p>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

jest.mock('@/lib/styles/components/search/InfiniteScrollTrigger', () => ({
  InfiniteScrollTrigger: ({ onLoadMore, hasMore, isLoading }: any) => (
    <div data-testid="infinite-scroll-trigger">
      {hasMore && !isLoading && <button onClick={onLoadMore}>Load More</button>}
      {isLoading && <p>Loading...</p>}
    </div>
  ),
}));

describe('SearchResultsSection Component', () => {
  const mockMetadata: LegalDocumentMetadata[] = [
    {
      document_id: 'doc-1',
      uuid: 'uuid-1',
      title: 'Contract Law Case 2024',
      court_name: 'Supreme Court',
      date_issued: '2024-01-15',
      document_type: DocumentType.JUDGMENT,
      language: 'en',
      score: 0.95,
      keywords: ['contract', 'breach'],
      document_number: 'SC-2024-001',
    },
    {
      document_id: 'doc-2',
      uuid: 'uuid-2',
      title: 'Tax Interpretation 2023',
      court_name: 'Tax Chamber',
      date_issued: '2023-12-10',
      document_type: DocumentType.TAX_INTERPRETATION,
      language: 'pl',
      score: 0.88,
      keywords: ['tax', 'VAT'],
      document_number: 'TC-2023-042',
    },
  ];

  const mockConvertMetadata = (metadata: LegalDocumentMetadata): SearchDocument => ({
    document_id: metadata.document_id,
    title: metadata.title ?? null,
    court_name: metadata.court_name ?? null,
    date_issued: metadata.date_issued,
    document_type: metadata.document_type,
    language: metadata.language,
    document_number: metadata.document_number ?? null,
    country: 'PL',
    issuing_body: null,
    summary: null,
    thesis: null,
    legal_references: null,
    legal_concepts: null,
    keywords: null,
    score: null,
    department_name: null,
    presiding_judge: null,
    judges: null,
    parties: null,
    outcome: null,
    legal_bases: null,
    extracted_legal_bases: null,
    references: null,
    factual_state: null,
    legal_state: null,
    full_text: null,
  });

  const defaultProps = {
    filteredMetadata: mockMetadata,
    filteredCount: 2,
    activeFilterCount: 0,
    searchMetadata: mockMetadata,
    chunksCache: {},
    loadingChunks: [],
    selectedDocumentIds: new Set<string>(),
    selectedCount: 0,
    showSaveAllPopover: false,
    convertMetadataToSearchDocument: mockConvertMetadata,
    toggleDocumentSelection: jest.fn(),
    selectAllDocuments: jest.fn(),
    clearSelection: jest.fn(),
    setShowSaveAllPopover: jest.fn(),
    filterVersion: 1,
    onLoadMore: jest.fn(),
    isLoadingMore: false,
    paginationMetadata: {
      offset: 0,
      limit: 10,
      loaded_count: 2,
      estimated_total: 100,
      has_more: true,
      next_offset: 10,
    },
    cachedEstimatedTotal: null,
    searchContextParams: {
      searchQuery: 'contract law',
      searchMode: 'thinking' as const,
      filters: {
        languages: ['en', 'pl'],
      },
      totalResults: 100,
      searchTimestamp: '2024-01-15T10:00:00Z',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render document count', () => {
      render(<SearchResultsSection {...defaultProps} />);

      expect(screen.getByText(/showing/i)).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText(/~100/i)).toBeInTheDocument();
    });

    it('should render all document cards', () => {
      render(<SearchResultsSection {...defaultProps} />);

      expect(screen.getByText('Contract Law Case 2024')).toBeInTheDocument();
      expect(screen.getByText('Tax Interpretation 2023')).toBeInTheDocument();
    });

    it('should render select all button', () => {
      render(<SearchResultsSection {...defaultProps} />);

      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      expect(selectAllButton).toBeInTheDocument();
    });

    it('should render save button', () => {
      render(<SearchResultsSection {...defaultProps} />);

      const saveButton = screen.getByRole('button', { name: /save results/i });
      expect(saveButton).toBeInTheDocument();
    });

    it('should show scroll indicator when has more results', () => {
      render(<SearchResultsSection {...defaultProps} />);

      expect(screen.getByText(/scroll for more/i)).toBeInTheDocument();
    });

    it('should render empty state when no results with filters', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          filteredMetadata={[]}
          filteredCount={0}
          activeFilterCount={3}
        />
      );

      expect(screen.getByText(/no results match your filters/i)).toBeInTheDocument();
    });
  });

  describe('Document Selection', () => {
    it('should call selectAllDocuments when Select All is clicked', async () => {
      const user = userEvent.setup();
      const selectAllDocuments = jest.fn();

      render(<SearchResultsSection {...defaultProps} selectAllDocuments={selectAllDocuments} />);

      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      await user.click(selectAllButton);

      expect(selectAllDocuments).toHaveBeenCalledTimes(1);
    });

    it('should show Deselect All when documents are selected', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          selectedDocumentIds={new Set(['doc-1', 'doc-2'])}
          selectedCount={2}
        />
      );

      const deselectButton = screen.getByRole('button', { name: /deselect all/i });
      expect(deselectButton).toBeInTheDocument();
    });

    it('should call clearSelection when Deselect All is clicked', async () => {
      const user = userEvent.setup();
      const clearSelection = jest.fn();

      render(
        <SearchResultsSection
          {...defaultProps}
          selectedDocumentIds={new Set(['doc-1'])}
          selectedCount={1}
          clearSelection={clearSelection}
        />
      );

      const deselectButton = screen.getByRole('button', { name: /deselect all/i });
      await user.click(deselectButton);

      expect(clearSelection).toHaveBeenCalledTimes(1);
    });

    it('should toggle individual document selection', async () => {
      const user = userEvent.setup();
      const toggleDocumentSelection = jest.fn();

      render(
        <SearchResultsSection
          {...defaultProps}
          toggleDocumentSelection={toggleDocumentSelection}
        />
      );

      const checkbox = screen.getByLabelText(/select contract law case 2024/i);
      await user.click(checkbox);

      expect(toggleDocumentSelection).toHaveBeenCalledWith('doc-1');
    });

    it('should update save button text with selection count', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          selectedDocumentIds={new Set(['doc-1', 'doc-2'])}
          selectedCount={2}
        />
      );

      expect(screen.getByText(/save selected \(2\)/i)).toBeInTheDocument();
    });

    it('should disable save button when no selection', () => {
      render(<SearchResultsSection {...defaultProps} selectedCount={0} />);

      const saveButton = screen.getByRole('button', { name: /save results/i });
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Save to Collection', () => {
    it('should open save popover when save button is clicked', async () => {
      const user = userEvent.setup();
      const setShowSaveAllPopover = jest.fn();

      render(
        <SearchResultsSection
          {...defaultProps}
          selectedDocumentIds={new Set(['doc-1'])}
          selectedCount={1}
          setShowSaveAllPopover={setShowSaveAllPopover}
        />
      );

      const saveButton = screen.getByRole('button', { name: /save selected/i });
      await user.click(saveButton);

      expect(setShowSaveAllPopover).toHaveBeenCalledWith(true);
    });

    it('should render save popover when shown', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          selectedDocumentIds={new Set(['doc-1', 'doc-2'])}
          selectedCount={2}
          showSaveAllPopover={true}
        />
      );

      expect(screen.getByTestId('save-popover')).toBeInTheDocument();
      expect(screen.getByText('Save 2 documents')).toBeInTheDocument();
    });

    it('should close save popover when close is clicked', async () => {
      const user = userEvent.setup();
      const setShowSaveAllPopover = jest.fn();

      render(
        <SearchResultsSection
          {...defaultProps}
          selectedCount={1}
          showSaveAllPopover={true}
          setShowSaveAllPopover={setShowSaveAllPopover}
        />
      );

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(setShowSaveAllPopover).toHaveBeenCalledWith(false);
    });

    it('should pass all documents to popover when no selection', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          selectedCount={0}
          showSaveAllPopover={true}
        />
      );

      expect(screen.getByText('Save 2 documents')).toBeInTheDocument();
    });
  });

  describe('Infinite Scroll', () => {
    it('should render infinite scroll trigger', () => {
      render(<SearchResultsSection {...defaultProps} />);

      expect(screen.getByTestId('infinite-scroll-trigger')).toBeInTheDocument();
    });

    it('should call onLoadMore when trigger is activated', async () => {
      const user = userEvent.setup();
      const onLoadMore = jest.fn();

      render(<SearchResultsSection {...defaultProps} onLoadMore={onLoadMore} />);

      const loadMoreButton = screen.getByRole('button', { name: /load more/i });
      await user.click(loadMoreButton);

      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it('should show loading state when loading more', () => {
      render(<SearchResultsSection {...defaultProps} isLoadingMore={true} />);

      expect(screen.getByText(/loading more documents/i)).toBeInTheDocument();
    });

    it('should not show trigger when no more results', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          paginationMetadata={{
            offset: 0,
            limit: 10,
            loaded_count: 100,
            estimated_total: 100,
            has_more: false,
            next_offset: null,
          }}
        />
      );

      const loadMoreButton = screen.queryByRole('button', { name: /load more/i });
      expect(loadMoreButton).not.toBeInTheDocument();
    });
  });

  describe('Document Cards', () => {
    it('should pass correct props to document cards', () => {
      render(<SearchResultsSection {...defaultProps} />);

      // Check first card
      const card1 = screen.getByTestId('document-card-doc-1');
      expect(card1).toHaveTextContent('Contract Law Case 2024');
      expect(card1).toHaveTextContent('Supreme Court');
      expect(card1).toHaveTextContent('Position: 1');

      // Check second card
      const card2 = screen.getByTestId('document-card-doc-2');
      expect(card2).toHaveTextContent('Tax Interpretation 2023');
      expect(card2).toHaveTextContent('Position: 2');
    });

    it('should mark selected documents', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          selectedDocumentIds={new Set(['doc-1'])}
        />
      );

      const checkbox1 = screen.getByLabelText(/select contract law case 2024/i);
      const checkbox2 = screen.getByLabelText(/select tax interpretation 2023/i);

      expect(checkbox1).toBeChecked();
      expect(checkbox2).not.toBeChecked();
    });
  });

  describe('Filter State', () => {
    it('should show filtered indicator when filters are active', () => {
      render(<SearchResultsSection {...defaultProps} activeFilterCount={3} />);

      expect(screen.getByText(/\(filtered\)/i)).toBeInTheDocument();
    });

    it('should not show filtered indicator when no filters', () => {
      render(<SearchResultsSection {...defaultProps} activeFilterCount={0} />);

      expect(screen.queryByText(/\(filtered\)/i)).not.toBeInTheDocument();
    });

    it('should show empty state with filter message when filtered', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          filteredMetadata={[]}
          filteredCount={0}
          activeFilterCount={2}
        />
      );

      expect(screen.getByText(/no results match your filters/i)).toBeInTheDocument();
      expect(screen.getByText(/try adjusting or clearing your filters/i)).toBeInTheDocument();
    });
  });

  describe('Pagination Metadata', () => {
    it('should display loaded count from pagination metadata', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          paginationMetadata={{
            offset: 0,
            limit: 10,
            loaded_count: 50,
            estimated_total: 200,
            has_more: true,
            next_offset: 50,
          }}
        />
      );

      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText(/~200/i)).toBeInTheDocument();
    });

    it('should use cached total when available', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          cachedEstimatedTotal={150}
          paginationMetadata={{
            offset: 0,
            limit: 10,
            loaded_count: 50,
            estimated_total: 200,
            has_more: true,
            next_offset: 50,
          }}
        />
      );

      // Should prefer cached total
      expect(screen.getByText(/~150/i)).toBeInTheDocument();
    });

    it('should handle null pagination metadata', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          paginationMetadata={null}
        />
      );

      // Should fallback to filteredCount
      expect(screen.getByText(/showing/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty search results', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          filteredMetadata={[]}
          filteredCount={0}
          searchMetadata={[]}
        />
      );

      expect(screen.getByText(/0 documents/i)).toBeInTheDocument();
    });

    it('should handle large result sets', () => {
      const largeMetadata = Array.from({ length: 100 }, (_, i) => ({
        ...mockMetadata[0],
        document_id: `doc-${i}`,
        uuid: `uuid-${i}`,
        title: `Document ${i}`,
      }));

      render(
        <SearchResultsSection
          {...defaultProps}
          filteredMetadata={largeMetadata}
          filteredCount={100}
        />
      );

      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should handle rapid selection changes', async () => {
      const user = userEvent.setup();
      const toggleDocumentSelection = jest.fn();

      render(
        <SearchResultsSection
          {...defaultProps}
          toggleDocumentSelection={toggleDocumentSelection}
        />
      );

      const checkbox = screen.getByLabelText(/select contract law case 2024/i);

      // Rapidly toggle
      await user.click(checkbox);
      await user.click(checkbox);
      await user.click(checkbox);

      expect(toggleDocumentSelection).toHaveBeenCalledTimes(3);
    });

    it('should handle missing document data gracefully', () => {
      const incompleteMetadata: LegalDocumentMetadata[] = [
        {
          document_id: 'doc-incomplete',
          uuid: 'uuid-incomplete',
          title: '',
          court_name: '',
          date_issued: '',
          document_type: DocumentType.JUDGMENT,
          language: 'en',
          score: 0.5,
          keywords: [],
        },
      ];

      render(
        <SearchResultsSection
          {...defaultProps}
          filteredMetadata={incompleteMetadata}
          searchMetadata={incompleteMetadata}
          filteredCount={1}
        />
      );

      expect(screen.getByTestId('document-card-doc-incomplete')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper button labels', () => {
      render(<SearchResultsSection {...defaultProps} />);

      expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save results/i })).toBeInTheDocument();
    });

    it('should have accessible checkboxes', () => {
      render(<SearchResultsSection {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((checkbox) => {
        expect(checkbox).toHaveAccessibleName();
      });
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();

      render(<SearchResultsSection {...defaultProps} />);

      // Tab through interactive elements
      await user.tab();
      expect(screen.getByRole('button', { name: /select all/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /save results/i })).toHaveFocus();
    });
  });

  describe('Search Context', () => {
    it('should build search context for document cards', () => {
      const searchContextParams = {
        searchQuery: 'contract law',
        searchMode: 'thinking' as const,
        filters: {
          languages: ['en'],
          document_types: ['judgment'],
        },
        totalResults: 100,
        searchTimestamp: '2024-01-15T10:00:00Z',
      };

      render(
        <SearchResultsSection
          {...defaultProps}
          searchContextParams={searchContextParams}
        />
      );

      // Cards should be rendered with search context
      expect(screen.getByTestId('document-card-doc-1')).toBeInTheDocument();
      expect(screen.getByTestId('document-card-doc-2')).toBeInTheDocument();
    });

    it('should handle missing search context gracefully', () => {
      render(
        <SearchResultsSection
          {...defaultProps}
          searchContextParams={undefined}
        />
      );

      // Should still render cards without context
      expect(screen.getByTestId('document-card-doc-1')).toBeInTheDocument();
    });
  });
});
