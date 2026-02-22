/**
 * Hook tests for useSearchResults
 *
 * Tests search result management, pagination, and data transformation
 * using renderHook from React Testing Library.
 *
 * @jest-environment jsdom
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSearchResults } from '@/hooks/useSearchResults';
import { useSearchStore } from '@/lib/store/searchStore';
import { DocumentType } from '@/types/search';

// Mock the search store
jest.mock('@/lib/store/searchStore', () => ({
  useSearchStore: jest.fn(),
  isUnknownDocumentType: jest.fn((type) => type === 'unknown'),
}));

// Mock the API functions
jest.mock('@/lib/api', () => ({
  searchChunks: jest.fn(),
  fetchDocumentsByIds: jest.fn(),
}));

import * as api from '@/lib/api';

const mockSearchChunks = api.searchChunks as jest.MockedFunction<typeof api.searchChunks>;
const mockFetchDocumentsByIds = api.fetchDocumentsByIds as jest.MockedFunction<typeof api.fetchDocumentsByIds>;

describe('useSearchResults Hook', () => {
  const mockStoreState = {
    query: 'contract law',
    searchType: 'semantic' as const,
    documentTypes: [DocumentType.JUDGMENT],
    selectedLanguages: ['en'],
    ignoreUnknownType: false,
    setIsSearching: jest.fn(),
    setError: jest.fn(),
    clearChunksCache: jest.fn(),
    setChunksForDocuments: jest.fn(),
    setSearchMetadata: jest.fn(),
    setPageSize: jest.fn(),
    clearSelection: jest.fn(),
    paginationMetadata: null,
    isLoadingMore: false,
    cachedEstimatedTotal: null,
    setPaginationMetadata: jest.fn(),
    setIsLoadingMore: jest.fn(),
    appendSearchMetadata: jest.fn(),
    resetSearch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useSearchStore as jest.Mock).mockReturnValue(mockStoreState);
  });

  describe('Hook Initialization', () => {
    it('should initialize without errors', () => {
      const { result } = renderHook(() => useSearchResults());

      expect(result.current).toBeDefined();
    });

    it('should provide search function', () => {
      const { result } = renderHook(() => useSearchResults());

      expect(typeof result.current.performSearch).toBe('function');
    });

    it('should provide load more function', () => {
      const { result } = renderHook(() => useSearchResults());

      expect(typeof result.current.loadMore).toBe('function');
    });
  });

  describe('Search Execution', () => {
    it('should call searchChunks with correct parameters', async () => {
      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      expect(mockSearchChunks).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'contract law',
          documentTypes: [DocumentType.JUDGMENT],
          languages: ['en'],
        })
      );
    });

    it('should set loading state during search', async () => {
      mockSearchChunks.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ chunks: [], total: 0, pagination: null }), 100))
      );

      const { result } = renderHook(() => useSearchResults());

      act(() => {
        result.current.performSearch();
      });

      expect(mockStoreState.setIsSearching).toHaveBeenCalledWith(true);

      await waitFor(() => {
        expect(mockStoreState.setIsSearching).toHaveBeenCalledWith(false);
      });
    });

    it('should handle search errors gracefully', async () => {
      const error = new Error('Search failed');
      mockSearchChunks.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        try {
          await result.current.performSearch();
        } catch (e) {
          // Expected to throw
        }
      });

      expect(mockStoreState.setError).toHaveBeenCalled();
    });

    it('should prevent concurrent searches', async () => {
      mockSearchChunks.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ chunks: [], total: 0, pagination: null }), 100))
      );

      const { result } = renderHook(() => useSearchResults());

      act(() => {
        result.current.performSearch();
        result.current.performSearch(); // Second call while first is pending
      });

      await waitFor(() => {
        expect(mockSearchChunks).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Document Fetching', () => {
    it('should fetch documents by IDs after getting chunks', async () => {
      const mockChunks = [
        { document_id: 'doc-1', chunk_id: 1, chunk_text: 'text1', score: 0.9 },
        { document_id: 'doc-2', chunk_id: 2, chunk_text: 'text2', score: 0.8 },
      ];

      const mockDocuments = [
        {
          document_id: 'doc-1',
          document_type: DocumentType.JUDGMENT,
          title: 'Case 1',
        },
        {
          document_id: 'doc-2',
          document_type: DocumentType.JUDGMENT,
          title: 'Case 2',
        },
      ];

      mockSearchChunks.mockResolvedValueOnce({
        chunks: mockChunks,
        total: 2,
        pagination: null,
      });

      mockFetchDocumentsByIds.mockResolvedValueOnce({
        documents: mockDocuments,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      expect(mockFetchDocumentsByIds).toHaveBeenCalledWith(
        expect.arrayContaining(['doc-1', 'doc-2'])
      );
    });

    it('should handle missing documents gracefully', async () => {
      const mockChunks = [
        { document_id: 'doc-1', chunk_id: 1, chunk_text: 'text1', score: 0.9 },
        { document_id: 'doc-2', chunk_id: 2, chunk_text: 'text2', score: 0.8 },
      ];

      mockSearchChunks.mockResolvedValueOnce({
        chunks: mockChunks,
        total: 2,
        pagination: null,
      });

      // Return only one document (doc-2 is missing)
      mockFetchDocumentsByIds.mockResolvedValueOnce({
        documents: [
          {
            document_id: 'doc-1',
            document_type: DocumentType.JUDGMENT,
            title: 'Case 1',
          },
        ],
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      // Should not throw error
      expect(mockStoreState.setError).not.toHaveBeenCalled();
    });
  });

  describe('Pagination', () => {
    it('should handle pagination metadata', async () => {
      const paginationData = {
        current_page: 1,
        total_pages: 5,
        total_items: 50,
        has_more: true,
      };

      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total: 50,
        pagination: paginationData,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      expect(mockStoreState.setPaginationMetadata).toHaveBeenCalledWith(
        expect.objectContaining(paginationData)
      );
    });

    it('should load more results when pagination available', async () => {
      // Setup initial state with pagination
      const mockWithPagination = {
        ...mockStoreState,
        paginationMetadata: {
          current_page: 1,
          total_pages: 3,
          has_more: true,
        },
      };

      (useSearchStore as jest.Mock).mockReturnValue(mockWithPagination);

      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total: 30,
        pagination: { current_page: 2, total_pages: 3, has_more: true },
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.loadMore();
      });

      expect(mockStoreState.setIsLoadingMore).toHaveBeenCalledWith(true);
      expect(mockSearchChunks).toHaveBeenCalled();
    });

    it('should not load more when no pagination available', async () => {
      const mockNoPagination = {
        ...mockStoreState,
        paginationMetadata: null,
      };

      (useSearchStore as jest.Mock).mockReturnValue(mockNoPagination);

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.loadMore();
      });

      expect(mockSearchChunks).not.toHaveBeenCalled();
    });

    it('should not load more when already at last page', async () => {
      const mockLastPage = {
        ...mockStoreState,
        paginationMetadata: {
          current_page: 3,
          total_pages: 3,
          has_more: false,
        },
      };

      (useSearchStore as jest.Mock).mockReturnValue(mockLastPage);

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.loadMore();
      });

      expect(mockSearchChunks).not.toHaveBeenCalled();
    });
  });

  describe('Data Transformation', () => {
    it('should convert metadata to SearchDocument format', async () => {
      const mockChunks = [
        { document_id: 'doc-1', chunk_id: 1, chunk_text: 'text', score: 0.9 },
      ];

      const mockDocument = {
        document_id: 'doc-1',
        document_type: DocumentType.JUDGMENT,
        title: 'Test Case',
        summary: 'Test summary',
        date_issued: '2024-01-15',
      };

      mockSearchChunks.mockResolvedValueOnce({
        chunks: mockChunks,
        total: 1,
        pagination: null,
      });

      mockFetchDocumentsByIds.mockResolvedValueOnce({
        documents: [mockDocument],
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      expect(mockStoreState.setSearchMetadata).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            document_id: 'doc-1',
            document_type: DocumentType.JUDGMENT,
          }),
        ])
      );
    });

    it('should preserve chunk data for documents', async () => {
      const mockChunks = [
        { document_id: 'doc-1', chunk_id: 1, chunk_text: 'chunk 1', score: 0.9 },
        { document_id: 'doc-1', chunk_id: 2, chunk_text: 'chunk 2', score: 0.85 },
      ];

      mockSearchChunks.mockResolvedValueOnce({
        chunks: mockChunks,
        total: 2,
        pagination: null,
      });

      mockFetchDocumentsByIds.mockResolvedValueOnce({
        documents: [
          {
            document_id: 'doc-1',
            document_type: DocumentType.JUDGMENT,
            title: 'Case',
          },
        ],
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      expect(mockStoreState.setChunksForDocuments).toHaveBeenCalledWith(
        'doc-1',
        expect.arrayContaining([
          expect.objectContaining({ chunk_id: 1 }),
          expect.objectContaining({ chunk_id: 2 }),
        ])
      );
    });
  });

  describe('Search Type Handling', () => {
    it('should handle semantic search type', async () => {
      const semanticStore = {
        ...mockStoreState,
        searchType: 'semantic' as const,
      };

      (useSearchStore as jest.Mock).mockReturnValue(semanticStore);

      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      expect(mockSearchChunks).toHaveBeenCalledWith(
        expect.objectContaining({
          searchType: 'semantic',
        })
      );
    });

    it('should handle text search type', async () => {
      const textStore = {
        ...mockStoreState,
        searchType: 'text' as const,
      };

      (useSearchStore as jest.Mock).mockReturnValue(textStore);

      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      expect(mockSearchChunks).toHaveBeenCalledWith(
        expect.objectContaining({
          searchType: 'text',
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty search query', async () => {
      const emptyQueryStore = {
        ...mockStoreState,
        query: '',
      };

      (useSearchStore as jest.Mock).mockReturnValue(emptyQueryStore);

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      // Should either not search or handle gracefully
      expect(mockStoreState.setError).not.toHaveBeenCalled();
    });

    it('should handle search with no document types selected', async () => {
      const noTypesStore = {
        ...mockStoreState,
        documentTypes: [],
      };

      (useSearchStore as jest.Mock).mockReturnValue(noTypesStore);

      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      expect(mockSearchChunks).toHaveBeenCalled();
    });

    it('should handle very large result sets', async () => {
      const largeChunks = Array.from({ length: 1000 }, (_, i) => ({
        document_id: `doc-${i}`,
        chunk_id: i,
        chunk_text: `text ${i}`,
        score: 0.9 - i * 0.0001,
      }));

      mockSearchChunks.mockResolvedValueOnce({
        chunks: largeChunks,
        total: 1000,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      // Should handle without performance issues
      expect(mockFetchDocumentsByIds).toHaveBeenCalled();
    });

    it('should handle rapid consecutive searches', async () => {
      mockSearchChunks.mockResolvedValue({
        chunks: [],
        total: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        result.current.performSearch();
        result.current.performSearch();
        result.current.performSearch();
      });

      // Should handle gracefully without race conditions
      expect(mockStoreState.setIsSearching).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should clear cache when requested', async () => {
      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.performSearch();
      });

      expect(mockStoreState.clearChunksCache).toHaveBeenCalled();
    });

    it('should reset search state properly', async () => {
      const { result } = renderHook(() => useSearchResults());

      act(() => {
        if (result.current.resetSearch) {
          result.current.resetSearch();
        }
      });

      expect(mockStoreState.resetSearch).toHaveBeenCalled();
    });
  });
});
