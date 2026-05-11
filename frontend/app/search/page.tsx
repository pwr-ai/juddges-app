"use client";

import { Suspense, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSearchStore } from '@/lib/store/searchStore';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import {
 PageContainer,
 DocumentDialog,
 SearchFilters,
 TextButton,
 SearchForm,
 SearchEmptyState,
 SearchResultsSection,
} from '@/lib/styles/components';
import { ZeroResultsEmptyState } from '@/components/search/ZeroResultsEmptyState';
import { SearchErrorBoundary } from '@/components/errors/SearchErrorBoundary';
import { SaveSearchDialog } from '@/components/SaveSearchDialog';
import { useSearchResults } from '@/hooks/useSearchResults';
import { PreSearchFilters } from '@/components/search/PreSearchFilters';
import { useSearchAutocomplete } from '@/hooks/useSearchAutocomplete';
import { useSearchUrlParams } from '@/hooks/useSearchUrlParams';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Typing animation component for header text
 */
function TypingHeader({
 text,
 className,
 speed = 50
}: {
 text: string;
 className?: string;
 speed?: number;
}): React.JSX.Element {
 const [displayedText, setDisplayedText] = useState("");
 const [showCursor, setShowCursor] = useState(true);
 const indexRef = useRef(0);
 const cursorIntervalRef = useRef<NodeJS.Timeout | null>(null);

 useEffect(() => {
 setDisplayedText("");
 indexRef.current = 0;

 const interval = setInterval(() => {
 if (indexRef.current < text.length) {
 setDisplayedText(text.slice(0, indexRef.current + 1));
 indexRef.current += 1;
 } else {
 clearInterval(interval);
 // Blink cursor after typing is complete
 cursorIntervalRef.current = setInterval(() => {
 setShowCursor((prev) => !prev);
 }, 530);
 }
 }, speed);

 return () => {
 clearInterval(interval);
 if (cursorIntervalRef.current) {
 clearInterval(cursorIntervalRef.current);
 cursorIntervalRef.current = null;
 }
 };
 }, [text, speed]);

 return (
 <h1 className={className}>
 {displayedText}
 {showCursor && (
 <motion.span
 className="inline-block w-0.5 h-[1.2em] bg-primary ml-1 align-middle"
 animate={{
 opacity: [1, 1, 0, 0],
 }}
 transition={{
 duration: 1,
 repeat: Infinity,
 times: [0, 0.45, 0.5, 1],
 }}
 />
 )}
 </h1>
 );
}

function SearchPageContent(): React.JSX.Element | null {
 const router = useRouter();
 const pathname = usePathname();
 const { locale } = useLanguage();
 const [mounted, setMounted] = useState(false);
 const [urlParamsProcessed, setUrlParamsProcessed] = useState(false);
 const searchInputRef = useRef<HTMLInputElement>(null);
 const [lastSearchMode, setLastSearchMode] = useState<"thinking" | "rabbit" | null>(null);
 const [hasPerformedSearch, setHasPerformedSearch] = useState(false);
 const [searchTimestamp, setSearchTimestamp] = useState<string>('');

 // Store state
 const filterVersion = useSearchStore((state) => state.filterVersion);
 const filters = useSearchStore((state) => state.filters);
 const {
 query,
 setQuery,
 selectedLanguages,
 setSelectedLanguages,
 isSearching,
 setIsSearching,
 error,
 setError,
 showSaveAllPopover,
 setShowSaveAllPopover,
 selectedDoc,
 selectedChunks,
 searchType,
 setSearchType,
 searchMode,
 setSearchMode,
 baseFilters,
 setBaseFilter,
 resetBaseFilters,
 isDialogOpen,
 toggleFilter,
 setDateFilter,
 toggleCustomMetadataFilter,
 clearCustomMetadataFilter,
 resetFilters,
 getActiveFilterCount,
 closeDocumentDialog,
 loadState,
 currentPage,
 setCurrentPage,
 pageSize,
 setPageSize,
 searchMetadata,
 chunksCache,
 loadingChunks: loadingChunksRaw,
 setSearchMetadata,
 clearChunksCache,
 toggleDocumentSelection,
 selectAllDocuments,
 clearSelection,
 getSelectedDocumentCount,
 getFilteredMetadata,
 getFilteredMetadataCount,
 getAvailableFiltersFromMetadata,
 } = useSearchStore();

 // Defensive: Convert Set to array if old cached version is loaded
 const loadingChunks = Array.isArray(loadingChunksRaw)
 ? loadingChunksRaw
 : Array.from(loadingChunksRaw as unknown as Set<string>);

 const filteredMetadata = useMemo(() => getFilteredMetadata(), [getFilteredMetadata]);

 const filteredCount = useMemo(() => getFilteredMetadataCount(), [getFilteredMetadataCount]);

 const availableFilters = useMemo(() => getAvailableFiltersFromMetadata(), [getAvailableFiltersFromMetadata]);

 const activeFilterCount = useMemo(() => getActiveFilterCount(), [getActiveFilterCount]);

 const computedTotalPages = useMemo(() => {
 return Math.ceil(filteredCount / pageSize);
 }, [filteredCount, pageSize]);

 const selectedCount = getSelectedDocumentCount();
 const {
 suggestions: autocompleteSuggestions,
 topicHits: autocompleteTopicHits,
 isLoading: isAutocompleteLoading,
 clearSuggestions,
 } = useSearchAutocomplete(query, {
 enabled: mounted && !isSearching,
 debounceMs: 250,
 minChars: 2,
 limit: 8,
 });

 // Search results hook
 const {
 search,
 loadMore,
 isLoadingMore,
 paginationMetadata,
 cachedEstimatedTotal,
 convertMetadataToSearchDocument,
 fullDocumentsMapRef,
 } = useSearchResults();

 // URL params hook
 const { updateUrlParams, updatingUrlRef } = useSearchUrlParams({
 mounted,
 urlParamsProcessed,
 setUrlParamsProcessed,
 hasPerformedSearch,
 isSearching,
 });

 // Load state from localStorage on component mount
 useEffect(() => {
 const currentFilters = useSearchStore.getState().filters;
 const hasNoFilters =
 currentFilters.keywords.size === 0 &&
 currentFilters.legalConcepts.size === 0 &&
 currentFilters.issuingBodies.size === 0 &&
 !currentFilters.dateFrom &&
 !currentFilters.dateTo;

 if (hasNoFilters) {
 loadState();
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // Set mounted to true after component mounts
 useEffect(() => {
 setMounted(true);

 let timer: NodeJS.Timeout | null = null;
 const frame = requestAnimationFrame(() => {
 timer = setTimeout(() => {
 // Navigation complete
 }, 200);
 });

 return () => {
 if (timer) {
 clearTimeout(timer);
 }
 cancelAnimationFrame(frame);
 };
 }, []);

 // Hide footer when searching
 useEffect(() => {
 if (isSearching) {
 document.body.classList.add('search-loading');
 } else {
 document.body.classList.remove('search-loading');
 }

 return () => {
 document.body.classList.remove('search-loading');
 };
 }, [isSearching]);

 // Reset to page 1 when filters change
 useEffect(() => {
 if (filterVersion > 0 && currentPage > 1) {
 setCurrentPage(1);
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [filterVersion]);

 // Update URL when search parameters change
 useEffect(() => {
 if (!mounted || !urlParamsProcessed || updatingUrlRef.current || isSearching) return;
 updateUrlParams();
 }, [query, selectedLanguages, searchType, searchMode, baseFilters, updateUrlParams, mounted, urlParamsProcessed, isSearching, updatingUrlRef]);

 // Update URL when pagination changes
 useEffect(() => {
 if (!mounted || !urlParamsProcessed || updatingUrlRef.current || isSearching) return;
 updateUrlParams();
 }, [currentPage, pageSize, updateUrlParams, mounted, urlParamsProcessed, isSearching, updatingUrlRef]);

 // Update URL when filters change
 useEffect(() => {
 if (!mounted || !urlParamsProcessed || updatingUrlRef.current || isSearching) return;
 updateUrlParams();
 }, [filterVersion, filters, updateUrlParams, mounted, urlParamsProcessed, isSearching, updatingUrlRef]);

 const toggleLanguage = (language: string): void => {
 const currentSelected = useSearchStore.getState().selectedLanguages;
 const newSet = new Set(currentSelected);

 if (newSet.has(language)) {
 if (newSet.size === 1) return; // Block deselection of last language
 newSet.delete(language);
 } else {
 newSet.add(language);
 }

 setSelectedLanguages(newSet);
 };

 // Reset hasPerformedSearch when query is cleared
 useEffect(() => {
 if (!query.trim() && hasPerformedSearch) {
 setHasPerformedSearch(false);
 setError(null); // Also clear error when query is cleared
 setSearchMetadata([], 0, false); // Clear metadata
 }
 }, [query, hasPerformedSearch, setError, setSearchMetadata]);

 // Auto-focus search input when user starts typing
 useEffect(() => {
 const handleKeyDown = (e: KeyboardEvent): void => {
 const target = e.target as HTMLElement;
 if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
 return;
 }

 if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
 searchInputRef.current?.focus();
 if (!query && searchInputRef.current) {
 setQuery(e.key);
 }
 }
 };

 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, [query, setQuery]);

 const handleSearch = async (
 overrideMode?: "thinking" | "rabbit",
 overrideQuery?: string,
 overrideLanguages?: string[]
 ): Promise<void> => {
 const queryToUse = overrideQuery || query;
 if (!queryToUse.trim()) {
 return Promise.resolve();
 }

 // Clear error when starting a new search
 setError(null);
 clearSuggestions();
 const modeToUse = overrideMode || searchType;
 setLastSearchMode(modeToUse);
 setHasPerformedSearch(true);
 // Track search timestamp for feedback context
 setSearchTimestamp(new Date().toISOString());

 await search(queryToUse, {
 overrideMode: modeToUse,
 overrideLanguages: overrideLanguages || Array.from(selectedLanguages),
 onComplete: () => {
 updateUrlParams(false, true);
 },
 });
 };


 const handleBack = (): void => {
 setQuery('');
 clearSuggestions();
 setSearchMetadata([], 0, false);
 clearChunksCache();
 fullDocumentsMapRef.current.clear();
 setError(null);
 setLastSearchMode(null);
 setHasPerformedSearch(false);
 setIsSearching(false);
 router.replace(pathname, { scroll: false });
 searchInputRef.current?.focus();
 };

 const searchContextParams = useMemo(() => ({
 searchQuery: query,
 searchMode: lastSearchMode || searchType,
 filters: {
 courts: Array.from(filters.issuingBodies || []),
 date_from: filters.dateFrom ? filters.dateFrom.toISOString().split('T')[0] : null,
 date_to: filters.dateTo ? filters.dateTo.toISOString().split('T')[0] : null,
 languages: Array.from(selectedLanguages),
 keywords: Array.from(filters.keywords || []),
 legal_concepts: Array.from(filters.legalConcepts || []),
 issuing_bodies: Array.from(filters.issuingBodies || []),
 },
 totalResults: searchMetadata.length,
 searchTimestamp: searchTimestamp,
 }), [query, lastSearchMode, searchType, filters, selectedLanguages, searchMetadata.length, searchTimestamp]);

 const handleAutocompleteSelection = useCallback(
 (value: string): void => {
 setQuery(value);
 clearSuggestions();
 },
 [setQuery, clearSuggestions]
 );

 const showExpanded = searchMetadata.length === 0 && !error && !(query && hasPerformedSearch);

 if (!mounted) {
 return null;
 }

 return (
 <>
 <DocumentDialog
 isOpen={isDialogOpen}
 onClose={closeDocumentDialog}
 document={selectedDoc}
 chunks={selectedChunks}
 />

 {/* Clean Room Mesh Gradient Background */}
 <div
 className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
 aria-hidden="true"
 >
 {/* Base background */}
 <div
 className="absolute inset-0"
 style={{
 background: '#F8FAFC',
 backgroundAttachment: 'fixed',
 }}
 />
 {/* Top-left blob: Sky 100 with blur */}
 <div
 className="absolute top-0 left-0 w-[600px] h-[600px] -translate-x-1/4 -translate-y-1/4"
 style={{
 background: 'radial-gradient(circle, rgba(224, 242, 254, 1) 0%, transparent 70%)',
 filter: 'blur(100px)',
 }}
 />
 {/* Bottom-right blob: Slate 100 with blur */}
 <div
 className="absolute bottom-0 right-0 w-[600px] h-[600px] translate-x-1/4 translate-y-1/4"
 style={{
 background: 'radial-gradient(circle, rgba(241, 245, 249, 1) 0%, transparent 70%)',
 filter: 'blur(100px)',
 }}
 />
 </div>
 <div
 className="fixed inset-0 pointer-events-none z-0 hidden overflow-hidden"
 aria-hidden="true"
 >
 {/* Base background - Deep Slate */}
 <div
 className="absolute inset-0"
 style={{
 background: '#020617',
 backgroundAttachment: 'fixed',
 }}
 />
 {/* Top-left blob: Darker with blur */}
 <div
 className="absolute top-0 left-0 w-[600px] h-[600px] -translate-x-1/4 -translate-y-1/4"
 style={{
 background: 'radial-gradient(circle, rgba(15, 23, 42, 0.6) 0%, transparent 70%)',
 filter: 'blur(100px)',
 }}
 />
 {/* Bottom-right blob: Darker with blur */}
 <div
 className="absolute bottom-0 right-0 w-[600px] h-[600px] translate-x-1/4 translate-y-1/4"
 style={{
 background: 'radial-gradient(circle, rgba(30, 41, 59, 0.6) 0%, transparent 70%)',
 filter: 'blur(100px)',
 }}
 />
 </div>

 <PageContainer width={showExpanded ? 'compact' : 'full'} fillViewport={showExpanded} className="py-6 relative z-10">
 {showExpanded ? (
 /* Expanded view - IMPROVED LAYOUT */
 <div className="flex flex-col items-center">
 <div className="w-full space-y-8">
 {/* Typing Animation Header */}
 <div className="w-full space-y-2">
 <TypingHeader
 text="Search legal documents with JuDDGES"
 className="text-3xl md:text-4xl font-bold leading-relaxed text-black text-center"
 />
 <p className="text-base md:text-lg text-muted-foreground text-center">
 Judgments and legal decisions in seconds.
 </p>
 </div>

 {/* PRIMARY ELEMENT: Search Input - Made more prominent */}
 <SearchForm
 ref={searchInputRef}
 query={query}
 setQuery={setQuery}
 searchType={searchType}
 setSearchType={setSearchType}
 selectedLanguages={selectedLanguages}
 toggleLanguage={toggleLanguage}
 setSelectedLanguages={setSelectedLanguages}
 isSearching={isSearching}
 hasResults={searchMetadata.length > 0}
 hasError={!!error}
 hasPerformedSearch={hasPerformedSearch}
 onSearch={handleSearch}
 autocompleteSuggestions={autocompleteSuggestions}
 autocompleteTopicHits={autocompleteTopicHits}
 isAutocompleteLoading={isAutocompleteLoading}
 onSelectAutocompleteSuggestion={handleAutocompleteSelection}
 currentLocale={locale}
 />

 <PreSearchFilters
 selectedLanguages={selectedLanguages}
 onToggleLanguage={(lang) => {
 toggleLanguage(lang);
 }}
 searchMode={searchMode}
 onChangeMode={(next) => {
 setSearchMode(next);
 }}
 dateFrom={filters.dateFrom}
 dateTo={filters.dateTo}
 onChangeDate={(field, value) => {
 setDateFilter(field, value);
 }}
 baseFilters={baseFilters}
 onChangeBaseFilter={(field, range) => {
 setBaseFilter(field, range);
 }}
 onResetBaseFilters={() => {
 resetBaseFilters();
 }}
 disabled={isSearching}
 />
 </div>
 </div>
 ) : (
 /* Results view with sidebar */
 <div className="flex flex-col gap-6 w-full"data-search-results>
 {/* Compact search bar at top - PRIMARY element first */}
 <div className="w-full space-y-4">
 {/* Search form - PRIMARY action, always first */}
 <SearchForm
 ref={searchInputRef}
 query={query}
 setQuery={setQuery}
 searchType={searchType}
 setSearchType={setSearchType}
 selectedLanguages={selectedLanguages}
 toggleLanguage={toggleLanguage}
 setSelectedLanguages={setSelectedLanguages}
 isSearching={isSearching}
 hasResults={searchMetadata.length > 0}
 hasError={!!error}
 hasPerformedSearch={hasPerformedSearch}
 onSearch={handleSearch}
 autocompleteSuggestions={autocompleteSuggestions}
 autocompleteTopicHits={autocompleteTopicHits}
 isAutocompleteLoading={isAutocompleteLoading}
 onSelectAutocompleteSuggestion={handleAutocompleteSelection}
 currentLocale={locale}
 />

 <PreSearchFilters
 selectedLanguages={selectedLanguages}
 onToggleLanguage={(lang) => {
 toggleLanguage(lang);
 }}
 searchMode={searchMode}
 onChangeMode={(next) => {
 setSearchMode(next);
 }}
 dateFrom={filters.dateFrom}
 dateTo={filters.dateTo}
 onChangeDate={(field, value) => {
 setDateFilter(field, value);
 }}
 baseFilters={baseFilters}
 onChangeBaseFilter={(field, range) => {
 setBaseFilter(field, range);
 }}
 onResetBaseFilters={() => {
 resetBaseFilters();
 }}
 disabled={isSearching}
 />
 </div>

 <div className="flex flex-col lg:flex-row gap-8 overflow-x-hidden w-full">
 <div
 className={cn(
 'flex-1 min-w-0 overflow-hidden',
 ((searchMetadata.length === 0 && query && hasPerformedSearch) || error) &&
 !isSearching &&
 'flex items-center justify-center'
 )}
 >
 {!((searchMetadata.length === 0 && query && hasPerformedSearch) || error) && (
 <div className="flex items-center justify-between mb-4">
 <TextButton onClick={handleBack} icon={ArrowLeft}>
 Back
 </TextButton>
 {query && <SaveSearchDialog />}
 </div>
 )}

 {error && !isSearching && hasPerformedSearch ? (
 <SearchEmptyState
 error={true}
 query={query}
 lastSearchMode={lastSearchMode}
 onBack={handleBack}
 onRetry={() => {
 setError(null);
 handleSearch();
 }}
 />
 ) : !error && searchMetadata.length === 0 && query && hasPerformedSearch ? (
 <ZeroResultsEmptyState
 query={query}
 activeFilters={[
  ...(filters.dateFrom ? [{ label: `From: ${filters.dateFrom.toLocaleDateString()}`, onClear: () => setDateFilter('dateFrom', undefined) }] : []),
  ...(filters.dateTo ? [{ label: `To: ${filters.dateTo.toLocaleDateString()}`, onClear: () => setDateFilter('dateTo', undefined) }] : []),
  ...Array.from(filters.keywords).map(kw => ({ label: `Keyword: ${kw}`, onClear: () => toggleFilter('keywords', kw) })),
  ...Array.from(filters.issuingBodies).map(body => ({ label: `Court: ${body}`, onClear: () => toggleFilter('issuingBodies', body) })),
 ]}
 onClearAllFilters={activeFilterCount > 0 ? resetFilters : undefined}
 onSampleQuery={(q) => {
  setQuery(q);
  handleSearch(undefined, q);
 }}
 />
 ) : (
 <SearchErrorBoundary>
 <SearchResultsSection
 filteredMetadata={filteredMetadata}
 filteredCount={filteredCount}
 activeFilterCount={activeFilterCount}
 searchMetadata={searchMetadata}
 chunksCache={chunksCache}
 loadingChunks={loadingChunks}
 selectedDocumentIds={
 useSearchStore.getState().selectedDocumentIds instanceof Set
 ? useSearchStore.getState().selectedDocumentIds
 : new Set(Array.from(useSearchStore.getState().selectedDocumentIds || []))
 }
 selectedCount={selectedCount}
 showSaveAllPopover={showSaveAllPopover}
 convertMetadataToSearchDocument={convertMetadataToSearchDocument}
 toggleDocumentSelection={toggleDocumentSelection}
 selectAllDocuments={selectAllDocuments}
 clearSelection={clearSelection}
 setShowSaveAllPopover={setShowSaveAllPopover}
 filterVersion={filterVersion}
 onLoadMore={loadMore}
 isLoadingMore={isLoadingMore}
 paginationMetadata={paginationMetadata}
 cachedEstimatedTotal={cachedEstimatedTotal}
 searchContextParams={searchContextParams}
 />
 </SearchErrorBoundary>
 )}
 </div>

 {/* Sidebar - facet filters, only when there are results */}
 {searchMetadata.length > 0 && (
 <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
 <div className="sticky top-4 space-y-4">
 <SearchFilters
 key={filterVersion}
 filters={filters}
 availableFilters={availableFilters}
 onFilterToggle={toggleFilter}
 onDateChange={setDateFilter}
 onResetFilters={resetFilters}
 activeFilterCount={activeFilterCount}
 searchResults={{ documents: searchMetadata.map(m => ({
 keywords: m.keywords,
 language: m.language,
 jurisdiction: m.jurisdiction,
 court_level: m.court_level,
 legal_domain: m.legal_domain,
 custom_metadata: m.custom_metadata,
 })) }}
 onCustomMetadataToggle={toggleCustomMetadataFilter}
 onClearCustomMetadata={clearCustomMetadataFilter}
 />
 </div>
 </div>
 )}
 </div>
 </div>
 )}
 </PageContainer>
 </>
 );
 }

export default function SearchPage(): React.JSX.Element {
 return (
 <Suspense fallback={null}>
 <SearchPageContent />
 </Suspense>
 );
}
