import { useRef, useCallback } from 'react';
import { searchChunks, fetchDocumentsByIds, PaginationMetadata } from '@/lib/api';
import { SearchChunk, SearchDocument, DocumentType, LegalDocumentMetadata } from '@/types/search';
import { useSearchStore, isUnknownDocumentType } from '@/lib/store/searchStore';
import logger from '@/lib/logger';

const searchLogger = logger.child('useSearchResults');

// Pagination configuration for infinite scroll
const PAGE_SIZE = 10; // Documents per load (user preference)
const DEFAULT_LIMIT_CHUNKS = 150; // Chunks to fetch per request

/**
 * Hook for managing search results fetching and conversion
 * Encapsulates the two-phase search process (chunks → documents)
 */
export function useSearchResults() {
  const fullDocumentsMapRef = useRef<Map<string, SearchDocument>>(new Map());
  const searchInProgressRef = useRef(false);
  const searchIdRef = useRef(0); // Track current search to prevent race conditions
  const lastSearchParamsRef = useRef<string>(''); // Track search parameters to detect new searches

  const {
    query,
    searchType,
    documentTypes,
    selectedLanguages,
    ignoreUnknownType,
    setIsSearching,
    setError,
    clearChunksCache,
    setChunksForDocuments,
    setSearchMetadata,
    setPageSize,
    clearSelection,
    // Pagination state and actions
    paginationMetadata,
    isLoadingMore,
    cachedEstimatedTotal,
    setPaginationMetadata,
    setIsLoadingMore,
    appendSearchMetadata,
    resetSearch,
  } = useSearchStore();

  /**
   * Converts metadata to SearchDocument format for UI components
   */
  const convertMetadataToSearchDocument = useCallback(
    (metadata: LegalDocumentMetadata): SearchDocument => {
      // Get full document from ref if available
      const fullDoc = fullDocumentsMapRef.current.get(metadata.document_id);

      // If we have full document, use it; otherwise fall back to metadata
      if (fullDoc) {
        // Build metadata object from document fields
        // Backend returns fields like publication_date, source_url as top-level fields on LegalDocument
        // but SearchDocument expects them in metadata object for the UI component
        // Access fields from the JSON response (they're top-level in the backend response)
        const docAny = fullDoc as any;

        const metadataObj: SearchDocument['metadata'] = {
          ...(fullDoc.metadata || {}),
          // Map top-level fields to metadata (backend returns these as top-level in JSON response)
          // Note: 'source' is NOT a top-level field on LegalDocument, only in metadata
          // Prefer top-level fields, then nested metadata, then undefined
          publication_date: docAny.publication_date ?? fullDoc.metadata?.publication_date ?? undefined,
          source: fullDoc.metadata?.source ?? undefined, // source is ONLY in metadata, not top-level
          source_url: docAny.source_url ?? fullDoc.metadata?.source_url ?? undefined,
          ingestion_date: docAny.ingestion_date ?? fullDoc.metadata?.ingestion_date ?? undefined,
          last_updated: docAny.last_updated ?? fullDoc.metadata?.last_updated ?? undefined,
          processing_status: docAny.processing_status ?? fullDoc.metadata?.processing_status ?? undefined,
          x: docAny.x ?? fullDoc.metadata?.x ?? undefined,
          y: docAny.y ?? fullDoc.metadata?.y ?? undefined,
          raw_content: docAny.raw_content ?? fullDoc.metadata?.raw_content ?? undefined,
        };

        return {
          document_id: fullDoc.document_id,
          document_type: fullDoc.document_type,
          title: fullDoc.title,
          date_issued: fullDoc.date_issued,
          issuing_body: fullDoc.issuing_body,
          language: fullDoc.language,
          document_number: fullDoc.document_number,
          country: fullDoc.country,
          full_text: fullDoc.full_text,
          summary: fullDoc.summary,
          thesis: fullDoc.thesis,
          legal_references: fullDoc.legal_references,
          legal_concepts: fullDoc.legal_concepts,
          keywords: fullDoc.keywords,
          score: metadata.score, // Use score from metadata (search relevance)
          court_name: fullDoc.court_name,
          department_name: fullDoc.department_name,
          presiding_judge: fullDoc.presiding_judge,
          judges: fullDoc.judges,
          parties: fullDoc.parties,
          outcome: fullDoc.outcome,
          legal_bases: fullDoc.legal_bases,
          extracted_legal_bases: fullDoc.extracted_legal_bases,
          references: fullDoc.references,
          factual_state: fullDoc.factual_state,
          legal_state: fullDoc.legal_state,
          metadata: metadataObj,
        };
      }

      // Fallback to metadata-only (shouldn't happen if fetch was successful)
      return {
        document_id: metadata.document_id,
        document_type: metadata.document_type,
        title: metadata.title || null,
        date_issued: metadata.date_issued,
        language: metadata.language,
        keywords: metadata.keywords || [],
        score: metadata.score,
        // Extended fields from metadata
        summary: metadata.summary || null,
        court_name: metadata.court_name || null,
        document_number: metadata.document_number || null,
        thesis: metadata.thesis || null,
        // Fields not in metadata - set to null
        issuing_body: null,
        country: null,
        full_text: null,
        legal_references: null,
        legal_concepts: null,
        presiding_judge: null,
        judges: null,
        parties: null,
        outcome: null,
        legal_bases: null,
        extracted_legal_bases: null,
        references: null,
        factual_state: null,
        legal_state: null,
        department_name: null,
        metadata: undefined,
      };
    },
    []
  );

  /**
   * Performs a two-phase search:
   * 1. Search chunks to find relevant documents
   * 2. Fetch full document data for those documents
   */
  const search = useCallback(
    async (
      searchQuery: string,
      options?: {
        overrideMode?: 'rabbit' | 'thinking';
        overrideDocumentTypes?: DocumentType[];
        overrideLanguages?: string[];
        onComplete?: () => void;
      }
    ): Promise<void> => {
      if (!searchQuery.trim()) {
        return Promise.resolve();
      }

      // Prevent duplicate simultaneous searches (React Strict Mode guard)
      // But allow new search if previous one failed (error state exists)
      const currentError = useSearchStore.getState().error;
      if (searchInProgressRef.current && !currentError) {
        searchLogger.debug('Search already in progress, skipping duplicate request');
        return Promise.resolve();
      }
      
      // If there was a previous error, reset the ref to allow retry
      if (currentError && searchInProgressRef.current) {
        searchLogger.debug('Previous search had error, resetting ref to allow retry');
        searchInProgressRef.current = false;
      }

      const modeToUse = options?.overrideMode || searchType;
      const documentTypesToUse = options?.overrideDocumentTypes || documentTypes;
      const languagesToUse =
        options?.overrideLanguages && options.overrideLanguages.length > 0
          ? options.overrideLanguages
          : Array.from(selectedLanguages);

      searchLogger.info('Search initiated (new optimized flow)', {
        query: searchQuery,
        documentTypes: documentTypesToUse,
        selectedLanguages: languagesToUse,
        searchType: modeToUse,
      });

      // Create a unique key for this search based on parameters
      const searchParamsKey = JSON.stringify({
        query: searchQuery,
        documentTypes: documentTypesToUse,
        languages: languagesToUse,
        mode: modeToUse,
      });

      // Check if this is a truly new search (different parameters) or React Strict Mode duplicate
      const isNewSearch = lastSearchParamsRef.current !== searchParamsKey;
      lastSearchParamsRef.current = searchParamsKey;

      // Only increment searchId for truly new searches
      if (isNewSearch) {
        searchIdRef.current += 1;
      }
      const currentSearchId = searchIdRef.current;
      
      searchLogger.debug('Starting search', { 
        searchId: currentSearchId,
        isNewSearch,
        params: searchParamsKey,
      });

      // STEP 1: ALWAYS clear state when starting search (even for React Strict Mode duplicates)
      // This prevents cache corruption from parallel search calls
      setError(null);
      
      // Log before clearing to see what we're losing
      const storeBeforeClear = useSearchStore.getState();
      searchLogger.info('Clearing search state before new search', {
        chunksCacheSize: Object.keys(storeBeforeClear.chunksCache).length,
        searchMetadataCount: storeBeforeClear.searchMetadata.length,
        searchId: currentSearchId,
      });
      
      clearChunksCache(); // Clear previous chunks cache
      fullDocumentsMapRef.current.clear(); // Clear previous documents
      setSearchMetadata([], 0, false); // Clear previous search metadata
      clearSelection(); // Clear document selection
      
      // STEP 2: Mark search as in progress (triggers loading state)
      searchInProgressRef.current = true;
      setIsSearching(true);
      
      // STEP 3: Now start the actual search (async)

      try {
        // Phase 1: Search documents via chunks (chunk-based endpoint) - returns chunks only
        // Use pagination for infinite scroll - first request gets estimated total count
        const result = await searchChunks({
          query: searchQuery,
          limit_docs: PAGE_SIZE, // 10 docs per load for fast initial render
          alpha: modeToUse === 'thinking' ? 0.5 : 0.0, // Pure term search (BM25) for rabbit, hybrid for thinking
          languages: languagesToUse.length > 0 ? languagesToUse : undefined,
          document_types:
            documentTypesToUse.length > 0 ? documentTypesToUse.map((dt) => dt.toString()) : undefined,
          fetch_full_documents: false, // Don't fetch full documents - we'll fetch them in parallel
          limit_chunks: DEFAULT_LIMIT_CHUNKS,
          mode: modeToUse, // Pass mode parameter for thinking mode support
          offset: 0, // First request starts at 0
          include_count: true, // Get estimated total count on first request
        });

        // Store chunks in cache for immediate display
        const chunksByDoc: Record<string, SearchChunk[]> = {};
        result.chunks.forEach((chunk) => {
          if (!chunksByDoc[chunk.document_id]) {
            chunksByDoc[chunk.document_id] = [];
          }
          chunksByDoc[chunk.document_id].push(chunk);
        });

        searchLogger.info('Storing chunks in cache', {
          totalChunks: result.chunks.length,
          documentsWithChunks: Object.keys(chunksByDoc).length,
          documentIds: Object.keys(chunksByDoc),
          searchId: currentSearchId,
        });

        // Check if a new search has been initiated (different parameters)
        // Don't check for React Strict Mode duplicates (same searchId is OK)
        if (searchIdRef.current !== currentSearchId) {
          searchLogger.warn('Search ID mismatch, a new search was initiated, discarding stale chunks', {
            currentSearchId,
            latestSearchId: searchIdRef.current,
          });
          return; // Discard chunks from old search
        }

        // Update chunks cache immediately - batch all updates in a single state update
        // This ensures Zustand detects the change and triggers re-renders for all documents
        const store = useSearchStore.getState();
        const newCache = { ...store.chunksCache };
        const newLoading = [...store.loadingChunks];
        
        Object.entries(chunksByDoc).forEach(([docId, chunks]) => {
          newCache[docId] = chunks;
          // Remove from loading if present
          const loadingIndex = newLoading.indexOf(docId);
          if (loadingIndex > -1) {
            newLoading.splice(loadingIndex, 1);
          }
        });
        
        // Single state update for all chunks
        useSearchStore.setState({
          chunksCache: newCache,
          loadingChunks: newLoading
        });

        // Verify chunks were stored correctly
        const storeAfterSet = useSearchStore.getState();
        const storedDocIds = Object.keys(storeAfterSet.chunksCache);
        const expectedDocIds = Object.keys(chunksByDoc);
        const missingInStore = expectedDocIds.filter(id => !storedDocIds.includes(id));
        
        searchLogger.info('Chunks stored in cache', {
          expectedDocumentIds: expectedDocIds.length,
          storedDocumentIds: storedDocIds.length,
          missingInStore: missingInStore.length > 0 ? missingInStore.slice(0, 10) : [],
          sampleStoredDocIds: storedDocIds.slice(0, 10),
          searchId: currentSearchId,
        });

        if (missingInStore.length > 0) {
          searchLogger.error(
            `CRITICAL: ${missingInStore.length} document IDs were NOT stored in chunksCache! ` +
            `Expected: ${expectedDocIds.length}, Stored: ${storedDocIds.length}. ` +
            `Missing IDs: ${missingInStore.slice(0, 20).join(', ')}`
          );
        }

        searchLogger.info('Chunk search completed, now fetching full documents', {
          chunkCount: result.chunks.length,
          uniqueDocuments: result.unique_documents,
          queryTimeMs: result.query_time_ms,
        });

        // Phase 2: Fetch ALL documents in ONE batch (optimized with return_properties) - AWAIT IT!
        const allDocumentIds = Array.from(new Set(result.chunks.map((chunk) => chunk.document_id)));

        searchLogger.info('Fetching full documents for chunks', {
          uniqueDocumentIds: allDocumentIds.length,
          totalChunks: result.chunks.length,
          sampleDocumentIds: allDocumentIds.slice(0, 10),
          searchId: currentSearchId,
        });

        // Fetch all documents with only needed properties - WAIT for them before rendering
        const docResponse = await fetchDocumentsByIds({
          document_ids: allDocumentIds,
          return_properties: [
            'title',
            'document_number',
            'document_type',
            'summary',
            'keywords',
            'court_name',
            'presiding_judge',
            'date_issued',
            'language',
            'country',
            'judges',
            'parties',
            'outcome',
            'legal_bases',
            'extracted_legal_bases',
            'references',
            'factual_state',
            'legal_state',
            'department_name',
            'issuing_body',
            'publication_date',
            'source',
            'source_url',
            'ingestion_date',
            'last_updated',
            'processing_status',
            'x',
            'y',
          ],
        });

        const fetchedDocumentIds = new Set(docResponse.documents.map(doc => doc.document_id));
        const missingDocumentIds = allDocumentIds.filter(id => !fetchedDocumentIds.has(id));
        
        searchLogger.info('All documents fetched in one batch', {
          documentCount: docResponse.documents.length,
          requestedCount: allDocumentIds.length,
          missingCount: missingDocumentIds.length,
          missingDocumentIds: missingDocumentIds.slice(0, 20), // Log first 20 missing IDs
          searchId: currentSearchId,
        });

        if (missingDocumentIds.length > 0) {
          searchLogger.warn(
            `Only ${docResponse.documents.length} out of ${allDocumentIds.length} documents were found. ` +
            `${missingDocumentIds.length} documents referenced by chunks do not exist in the database. ` +
            `This indicates a data consistency issue - chunks exist for documents that were deleted or never ingested. ` +
            `Missing document IDs (first 20): ${missingDocumentIds.slice(0, 20).join(', ')}`
          );
        }

        // Check if a new search has been initiated (different parameters)
        if (searchIdRef.current !== currentSearchId) {
          searchLogger.warn('Search ID mismatch after fetching documents, a new search was initiated, discarding stale data', {
            currentSearchId,
            latestSearchId: searchIdRef.current,
          });
          return; // Discard documents from old search
        }

        // Create document map for fast lookup
        const docMap = new Map(docResponse.documents.map((doc) => [doc.document_id, doc]));

        // Store full documents in ref for use in convertMetadataToSearchDocument
        fullDocumentsMapRef.current.clear();
        docResponse.documents.forEach((doc) => {
          fullDocumentsMapRef.current.set(doc.document_id, doc);
        });

        // Convert chunks to metadata format WITH full document data
        // IMPORTANT: Include ALL chunks, even if the parent document doesn't exist
        // This handles data consistency issues where chunks exist but documents don't
        // CRITICAL: We create metadata for ALL chunks to ensure documents with missing IDs are still displayed
        const metadata: LegalDocumentMetadata[] = result.chunks.map((chunk) => {
          const score = chunk.confidence_score ?? chunk.score ?? null;
          const fullDoc = docMap.get(chunk.document_id);
          const hasFullDoc = !!fullDoc;

          // Log warning if chunk references a missing document
          if (!hasFullDoc) {
            searchLogger.warn(
              `Chunk ${chunk.chunk_id} references document ${chunk.document_id} which does not exist in database. ` +
              `Using chunk data as fallback.`
            );
          }

          // CRITICAL: All chunks are guaranteed to have document_type - use ONLY chunk.document_type
          // ONLY TWO VALID TYPES: JUDGMENT and TAX_INTERPRETATION - throw exception if invalid or missing
          if (!chunk.document_type) {
            throw new Error(
              `Missing document_type in chunk for document ${chunk.document_id}, chunk ${chunk.chunk_id}. ` +
              `All chunks are guaranteed to have document_type.`
            );
          }
          
          // Parse document_type from chunk - only JUDGMENT and TAX_INTERPRETATION are valid
          const normalized = String(chunk.document_type).toLowerCase().trim();
          let docType: DocumentType;
          
          if (normalized === 'judgment' || normalized === 'judgement') {
            docType = DocumentType.JUDGMENT;
          } else if (normalized === 'tax_interpretation' || normalized === 'tax interpretation') {
            docType = DocumentType.TAX_INTERPRETATION;
          } else {
            throw new Error(
              `Invalid document_type in chunk: "${chunk.document_type}" for document ${chunk.document_id}, chunk ${chunk.chunk_id}. ` +
              `Only JUDGMENT and TAX_INTERPRETATION are valid. Got: "${chunk.document_type}"`
            );
          }

          return {
            uuid: `${chunk.document_id}_chunk_${chunk.chunk_id}`, // Generate UUID from document_id and chunk_id
            document_id: chunk.document_id,
            document_type: docType, // Always one of the two valid types: JUDGMENT or TAX_INTERPRETATION
            language: fullDoc ? fullDoc.language || '' : chunk.language || '', // Use empty string as default since language is required
            keywords: fullDoc
              ? fullDoc.keywords || []
              : chunk.tags
                ? Array.isArray(chunk.tags)
                  ? chunk.tags
                  : [chunk.tags]
                : [],
            // IMPORTANT: On main, date filtering falls back to publication_date
            // when date_issued is missing. For tax interpretations we also have
            // ETL-specific fields like issue_date. To keep behaviour consistent
            // across document types, we store a unified "effective date" in
            // date_issued, drawing from all known sources.
            date_issued: fullDoc
              ? (() => {
                  const docAny = fullDoc as any;
                  const meta = (fullDoc as any).metadata || {};
                  return (
                    // Canonical issued date (judgments, some interpretations)
                    fullDoc.date_issued ||
                    // Publication date (often set for court judgments)
                    docAny.publication_date ||
                    meta.publication_date ||
                    // Tax interpretation specific: original "issue_date" field
                    docAny.issue_date ||
                    meta.issue_date ||
                    // Historical/legacy naming used in some extraction configs
                    meta.interpretation_date ||
                    null
                  );
                })()
              : null,
            score: score,
            title: fullDoc ? fullDoc.title : null,
            summary: fullDoc ? fullDoc.summary : null,
            court_name: fullDoc ? fullDoc.court_name : null,
            document_number: fullDoc ? fullDoc.document_number : null,
            thesis: fullDoc ? fullDoc.thesis : null,
          };
        });

        // CRITICAL: Do NOT filter out any documents - display ALL chunks including unknown types and missing IDs
        // All documents should be displayed regardless of document_type or whether full document exists
        const filteredMetadata = metadata;

        // Log how many metadata entries we have for documents with/without full docs
        const metadataWithFullDoc = filteredMetadata.filter(m => {
          const fullDoc = docMap.get(m.document_id);
          return !!fullDoc;
        });
        const metadataWithoutFullDoc = filteredMetadata.filter(m => {
          const fullDoc = docMap.get(m.document_id);
          return !fullDoc;
        });
        
        searchLogger.info('Metadata created from chunks', {
          totalMetadata: filteredMetadata.length,
          metadataWithFullDoc: metadataWithFullDoc.length,
          metadataWithoutFullDoc: metadataWithoutFullDoc.length,
          uniqueDocIdsWithFullDoc: new Set(metadataWithFullDoc.map(m => m.document_id)).size,
          uniqueDocIdsWithoutFullDoc: new Set(metadataWithoutFullDoc.map(m => m.document_id)).size,
          sampleDocIdsWithoutFullDoc: Array.from(new Set(metadataWithoutFullDoc.map(m => m.document_id))).slice(0, 10),
          searchId: currentSearchId,
        });

        // CRITICAL: Log chunks cache state after filtering to diagnose missing chunks
        const storeAfterFilter = useSearchStore.getState();
        const uniqueDocIdsInMetadata = new Set(filteredMetadata.map(m => m.document_id));
        const chunksInCache = Object.keys(storeAfterFilter.chunksCache);
        const missingChunksForMetadata = Array.from(uniqueDocIdsInMetadata).filter(
          docId => !chunksInCache.includes(docId)
        );
        
        searchLogger.info('Metadata filtering and chunks cache check', {
          totalMetadata: metadata.length,
          filteredMetadata: filteredMetadata.length,
          uniqueDocumentsInMetadata: uniqueDocIdsInMetadata.size,
          chunksInCacheCount: chunksInCache.length,
          missingChunksForMetadata: missingChunksForMetadata.slice(0, 10),
          sampleMetadataDocIds: Array.from(uniqueDocIdsInMetadata).slice(0, 10),
          sampleChunksCacheDocIds: chunksInCache.slice(0, 10),
          searchId: currentSearchId,
        });

        if (missingChunksForMetadata.length > 0) {
          searchLogger.error(
            `CRITICAL: ${missingChunksForMetadata.length} documents in metadata have NO chunks in cache! ` +
            `This means chunks were not stored or were cleared. Missing document IDs: ${missingChunksForMetadata.slice(0, 20).join(', ')}`
          );
        }

        // Sort metadata by score (descending - highest score first)
        // Chunks from backend are already sorted, but ensure we maintain that order
        filteredMetadata.sort((a, b) => {
          const scoreA = a.score ?? -Infinity;
          const scoreB = b.score ?? -Infinity;
          return scoreB - scoreA; // Descending order (highest score first)
        });

        // No longer limiting to 50 - we use pagination from backend now
        const finalMetadata = filteredMetadata;

        // CRITICAL: Verify chunks are still in cache before storing metadata
        const storeBeforeMetadata = useSearchStore.getState();
        const finalMetadataDocIds = new Set(finalMetadata.map(m => m.document_id));
        const chunksCacheDocIds = new Set(Object.keys(storeBeforeMetadata.chunksCache));
        const missingChunksBeforeMetadata = Array.from(finalMetadataDocIds).filter(
          docId => !chunksCacheDocIds.has(docId)
        );
        
        if (missingChunksBeforeMetadata.length > 0) {
          searchLogger.error(
            `CRITICAL: ${missingChunksBeforeMetadata.length} documents in finalMetadata have NO chunks in cache BEFORE storing metadata! ` +
            `This means chunks were lost between storing and metadata creation. ` +
            `Missing document IDs: ${missingChunksBeforeMetadata.slice(0, 20).join(', ')}`
          );
        }

        // Store metadata with full document data and pagination info
        // Ensure error is cleared on successful search
        setError(null);
        setSearchMetadata(finalMetadata, finalMetadata.length, false);

        // Store pagination metadata for infinite scroll
        if (result.pagination) {
          setPaginationMetadata(result.pagination);
          searchLogger.info('Pagination metadata stored', {
            offset: result.pagination.offset,
            loaded_count: result.pagination.loaded_count,
            estimated_total: result.pagination.estimated_total,
            has_more: result.pagination.has_more,
            next_offset: result.pagination.next_offset,
          });
        }

        setPageSize(10);
        clearSelection();
        setIsSearching(false); // Stop loading spinner - now render with FULL data!
        
        // Final verification after metadata is stored
        const storeAfterMetadata = useSearchStore.getState();
        const chunksAfterMetadata = Object.keys(storeAfterMetadata.chunksCache);
        searchLogger.info('Final state after search completion', {
          metadataCount: finalMetadata.length,
          uniqueMetadataDocIds: finalMetadataDocIds.size,
          chunksCacheSize: chunksAfterMetadata.length,
          chunksCacheDocIds: chunksAfterMetadata.slice(0, 10),
          searchId: currentSearchId,
        });

        searchLogger.info('Search completed with full document metadata', {
          chunkCount: result.chunks.length,
          uniqueDocuments: result.unique_documents,
          documentsWithFullData: metadata.filter((m) => m.title !== null).length,
        });

        // Call onComplete callback if provided
        if (options?.onComplete) {
          options.onComplete();
        }
      } catch (err) {
        searchLogger.error('Search failed', err, {
          query: searchQuery,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        // Clear metadata and set error state
        setSearchMetadata([], 0, false); // Clear results
        setError('search_error');
        setIsSearching(false);
      } finally {
        // Always reset the flag to allow new searches
        searchInProgressRef.current = false;
      }
    },
    [
      searchType,
      documentTypes,
      selectedLanguages,
      setIsSearching,
      setError,
      clearChunksCache,
      setSearchMetadata,
      setPageSize,
      clearSelection,
      setPaginationMetadata,
    ]
  );

  /**
   * Loads more results for infinite scroll
   * Uses offset from pagination metadata to fetch next batch
   */
  const loadMore = useCallback(async (): Promise<void> => {
    // Get current state from store
    const state = useSearchStore.getState();
    const currentPagination = state.paginationMetadata;

    // Guard: Can't load more if no pagination data or no more results
    if (!currentPagination?.has_more || currentPagination.next_offset === null) {
      searchLogger.debug('loadMore called but no more results available');
      return;
    }

    // Guard: Don't start if already loading
    if (state.isLoadingMore) {
      searchLogger.debug('loadMore called but already loading');
      return;
    }

    searchLogger.info('Loading more results', {
      currentOffset: currentPagination.offset,
      nextOffset: currentPagination.next_offset,
      loadedCount: currentPagination.loaded_count,
      estimatedTotal: state.cachedEstimatedTotal,
    });

    setIsLoadingMore(true);

    try {
      // Fetch next batch with offset
      const result = await searchChunks({
        query: state.query,
        limit_docs: PAGE_SIZE,
        alpha: state.searchType === 'thinking' ? 0.5 : 0.0,
        languages: Array.from(state.selectedLanguages),
        document_types:
          state.documentTypes.length > 0
            ? state.documentTypes.map((dt) => dt.toString())
            : undefined,
        fetch_full_documents: false,
        limit_chunks: DEFAULT_LIMIT_CHUNKS,
        mode: state.searchType,
        offset: currentPagination.next_offset, // Use next offset from pagination
        include_count: false, // Don't re-fetch count on subsequent requests
      });

      // Process chunks and cache them
      const chunksByDoc: Record<string, SearchChunk[]> = {};
      result.chunks.forEach((chunk) => {
        if (!chunksByDoc[chunk.document_id]) {
          chunksByDoc[chunk.document_id] = [];
        }
        chunksByDoc[chunk.document_id].push(chunk);
      });

      // Batch update chunks cache
      const currentStore = useSearchStore.getState();
      const newCache = { ...currentStore.chunksCache };
      Object.entries(chunksByDoc).forEach(([docId, chunks]) => {
        newCache[docId] = chunks;
      });
      useSearchStore.setState({ chunksCache: newCache });

      // Fetch full documents for the new chunks
      const newDocumentIds = Array.from(new Set(result.chunks.map((c) => c.document_id)));

      searchLogger.info('Fetching full documents for loadMore', {
        documentIds: newDocumentIds,
        count: newDocumentIds.length,
      });

      const docResponse = await fetchDocumentsByIds({
        document_ids: newDocumentIds,
        return_properties: [
          'title',
          'document_number',
          'document_type',
          'summary',
          'keywords',
          'court_name',
          'presiding_judge',
          'date_issued',
          'language',
          'country',
          'judges',
          'parties',
          'outcome',
          'legal_bases',
          'extracted_legal_bases',
          'references',
          'factual_state',
          'legal_state',
          'department_name',
          'issuing_body',
          'publication_date',
          'source',
          'source_url',
          'ingestion_date',
          'last_updated',
          'processing_status',
          'x',
          'y',
        ],
      });

      searchLogger.info('Full documents fetched for loadMore', {
        fetched: docResponse.documents.length,
        requested: newDocumentIds.length,
      });

      // Store full documents in ref
      docResponse.documents.forEach((doc) => {
        fullDocumentsMapRef.current.set(doc.document_id, doc);
      });

      // Create document map
      const docMap = new Map(docResponse.documents.map((doc) => [doc.document_id, doc]));

      // Convert chunks to metadata - matching initial search logic
      const newMetadata: LegalDocumentMetadata[] = result.chunks.map((chunk) => {
        const score = chunk.confidence_score ?? chunk.score ?? null;
        const fullDoc = docMap.get(chunk.document_id);

        // Log if document is missing
        if (!fullDoc) {
          searchLogger.warn(
            `loadMore: Chunk ${chunk.chunk_id} references document ${chunk.document_id} which does not exist in database. ` +
            `Using chunk data as fallback.`
          );
        }

        // Parse document_type from chunk - only JUDGMENT and TAX_INTERPRETATION are valid
        const normalized = String(chunk.document_type).toLowerCase().trim();
        let docType: DocumentType;
        if (normalized === 'judgment' || normalized === 'judgement') {
          docType = DocumentType.JUDGMENT;
        } else if (normalized === 'tax_interpretation' || normalized === 'tax interpretation') {
          docType = DocumentType.TAX_INTERPRETATION;
        } else {
          docType = DocumentType.ERROR; // Fallback for unknown types
        }

        return {
          uuid: `${chunk.document_id}_chunk_${chunk.chunk_id}`,
          document_id: chunk.document_id,
          document_type: docType,
          language: fullDoc?.language || chunk.language || '',
          keywords: fullDoc?.keywords || (chunk.tags ? (Array.isArray(chunk.tags) ? chunk.tags : [chunk.tags]) : []),
          // Match initial search date handling - check all possible date sources
          date_issued: fullDoc
            ? (() => {
                const docAny = fullDoc as any;
                const meta = (fullDoc as any).metadata || {};
                return (
                  // Canonical issued date (judgments, some interpretations)
                  fullDoc.date_issued ||
                  // Publication date (often set for court judgments)
                  docAny.publication_date ||
                  meta.publication_date ||
                  // Tax interpretation specific: original "issue_date" field
                  docAny.issue_date ||
                  meta.issue_date ||
                  // Historical/legacy naming
                  meta.interpretation_date ||
                  null
                );
              })()
            : null,
          score,
          title: fullDoc?.title || null,
          summary: fullDoc?.summary || null,
          court_name: fullDoc?.court_name || null,
          document_number: fullDoc?.document_number || null,
          thesis: fullDoc?.thesis || null,
        };
      });

      // Append new metadata to existing
      appendSearchMetadata(newMetadata);

      // Update pagination metadata (preserve cached estimated total)
      // Use unique document count, not chunk count for loaded_count
      const uniqueNewDocCount = newDocumentIds.length;
      if (result.pagination) {
        const updatedPagination: PaginationMetadata = {
          ...result.pagination,
          estimated_total: state.cachedEstimatedTotal, // Preserve from first request
          loaded_count: (currentPagination.loaded_count || 0) + uniqueNewDocCount,
        };
        setPaginationMetadata(updatedPagination);
      }

      searchLogger.info('Load more completed', {
        newChunks: result.chunks.length,
        newDocuments: uniqueNewDocCount,
        totalLoaded: (currentPagination.loaded_count || 0) + uniqueNewDocCount,
        hasMore: result.pagination?.has_more,
      });
    } catch (err) {
      searchLogger.error('Load more failed', err);
      setError('load_more_error');
    } finally {
      setIsLoadingMore(false);
    }
  }, [setIsLoadingMore, appendSearchMetadata, setPaginationMetadata, setError]);

  return {
    search,
    loadMore,
    isLoadingMore,
    paginationMetadata,
    cachedEstimatedTotal,
    convertMetadataToSearchDocument,
    fullDocumentsMapRef,
  };
}
