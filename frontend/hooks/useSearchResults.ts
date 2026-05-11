import { useRef, useCallback } from 'react';
import {
  searchChunks,
  searchDocumentsMeili,
  fetchDocumentsByIds,
  PaginationMetadata,
  MeilisearchDocumentHit,
} from '@/lib/api';
import { SearchChunk, SearchDocument, LegalDocumentMetadata } from '@/types/search';
import {
  BaseFilters,
  BaseNumericRange,
  SearchMode,
  useSearchStore,
} from '@/lib/store/searchStore';
import logger from '@/lib/logger';

const searchLogger = logger.child('useSearchResults');

// Pagination configuration for infinite scroll
const PAGE_SIZE = 10; // Documents per load (user preference)
const DEFAULT_LIMIT_CHUNKS = 150; // Chunks to fetch per request

const BASE_FILTER_FIELDS: Record<keyof BaseFilters, string> = {
  numVictims: 'base_num_victims',
  victimAgeOffence: 'base_victim_age_offence',
  caseNumber: 'base_case_number',
  coDefAccNum: 'base_co_def_acc_num',
  appealJudgmentDate: 'base_date_of_appeal_court_judgment_ts',
};

function rangeToClause(field: string, range: BaseNumericRange): string | null {
  const parts: string[] = [];
  if (typeof range.min === 'number') parts.push(`${field} >= ${range.min}`);
  if (typeof range.max === 'number') parts.push(`${field} <= ${range.max}`);
  return parts.length ? parts.join(' AND ') : null;
}

function languagesToJurisdictionClause(languages: string[]): string | null {
  const jurisdictions = new Set<string>();
  for (const lang of languages) {
    const lc = lang.toLowerCase();
    if (lc === 'pl') jurisdictions.add('PL');
    else if (lc === 'uk' || lc === 'en') jurisdictions.add('UK');
  }
  if (!jurisdictions.size) return null;
  return Array.from(jurisdictions)
    .map((j) => `jurisdiction = "${j}"`)
    .join(' OR ');
}

export function buildMeilisearchFilter(
  baseFilters: BaseFilters,
  languages: string[]
): string | undefined {
  const clauses: string[] = [];
  const lang = languagesToJurisdictionClause(languages);
  if (lang) clauses.push(`(${lang})`);
  for (const [key, fieldName] of Object.entries(BASE_FILTER_FIELDS) as Array<
    [keyof BaseFilters, string]
  >) {
    const range = baseFilters[key];
    if (!range) continue;
    const clause = rangeToClause(fieldName, range);
    if (clause) clauses.push(`(${clause})`);
  }
  return clauses.length ? clauses.join(' AND ') : undefined;
}

export function meiliHitToSearchDocument(hit: MeilisearchDocumentHit): SearchDocument {
  const formatted = hit._formatted;
  return {
    document_id: hit.id,
    title: (hit.title || '').trim() || null,
    date_issued: hit.decision_date || null,
    issuing_body: null,
    language: hit.jurisdiction === 'PL' ? 'pl' : hit.jurisdiction === 'UK' ? 'en' : null,
    document_number: hit.case_number || null,
    country: hit.jurisdiction || null,
    full_text: null,
    summary: (hit.summary || '').trim() || null,
    thesis: null,
    legal_references: null,
    legal_concepts: null,
    keywords: hit.keywords || null,
    score: null,
    court_name: hit.court_name || null,
    department_name: null,
    presiding_judge: null,
    judges: hit.judges_flat
      ? hit.judges_flat
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    parties: null,
    outcome: hit.outcome || null,
    legal_bases: hit.cited_legislation || null,
    extracted_legal_bases: null,
    references: null,
    factual_state: null,
    legal_state: null,
    metadata: {
      source_url: hit.source_url || undefined,
      publication_date: hit.publication_date || undefined,
    },
    highlighted: formatted
      ? {
          title: formatted.title ?? null,
          summary: formatted.summary ?? null,
        }
      : null,
  };
}

function meiliHitToMetadata(
  hit: MeilisearchDocumentHit,
  rankFromTop: number
): LegalDocumentMetadata {
  // Synthesized rank-based score so existing UI sort/badge code keeps working.
  const score = Math.max(0.0, 1 - rankFromTop * 0.001);
  return {
    uuid: `meili_${hit.id}`,
    document_id: hit.id,
    language: hit.jurisdiction === 'PL' ? 'pl' : hit.jurisdiction === 'UK' ? 'en' : '',
    keywords: hit.keywords || [],
    date_issued: hit.decision_date || null,
    score,
    title: hit.title || null,
    summary: hit.summary || null,
    court_name: hit.court_name || null,
    document_number: hit.case_number || null,
    thesis: null,
    jurisdiction: hit.jurisdiction || null,
    court_level: hit.court_level || null,
    highlighted: hit._formatted
      ? {
          title: hit._formatted.title ?? null,
          summary: hit._formatted.summary ?? null,
        }
      : null,
  };
}

// Card-view fields requested in the rare fallback case where the search response
// did not embed the documents (Tasks 6/7 trim this further on the backend).
const CARD_RETURN_PROPERTIES = [
  'title',
  'document_number',
  'summary',
  'keywords',
  'court_name',
  'presiding_judge',
  'date_issued',
  'language',
  'country',
  'publication_date',
  'source_url',
];

/**
 * Hook for managing search results fetching and conversion
 * Encapsulates the search process (chunks + embedded documents → metadata)
 */
export function useSearchResults() {
  const fullDocumentsMapRef = useRef<Map<string, SearchDocument>>(new Map());
  const searchInProgressRef = useRef(false);
  const searchIdRef = useRef(0); // Track current search to prevent race conditions
  const lastSearchParamsRef = useRef<string>(''); // Track search parameters to detect new searches

  const {
    searchType,
    searchMode,
    baseFilters,
    selectedLanguages,
    setIsSearching,
    setError,
    clearChunksCache,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          highlighted: metadata.highlighted ?? null,
        };
      }

      // Fallback to metadata-only (shouldn't happen if fetch was successful)
      return {
        document_id: metadata.document_id,
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
        highlighted: metadata.highlighted ?? null,
      };
    },
    []
  );

  /**
   * Builds metadata for a chunk + (optional) full document. Centralised so the
   * date-fallback logic stays consistent between initial search and loadMore.
   */
  const buildMetadataForChunk = useCallback(
    (chunk: SearchChunk, fullDoc: SearchDocument | undefined): LegalDocumentMetadata => {
      const score = chunk.confidence_score ?? chunk.score ?? null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docAny = fullDoc as any;
      const meta = (fullDoc?.metadata as Record<string, unknown> | undefined) || {};

      const dateIssued = fullDoc
        ? (fullDoc.date_issued ||
            (typeof docAny.publication_date === 'string' ? docAny.publication_date : null) ||
            (typeof meta.publication_date === 'string' ? (meta.publication_date as string) : null) ||
            null)
        : null;

      return {
        uuid: `${chunk.document_id}_chunk_${chunk.chunk_id}`,
        document_id: chunk.document_id,
        language: fullDoc ? fullDoc.language || '' : chunk.language || '',
        keywords: fullDoc
          ? fullDoc.keywords || []
          : chunk.tags
            ? Array.isArray(chunk.tags)
              ? chunk.tags
              : [chunk.tags]
            : [],
        date_issued: dateIssued,
        score,
        title: fullDoc?.title || null,
        summary: fullDoc?.summary || null,
        court_name: fullDoc?.court_name || null,
        document_number: fullDoc?.document_number || null,
        thesis: fullDoc?.thesis || null,
      };
    },
    []
  );

  /**
   * Performs a search:
   * 1. Search chunks (the response now includes the matching documents).
   * 2. Build per-chunk metadata using the embedded documents.
   * 3. Only fall back to a follow-up document fetch when chunks reference docs
   *    not present in `result.documents`.
   */
  const search = useCallback(
    async (
      searchQuery: string,
      options?: {
        overrideMode?: "thinking" | "rabbit";
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
      const languagesToUse =
        options?.overrideLanguages && options.overrideLanguages.length > 0
          ? options.overrideLanguages
          : Array.from(selectedLanguages);

      searchLogger.info('search start', {
        query: searchQuery,
        mode: modeToUse,
        languages: languagesToUse,
        paging: { offset: 0, limit: PAGE_SIZE },
      });

      // Create a unique key for this search based on parameters
      const searchParamsKey = JSON.stringify({
        query: searchQuery,
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

      // STEP 1: ALWAYS clear state when starting search (even for React Strict Mode duplicates)
      // This prevents cache corruption from parallel search calls
      setError(null);
      clearChunksCache(); // Clear previous chunks cache
      fullDocumentsMapRef.current.clear(); // Clear previous documents
      setSearchMetadata([], 0, false); // Clear previous search metadata
      clearSelection(); // Clear document selection

      // STEP 2: Mark search as in progress (triggers loading state)
      searchInProgressRef.current = true;
      setIsSearching(true);

      // STEP 3: Text and hybrid modes → Meilisearch (no chunks, one hit per doc).
      // 'text' is pure keyword; 'hybrid' sends semantic_ratio=0.5 so Meili
      // mixes BGE-M3 vector similarity with keyword matching server-side.
      if (searchMode === 'text' || searchMode === 'hybrid') {
        try {
          const filterString = buildMeilisearchFilter(baseFilters, languagesToUse);
          const result = await searchDocumentsMeili({
            query: searchQuery,
            limit: PAGE_SIZE,
            offset: 0,
            filters: filterString,
            semanticRatio: searchMode === 'hybrid' ? 0.5 : 0,
          });

          if (searchIdRef.current !== currentSearchId) return;

          const metadata = result.documents.map((hit, i) => meiliHitToMetadata(hit, i));
          fullDocumentsMapRef.current.clear();
          result.documents.forEach((hit) => {
            fullDocumentsMapRef.current.set(hit.id, meiliHitToSearchDocument(hit));
          });

          setError(null);
          setSearchMetadata(metadata, metadata.length, false);
          setPaginationMetadata(result.pagination);
          setPageSize(PAGE_SIZE);
          clearSelection();
          setIsSearching(false);
          if (options?.onComplete) options.onComplete();
          return;
        } catch (err) {
          searchLogger.error('Meilisearch search failed', err, { query: searchQuery });
          setSearchMetadata([], 0, false);
          setError('search_error');
          setIsSearching(false);
          return;
        } finally {
          searchInProgressRef.current = false;
        }
      }

      // STEP 4: vector mode → pgvector chunks (pure semantic chunk-level).
      try {
        const alpha = 1.0;
        const result = await searchChunks({
          query: searchQuery,
          limit_docs: PAGE_SIZE,
          alpha,
          languages: languagesToUse.length > 0 ? languagesToUse : undefined,
          fetch_full_documents: false,
          limit_chunks: DEFAULT_LIMIT_CHUNKS,
          mode: modeToUse,
          offset: 0,
          include_count: true,
        });

        // Discard if a newer search has been initiated.
        if (searchIdRef.current !== currentSearchId) {
          searchLogger.warn('Search ID mismatch after chunk fetch, discarding stale chunks');
          return;
        }

        // Store chunks in cache for immediate display
        const chunksByDoc: Record<string, SearchChunk[]> = {};
        result.chunks.forEach((chunk) => {
          if (!chunksByDoc[chunk.document_id]) {
            chunksByDoc[chunk.document_id] = [];
          }
          chunksByDoc[chunk.document_id].push(chunk);
        });

        // Single state update for all chunks
        const store = useSearchStore.getState();
        const newCache = { ...store.chunksCache };
        const newLoading = new Set(store.loadingChunks);
        Object.entries(chunksByDoc).forEach(([docId, chunks]) => {
          newCache[docId] = chunks;
          newLoading.delete(docId);
        });
        useSearchStore.setState({
          chunksCache: newCache,
          loadingChunks: Array.from(newLoading),
        });

        // Prefer documents embedded in the search response. Only call the
        // documents endpoint as a fallback when chunks reference IDs the
        // backend did not include in `result.documents`.
        const allDocumentIds = Array.from(new Set(result.chunks.map((c) => c.document_id)));
        let docs: SearchDocument[] = [];
        if (result.documents && result.documents.length > 0) {
          docs = result.documents as SearchDocument[];
          const embeddedIds = new Set(docs.map((d) => d.document_id));
          const missingIds = allDocumentIds.filter((id) => !embeddedIds.has(id));
          if (missingIds.length > 0) {
            const fallback = await fetchDocumentsByIds({
              document_ids: missingIds,
              return_properties: CARD_RETURN_PROPERTIES,
            });
            docs = docs.concat(fallback.documents as SearchDocument[]);
          }
        } else if (allDocumentIds.length > 0) {
          const fallback = await fetchDocumentsByIds({
            document_ids: allDocumentIds,
            return_properties: CARD_RETURN_PROPERTIES,
          });
          docs = fallback.documents as SearchDocument[];
        }

        // Discard if a newer search has been initiated.
        if (searchIdRef.current !== currentSearchId) {
          searchLogger.warn('Search ID mismatch after document fetch, discarding stale data');
          return;
        }

        searchLogger.info('results received', {
          chunkCount: result.chunks.length,
          docCount: docs.length,
          queryTimeMs: result.query_time_ms,
        });

        // Create document map for fast lookup
        const docMap = new Map(docs.map((doc) => [doc.document_id, doc]));

        // Store full documents in ref for use in convertMetadataToSearchDocument
        fullDocumentsMapRef.current.clear();
        docs.forEach((doc) => {
          fullDocumentsMapRef.current.set(doc.document_id, doc);
        });

        // Convert chunks to metadata WITH full document data when available.
        // Include ALL chunks even if their parent document is missing — the UI
        // copes with that via the metadata-only fallback path.
        const metadata: LegalDocumentMetadata[] = result.chunks.map((chunk) => {
          const fullDoc = docMap.get(chunk.document_id);
          if (!fullDoc) {
            searchLogger.warn(
              `Chunk ${chunk.chunk_id} references missing document ${chunk.document_id}; using chunk fallback.`
            );
          }
          return buildMetadataForChunk(chunk, fullDoc);
        });

        // Sort by score descending; chunks come pre-sorted but defensive sort is cheap.
        metadata.sort((a, b) => {
          const scoreA = a.score ?? -Infinity;
          const scoreB = b.score ?? -Infinity;
          return scoreB - scoreA;
        });

        // Store metadata + pagination, clear loading flag.
        setError(null);
        setSearchMetadata(metadata, metadata.length, false);
        if (result.pagination) {
          setPaginationMetadata(result.pagination);
        }
        setPageSize(10);
        clearSelection();
        setIsSearching(false);

        searchLogger.info('render ready', {
          metadataCount: metadata.length,
          hasMore: result.pagination?.has_more ?? false,
        });

        if (options?.onComplete) {
          options.onComplete();
        }
      } catch (err) {
        searchLogger.error('Search failed', err, {
          query: searchQuery,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        setSearchMetadata([], 0, false);
        setError('search_error');
        setIsSearching(false);
      } finally {
        searchInProgressRef.current = false;
      }
    },
    [
      searchType,
      searchMode,
      baseFilters,
      selectedLanguages,
      setIsSearching,
      setError,
      clearChunksCache,
      setSearchMetadata,
      setPageSize,
      clearSelection,
      setPaginationMetadata,
      buildMetadataForChunk,
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

    setIsLoadingMore(true);

    // Text and hybrid modes → Meilisearch load-more (no chunks, append docs directly).
    if (state.searchMode === 'text' || state.searchMode === 'hybrid') {
      try {
        const filterString = buildMeilisearchFilter(
          state.baseFilters,
          Array.from(state.selectedLanguages)
        );
        const result = await searchDocumentsMeili({
          query: state.query,
          limit: PAGE_SIZE,
          offset: currentPagination.next_offset,
          filters: filterString,
          semanticRatio: state.searchMode === 'hybrid' ? 0.5 : 0,
        });

        const newMetadata = result.documents.map((hit, i) =>
          meiliHitToMetadata(hit, currentPagination.loaded_count + i)
        );
        result.documents.forEach((hit) => {
          fullDocumentsMapRef.current.set(hit.id, meiliHitToSearchDocument(hit));
        });

        appendSearchMetadata(newMetadata);

        const updatedPagination: PaginationMetadata = {
          ...result.pagination,
          estimated_total: state.cachedEstimatedTotal,
          loaded_count: currentPagination.loaded_count + result.documents.length,
        };
        setPaginationMetadata(updatedPagination);
      } catch (err) {
        searchLogger.error('Meilisearch loadMore failed', err);
        setError('load_more_error');
      } finally {
        setIsLoadingMore(false);
      }
      return;
    }

    try {
      // Vector mode → pgvector load-more (chunk-level semantic).
      const alpha = 1.0;
      const result = await searchChunks({
        query: state.query,
        limit_docs: PAGE_SIZE,
        alpha,
        languages: Array.from(state.selectedLanguages),
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

      // Prefer documents embedded in the search response.
      const newDocumentIds = Array.from(new Set(result.chunks.map((c) => c.document_id)));
      let docs: SearchDocument[] = [];
      if (result.documents && result.documents.length > 0) {
        docs = result.documents as SearchDocument[];
        const embeddedIds = new Set(docs.map((d) => d.document_id));
        const missingIds = newDocumentIds.filter((id) => !embeddedIds.has(id));
        if (missingIds.length > 0) {
          const fallback = await fetchDocumentsByIds({
            document_ids: missingIds,
            return_properties: CARD_RETURN_PROPERTIES,
          });
          docs = docs.concat(fallback.documents as SearchDocument[]);
        }
      } else if (newDocumentIds.length > 0) {
        const fallback = await fetchDocumentsByIds({
          document_ids: newDocumentIds,
          return_properties: CARD_RETURN_PROPERTIES,
        });
        docs = fallback.documents as SearchDocument[];
      }

      // Store full documents in ref
      docs.forEach((doc) => {
        fullDocumentsMapRef.current.set(doc.document_id, doc);
      });

      // Create document map
      const docMap = new Map(docs.map((doc) => [doc.document_id, doc]));

      // Convert chunks to metadata
      const newMetadata: LegalDocumentMetadata[] = result.chunks.map((chunk) => {
        const fullDoc = docMap.get(chunk.document_id);
        if (!fullDoc) {
          searchLogger.warn(
            `loadMore: Chunk ${chunk.chunk_id} references missing document ${chunk.document_id}.`
          );
        }
        return buildMetadataForChunk(chunk, fullDoc);
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
    } catch (err) {
      searchLogger.error('Load more failed', err);
      setError('load_more_error');
    } finally {
      setIsLoadingMore(false);
    }
  }, [setIsLoadingMore, appendSearchMetadata, setPaginationMetadata, setError, buildMetadataForChunk]);

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
