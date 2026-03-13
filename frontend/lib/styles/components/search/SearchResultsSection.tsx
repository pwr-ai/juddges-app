"use client";

import { PrimaryButton } from "../primary-button";
import { SecondaryButton } from "../secondary-button";
import { SaveToCollectionPopover } from "../save-to-collection-popover";
import { InfiniteScrollTrigger } from "./InfiniteScrollTrigger";
import { SearchDocumentCard } from "../search-document-card";
import type { LegalDocumentMetadata, SearchDocument } from "@/types/search";
import type { PaginationMetadata } from "@/lib/api";

export interface SearchContextParams {
  searchQuery: string;
  searchMode: "rabbit" | "thinking" | string;
  filters: Record<string, unknown>;
  totalResults: number;
  searchTimestamp?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMetadata = any;

export interface SearchResultsSectionProps {
  filteredMetadata: AnyMetadata[];
  filteredCount: number;
  activeFilterCount: number;
  searchMetadata: AnyMetadata[];
  chunksCache: Record<string, unknown>;
  loadingChunks: string[];
  selectedDocumentIds: Set<string>;
  selectedCount: number;
  showSaveAllPopover: boolean;
  convertMetadataToSearchDocument: (metadata: AnyMetadata) => SearchDocument;
  toggleDocumentSelection: (documentId: string) => void;
  selectAllDocuments: (ids?: string[]) => void;
  clearSelection: () => void;
  setShowSaveAllPopover: (open: boolean) => void;
  filterVersion: number;
  onLoadMore: () => Promise<void> | void;
  isLoadingMore: boolean;
  paginationMetadata: PaginationMetadata | null;
  cachedEstimatedTotal: number | null;
  searchContextParams?: SearchContextParams;
}

export function SearchResultsSection({
  filteredMetadata,
  filteredCount,
  activeFilterCount,
  selectedDocumentIds,
  selectedCount,
  showSaveAllPopover,
  convertMetadataToSearchDocument,
  toggleDocumentSelection,
  selectAllDocuments,
  clearSelection,
  setShowSaveAllPopover,
  filterVersion,
  onLoadMore,
  isLoadingMore,
  paginationMetadata,
  cachedEstimatedTotal,
  searchContextParams,
}: SearchResultsSectionProps): React.JSX.Element {
  const displayedCount = paginationMetadata?.loaded_count ?? filteredCount;
  const estimatedTotal = cachedEstimatedTotal ?? paginationMetadata?.estimated_total ?? filteredCount;
  const hasMore = Boolean(paginationMetadata?.has_more && paginationMetadata?.next_offset !== null);

  const docsForSave = (selectedCount > 0
    ? filteredMetadata.filter((doc) => selectedDocumentIds.has(doc.document_id))
    : filteredMetadata
  ).map(convertMetadataToSearchDocument);

  if (filteredCount === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm font-medium">0 documents</p>
        {activeFilterCount > 0 ? (
          <>
            <p className="mt-2 text-sm">No results match your filters</p>
            <p className="text-xs text-muted-foreground">
              Try adjusting or clearing your filters.
            </p>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div key={filterVersion} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          Showing <span className="font-semibold">{displayedCount}</span> of{" "}
          <span className="font-semibold">~{estimatedTotal}</span> documents{" "}
          {activeFilterCount > 0 ? <span className="text-muted-foreground">(filtered)</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 ? (
            <SecondaryButton size="sm" onClick={clearSelection}>
              Deselect All
            </SecondaryButton>
          ) : (
            <SecondaryButton size="sm" onClick={() => selectAllDocuments()}>
              Select All
            </SecondaryButton>
          )}
          <PrimaryButton
            size="sm"
            disabled={selectedCount === 0}
            onClick={() => setShowSaveAllPopover(true)}
          >
            {selectedCount > 0 ? `Save Selected (${selectedCount})` : "Save Results"}
          </PrimaryButton>
        </div>
      </div>

      {showSaveAllPopover ? (
        <SaveToCollectionPopover
          documents={docsForSave}
          onClose={() => setShowSaveAllPopover(false)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {filteredMetadata.map((metadata, index) => {
          const doc = convertMetadataToSearchDocument(metadata);
          return (
            <SearchDocumentCard
              key={`${metadata.document_id}-${index}`}
              doc={doc}
              isSelected={selectedDocumentIds.has(metadata.document_id)}
              onToggleSelection={toggleDocumentSelection}
              resultPosition={index + 1}
              searchContextParams={searchContextParams}
            />
          );
        })}
      </div>

      {hasMore ? (
        <p className="text-center text-xs text-muted-foreground">Scroll for more</p>
      ) : null}

      {isLoadingMore ? <p className="text-sm">Loading more documents...</p> : null}

      <InfiniteScrollTrigger
        onLoadMore={onLoadMore}
        hasMore={hasMore}
        isLoading={isLoadingMore}
      />
    </div>
  );
}
