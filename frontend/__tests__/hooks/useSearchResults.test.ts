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
    error: null,
    isSearching: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useSearchStore as unknown as jest.Mock).mockReturnValue(mockStoreState);
  });

  describe('Hook Initialization', () => {
    it('should initialize without errors', () => {
      const { result } = renderHook(() => useSearchResults());

      expect(result.current).toBeDefined();
    });

    it('should provide search function', () => {
      const { result } = renderHook(() => useSearchResults());

      expect(typeof result.current.search).toBe('function');
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
        total_chunks: 0,
        unique_documents: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
      });

      expect(mockSearchChunks).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'contract law',
        })
      );
    });

    it('should set loading state during search', async () => {
      mockSearchChunks.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          chunks: [],
          total_chunks: 0,
          unique_documents: 0,
          pagination: null,
        }), 100))
      );

      const { result } = renderHook(() => useSearchResults());

      act(() => {
        result.current.search('contract law');
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
          await result.current.search('contract law');
        } catch (e) {
          // Expected to throw
        }
      });

      expect(mockStoreState.setError).toHaveBeenCalled();
    });

    it('should prevent concurrent searches', async () => {
      mockSearchChunks.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          chunks: [],
          total_chunks: 0,
          unique_documents: 0,
          pagination: null,
        }), 100))
      );

      const { result } = renderHook(() => useSearchResults());

      act(() => {
        result.current.search('contract law');
        result.current.search('contract law'); // Second call while first is pending
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
          date_issued: null,
          issuing_body: null,
          language: 'en',
          document_number: null,
          country: null,
          full_text: null,
          summary: null,
          thesis: null,
          legal_references: null,
          legal_concepts: null,
          keywords: null,
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
        },
        {
          document_id: 'doc-2',
          document_type: DocumentType.JUDGMENT,
          title: 'Case 2',
          date_issued: null,
          issuing_body: null,
          language: 'en',
          document_number: null,
          country: null,
          full_text: null,
          summary: null,
          thesis: null,
          legal_references: null,
          legal_concepts: null,
          keywords: null,
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
        },
      ];

      mockSearchChunks.mockResolvedValueOnce({
        chunks: mockChunks,
        total_chunks: 2,
        unique_documents: 2,
        pagination: null,
      });

      mockFetchDocumentsByIds.mockResolvedValueOnce({
        documents: mockDocuments,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
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
        total_chunks: 2,
        unique_documents: 2,
        pagination: null,
      });

      // Return only one document (doc-2 is missing)
      mockFetchDocumentsByIds.mockResolvedValueOnce({
        documents: [
          {
            document_id: 'doc-1',
            document_type: DocumentType.JUDGMENT,
            title: 'Case 1',
            date_issued: null,
            issuing_body: null,
            language: 'en',
            document_number: null,
            country: null,
            full_text: null,
            summary: null,
            thesis: null,
            legal_references: null,
            legal_concepts: null,
            keywords: null,
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
          },
        ],
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
      });

      // Should not throw error
      expect(mockStoreState.setError).not.toHaveBeenCalled();
    });
  });

  describe('Pagination', () => {
    it('should handle pagination metadata', async () => {
      const paginationData = {
        offset: 0,
        limit: 10,
        loaded_count: 10,
        estimated_total: 50,
        has_more: true,
        next_offset: 10,
      };

      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total_chunks: 50,
        unique_documents: 10,
        pagination: paginationData,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
      });

      expect(mockStoreState.setPaginationMetadata).toHaveBeenCalledWith(
        expect.objectContaining({ has_more: true })
      );
    });

    it('should load more results when pagination available', async () => {
      // Setup initial state with pagination
      const mockWithPagination = {
        ...mockStoreState,
        paginationMetadata: {
          offset: 0,
          limit: 10,
          loaded_count: 10,
          estimated_total: 30,
          has_more: true,
          next_offset: 10,
        },
      };

      (useSearchStore as unknown as jest.Mock).mockReturnValue(mockWithPagination);

      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total_chunks: 30,
        unique_documents: 10,
        pagination: {
          offset: 10,
          limit: 10,
          loaded_count: 20,
          estimated_total: 30,
          has_more: true,
          next_offset: 20,
        },
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

      (useSearchStore as unknown as jest.Mock).mockReturnValue(mockNoPagination);

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
          offset: 20,
          limit: 10,
          loaded_count: 30,
          estimated_total: 30,
          has_more: false,
          next_offset: null,
        },
      };

      (useSearchStore as unknown as jest.Mock).mockReturnValue(mockLastPage);

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
        issuing_body: null,
        language: 'en',
        document_number: null,
        country: null,
        full_text: null,
        thesis: null,
        legal_references: null,
        legal_concepts: null,
        keywords: null,
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
      };

      mockSearchChunks.mockResolvedValueOnce({
        chunks: mockChunks,
        total_chunks: 1,
        unique_documents: 1,
        pagination: null,
      });

      mockFetchDocumentsByIds.mockResolvedValueOnce({
        documents: [mockDocument],
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
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
        total_chunks: 2,
        unique_documents: 1,
        pagination: null,
      });

      mockFetchDocumentsByIds.mockResolvedValueOnce({
        documents: [
          {
            document_id: 'doc-1',
            document_type: DocumentType.JUDGMENT,
            title: 'Case',
            date_issued: null,
            issuing_body: null,
            language: 'en',
            document_number: null,
            country: null,
            full_text: null,
            summary: null,
            thesis: null,
            legal_references: null,
            legal_concepts: null,
            keywords: null,
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
          },
        ],
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
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

      (useSearchStore as unknown as jest.Mock).mockReturnValue(semanticStore);

      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total_chunks: 0,
        unique_documents: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
      });

      expect(mockSearchChunks).toHaveBeenCalled();
    });

    it('should handle text search type', async () => {
      const textStore = {
        ...mockStoreState,
        searchType: 'text' as const,
      };

      (useSearchStore as unknown as jest.Mock).mockReturnValue(textStore);

      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total_chunks: 0,
        unique_documents: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
      });

      expect(mockSearchChunks).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty search query', async () => {
      const emptyQueryStore = {
        ...mockStoreState,
        query: '',
      };

      (useSearchStore as unknown as jest.Mock).mockReturnValue(emptyQueryStore);

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('');
      });

      // Should either not search or handle gracefully
      expect(mockStoreState.setError).not.toHaveBeenCalled();
    });

    it('should handle search with no document types selected', async () => {
      const noTypesStore = {
        ...mockStoreState,
        documentTypes: [],
      };

      (useSearchStore as unknown as jest.Mock).mockReturnValue(noTypesStore);

      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total_chunks: 0,
        unique_documents: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
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
        total_chunks: 1000,
        unique_documents: 1000,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
      });

      // Should handle without performance issues
      expect(mockFetchDocumentsByIds).toHaveBeenCalled();
    });

    it('should handle rapid consecutive searches', async () => {
      mockSearchChunks.mockResolvedValue({
        chunks: [],
        total_chunks: 0,
        unique_documents: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        result.current.search('contract law');
        result.current.search('contract law');
        result.current.search('contract law');
      });

      // Should handle gracefully without race conditions
      expect(mockStoreState.setIsSearching).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should clear cache when requested', async () => {
      mockSearchChunks.mockResolvedValueOnce({
        chunks: [],
        total_chunks: 0,
        unique_documents: 0,
        pagination: null,
      });

      const { result } = renderHook(() => useSearchResults());

      await act(async () => {
        await result.current.search('contract law');
      });

      expect(mockStoreState.clearChunksCache).toHaveBeenCalled();
    });

    it('should have convertMetadataToSearchDocument function', () => {
      const { result } = renderHook(() => useSearchResults());

      expect(typeof result.current.convertMetadataToSearchDocument).toBe('function');
    });
  });
});
