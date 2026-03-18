/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchResultsSection } from '@/lib/styles/components/search/SearchResultsSection';
import { DocumentType } from '@/types/search';

jest.mock('@/lib/styles/components', () => ({
  SearchDocumentCard: ({ doc, isSelected, onToggleSelection, resultPosition }: any) => (
    <div data-testid={`result-${doc.document_id}`}>
      <span>{doc.title}</span>
      <span>Position {resultPosition}</span>
      <input
        type="checkbox"
        checked={isSelected}
        aria-label={`select-${doc.document_id}`}
        onChange={() => onToggleSelection(doc.document_id)}
      />
    </div>
  ),
  PrimaryButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  SecondaryButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  SaveToCollectionPopover: ({ documents, onClose }: any) => (
    <div>
      <span>Save {documents.length}</span>
      <button onClick={onClose}>Close popover</button>
    </div>
  ),
}));

jest.mock('@/lib/styles/components/search/InfiniteScrollTrigger', () => ({
  InfiniteScrollTrigger: ({ hasMore, isLoading, onLoadMore }: any) => (
    <div>
      {hasMore ? <button onClick={onLoadMore}>Load more</button> : null}
      {isLoading ? <span>Loading trigger</span> : null}
    </div>
  ),
}));

describe('SearchResultsSection', () => {
  const metadata = [
    {
      document_id: 'doc-1',
      title: 'First judgment',
      document_type: DocumentType.JUDGMENT,
      language: 'en',
    },
    {
      document_id: 'doc-2',
      title: 'Second judgment',
      document_type: DocumentType.JUDGMENT,
      language: 'pl',
    },
  ];

  const defaultProps = {
    filteredMetadata: metadata,
    filteredCount: 2,
    activeFilterCount: 0,
    searchMetadata: metadata,
    chunksCache: {},
    loadingChunks: [],
    selectedDocumentIds: new Set<string>(),
    selectedCount: 0,
    showSaveAllPopover: false,
    convertMetadataToSearchDocument: (item: any) => ({
      ...item,
      date_issued: null,
      document_number: null,
      issuing_body: null,
      country: null,
      full_text: null,
      summary: null,
      thesis: null,
      legal_references: null,
      legal_concepts: null,
      keywords: [],
      score: null,
      court_name: null,
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
    }),
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
      estimated_total: 4,
      has_more: true,
      next_offset: 10,
    },
    cachedEstimatedTotal: null,
    searchContextParams: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the summary, cards, and infinite-scroll affordance', () => {
    render(<SearchResultsSection {...defaultProps} />);

    expect(
      screen.getByText((content) => content.includes('Showing') && content.includes('documents'))
    ).toBeInTheDocument();
    expect(screen.getByText('First judgment')).toBeInTheDocument();
    expect(screen.getByText('Second judgment')).toBeInTheDocument();
    expect(screen.getByText(/Scroll for more/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('selects all or clears the selection depending on current state', async () => {
    const user = userEvent.setup();
    const selectAllDocuments = jest.fn();
    const clearSelection = jest.fn();

    const { rerender } = render(
      <SearchResultsSection
        {...defaultProps}
        selectAllDocuments={selectAllDocuments}
        clearSelection={clearSelection}
      />
    );

    await user.click(screen.getByRole('button', { name: /Select All/i }));
    expect(selectAllDocuments).toHaveBeenCalledTimes(1);

    rerender(
      <SearchResultsSection
        {...defaultProps}
        selectedDocumentIds={new Set(['doc-1'])}
        selectedCount={1}
        selectAllDocuments={selectAllDocuments}
        clearSelection={clearSelection}
      />
    );

    await user.click(screen.getByRole('button', { name: /Deselect All/i }));
    expect(clearSelection).toHaveBeenCalledTimes(1);
  });

  it('disables save without a selection and opens the popover through parent state', async () => {
    const user = userEvent.setup();
    const setShowSaveAllPopover = jest.fn();

    const { rerender } = render(
      <SearchResultsSection
        {...defaultProps}
        setShowSaveAllPopover={setShowSaveAllPopover}
      />
    );

    expect(screen.getByRole('button', { name: /Save Results/i })).toBeDisabled();

    rerender(
      <SearchResultsSection
        {...defaultProps}
        selectedDocumentIds={new Set(['doc-1'])}
        selectedCount={1}
        setShowSaveAllPopover={setShowSaveAllPopover}
      />
    );

    await user.click(screen.getByRole('button', { name: /Save Selected \(1\)/i }));
    expect(setShowSaveAllPopover).toHaveBeenCalledWith(true);
  });

  it('shows an empty state when filters remove all results', () => {
    render(
      <SearchResultsSection
        {...defaultProps}
        filteredMetadata={[]}
        filteredCount={0}
        activeFilterCount={2}
      />
    );

    expect(screen.getByText('0 documents')).toBeInTheDocument();
    expect(screen.getByText(/No results match your filters/i)).toBeInTheDocument();
  });
});
