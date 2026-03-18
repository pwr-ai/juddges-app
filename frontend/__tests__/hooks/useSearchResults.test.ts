/**
 * @jest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { useSearchResults } from '@/hooks/useSearchResults';
import { useSearchStore } from '@/lib/store/searchStore';
import { DocumentType } from '@/types/search';

jest.mock('@/lib/store/searchStore', () => ({
  useSearchStore: jest.fn(),
  isUnknownDocumentType: jest.fn(() => false),
}));

jest.mock('@/lib/api', () => ({
  searchChunks: jest.fn(),
  fetchDocumentsByIds: jest.fn(),
}));

import * as api from '@/lib/api';

const mockSearchChunks = api.searchChunks as jest.MockedFunction<typeof api.searchChunks>;
const mockFetchDocumentsByIds = api.fetchDocumentsByIds as jest.MockedFunction<
  typeof api.fetchDocumentsByIds
>;
const mockUseSearchStore = useSearchStore as unknown as jest.Mock & {
  getState: jest.Mock;
  setState: jest.Mock;
};

describe('useSearchResults', () => {
  let storeState: Record<string, any>;

  const createChunk = (documentId: string, chunkId = 1) => ({
    document_id: documentId,
    chunk_id: chunkId,
    chunk_text: `chunk-${chunkId}`,
    score: 0.9,
    document_type: 'judgment',
    language: 'en',
  });

  const createDocument = (documentId: string) => ({
    document_id: documentId,
    document_type: DocumentType.JUDGMENT,
    title: `Title ${documentId}`,
    date_issued: '2024-01-15',
    issuing_body: null,
    language: 'en',
    document_number: `NUM-${documentId}`,
    country: 'PL',
    full_text: null,
    summary: `Summary ${documentId}`,
    thesis: null,
    legal_references: null,
    legal_concepts: null,
    keywords: ['contract'],
    score: null,
    court_name: 'Supreme Court',
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
    metadata: {},
  });

  beforeEach(() => {
    jest.clearAllMocks();

    storeState = {
      query: 'contract law',
      searchType: 'thinking',
      documentTypes: [DocumentType.JUDGMENT],
      selectedLanguages: new Set(['en']),
      ignoreUnknownType: false,
      chunksCache: {},
      loadingChunks: new Set<string>(),
      searchMetadata: [],
      paginationMetadata: null,
      isLoadingMore: false,
      cachedEstimatedTotal: null,
      error: null,
      isSearching: false,
      setIsSearching: jest.fn((value: boolean) => {
        storeState.isSearching = value;
      }),
      setError: jest.fn((value: string | null) => {
        storeState.error = value;
      }),
      clearChunksCache: jest.fn(() => {
        storeState.chunksCache = {};
      }),
      setChunksForDocuments: jest.fn(),
      setSearchMetadata: jest.fn((metadata: unknown[], total = metadata.length) => {
        storeState.searchMetadata = metadata;
        storeState.cachedEstimatedTotal = total;
      }),
      setPageSize: jest.fn(),
      clearSelection: jest.fn(),
      setPaginationMetadata: jest.fn((pagination: unknown) => {
        storeState.paginationMetadata = pagination;
      }),
      setIsLoadingMore: jest.fn((value: boolean) => {
        storeState.isLoadingMore = value;
      }),
      appendSearchMetadata: jest.fn((metadata: unknown[]) => {
        storeState.searchMetadata = [...storeState.searchMetadata, ...metadata];
      }),
      resetSearch: jest.fn(),
    };

    mockUseSearchStore.mockImplementation(() => storeState);
    mockUseSearchStore.getState = jest.fn(() => storeState);
    mockUseSearchStore.setState = jest.fn((partial: Record<string, unknown>) => {
      storeState = { ...storeState, ...partial };
    });
  });

  it('searches chunks and fetches documents with the current store filters', async () => {
    mockSearchChunks.mockResolvedValueOnce({
      chunks: [createChunk('doc-1')],
      total_chunks: 1,
      unique_documents: 1,
      pagination: null,
    } as any);
    mockFetchDocumentsByIds.mockResolvedValueOnce({
      documents: [createDocument('doc-1')],
    } as any);

    const { result } = renderHook(() => useSearchResults());

    await act(async () => {
      await result.current.search('contract law');
    });

    expect(mockSearchChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'contract law',
        mode: 'thinking',
        languages: ['en'],
        document_types: [DocumentType.JUDGMENT],
      })
    );
    expect(mockFetchDocumentsByIds).toHaveBeenCalledWith(
      expect.objectContaining({
        document_ids: ['doc-1'],
      })
    );
    expect(storeState.setSearchMetadata).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          document_id: 'doc-1',
          document_type: DocumentType.JUDGMENT,
        }),
      ]),
      1,
      false
    );
    expect(storeState.setIsSearching).toHaveBeenNthCalledWith(1, true);
    expect(storeState.setIsSearching).toHaveBeenLastCalledWith(false);
  });

  it('stores pagination metadata from the initial search', async () => {
    mockSearchChunks.mockResolvedValueOnce({
      chunks: [createChunk('doc-1')],
      total_chunks: 1,
      unique_documents: 1,
      pagination: {
        offset: 0,
        limit: 10,
        loaded_count: 1,
        estimated_total: 12,
        has_more: true,
        next_offset: 10,
      },
    } as any);
    mockFetchDocumentsByIds.mockResolvedValueOnce({
      documents: [createDocument('doc-1')],
    } as any);

    const { result } = renderHook(() => useSearchResults());

    await act(async () => {
      await result.current.search('contract law');
    });

    expect(storeState.setPaginationMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        has_more: true,
        next_offset: 10,
      })
    );
  });

  it('sets a search error when the chunk search fails', async () => {
    mockSearchChunks.mockRejectedValueOnce(new Error('Search failed'));

    const { result } = renderHook(() => useSearchResults());

    await act(async () => {
      await result.current.search('contract law');
    });

    expect(storeState.setError).toHaveBeenCalledWith('search_error');
    expect(storeState.setSearchMetadata).toHaveBeenCalledWith([], 0, false);
    expect(storeState.setIsSearching).toHaveBeenLastCalledWith(false);
  });

  it('does not search for an empty query', async () => {
    const { result } = renderHook(() => useSearchResults());

    await act(async () => {
      await result.current.search('   ');
    });

    expect(mockSearchChunks).not.toHaveBeenCalled();
    expect(mockFetchDocumentsByIds).not.toHaveBeenCalled();
  });

  it('loads more results when pagination says more pages are available', async () => {
    storeState.paginationMetadata = {
      offset: 0,
      limit: 10,
      loaded_count: 1,
      estimated_total: 2,
      has_more: true,
      next_offset: 10,
    };
    storeState.cachedEstimatedTotal = 2;

    mockSearchChunks.mockResolvedValueOnce({
      chunks: [createChunk('doc-2', 2)],
      total_chunks: 1,
      unique_documents: 1,
      pagination: {
        offset: 10,
        limit: 10,
        loaded_count: 1,
        estimated_total: 2,
        has_more: false,
        next_offset: null,
      },
    } as any);
    mockFetchDocumentsByIds.mockResolvedValueOnce({
      documents: [createDocument('doc-2')],
    } as any);

    const { result } = renderHook(() => useSearchResults());

    await act(async () => {
      await result.current.loadMore();
    });

    expect(storeState.setIsLoadingMore).toHaveBeenNthCalledWith(1, true);
    expect(storeState.appendSearchMetadata).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          document_id: 'doc-2',
        }),
      ])
    );
    expect(storeState.setPaginationMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        loaded_count: 2,
        estimated_total: 2,
      })
    );
    expect(storeState.setIsLoadingMore).toHaveBeenLastCalledWith(false);
  });

  it('does nothing on loadMore when there is no next page', async () => {
    storeState.paginationMetadata = null;

    const { result } = renderHook(() => useSearchResults());

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockSearchChunks).not.toHaveBeenCalled();
    expect(mockFetchDocumentsByIds).not.toHaveBeenCalled();
  });

  it('exposes the conversion helper', () => {
    const { result } = renderHook(() => useSearchResults());

    expect(typeof result.current.convertMetadataToSearchDocument).toBe('function');
    expect(result.current.fullDocumentsMapRef.current).toBeInstanceOf(Map);
  });
});
