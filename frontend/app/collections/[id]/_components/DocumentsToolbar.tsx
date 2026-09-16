import { FC } from "react";
import { Search, X, LayoutGrid, Table as TableIcon, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/lib/styles/components";

interface DocumentsToolbarProps {
  loadedDocumentCount: number;
  totalDocumentCount: number;
  allDocumentsLoaded: boolean;
  initialLoadLimit: number;
  viewMode: 'cards' | 'table';
  onViewModeChange: (mode: 'cards' | 'table') => void;
  isLoadingFullTable: boolean;
  fullTableProgress: { loaded: number; total: number } | null;
  isLoadingAll: boolean;
  onLoadAllDocuments: () => void;
  showSearch: boolean;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  filteredCount: number;
}

/** Header row for the documents section: title, view toggle, load-all, search. */
const DocumentsToolbar: FC<DocumentsToolbarProps> = ({
  loadedDocumentCount,
  totalDocumentCount,
  allDocumentsLoaded,
  initialLoadLimit,
  viewMode,
  onViewModeChange,
  isLoadingFullTable,
  fullTableProgress,
  isLoadingAll,
  onLoadAllDocuments,
  showSearch,
  searchQuery,
  setSearchQuery,
  filteredCount,
}) => {
  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <SectionHeader
          title="Documents"
          description={
            allDocumentsLoaded
              ? `${totalDocumentCount} ${totalDocumentCount === 1 ? 'document' : 'documents'} in this collection`
              : `Showing ${loadedDocumentCount} of ${totalDocumentCount} documents (newest first)`
          }
          className="mb-0"
        />
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="tablist"
            aria-label="View mode"
            className="inline-flex items-center rounded-none border border-rule bg-parchment p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'cards'}
              onClick={() => onViewModeChange('cards')}
              disabled={isLoadingFullTable}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-none px-3 py-1 font-mono text-xs transition-colors",
                viewMode === 'cards'
                  ? "bg-ink text-parchment font-semibold"
                  : "text-ink-soft hover:text-ink"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'table'}
              onClick={() => onViewModeChange('table')}
              disabled={isLoadingFullTable}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-none px-3 py-1 font-mono text-xs transition-colors",
                viewMode === 'table'
                  ? "bg-ink text-parchment font-semibold"
                  : "text-ink-soft hover:text-ink"
              )}
            >
              {isLoadingFullTable ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-oxblood" />
              ) : (
                <TableIcon className="h-3.5 w-3.5" />
              )}
              Table
            </button>
          </div>
          {!allDocumentsLoaded && totalDocumentCount > initialLoadLimit && viewMode === 'cards' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onLoadAllDocuments}
              disabled={isLoadingAll}
              className="shrink-0 rounded-none border-rule text-ink font-mono text-xs hover:border-ink hover:bg-parchment-deep"
            >
              {isLoadingAll ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 text-oxblood" />
                  Loading...
                </>
              ) : (
                <>Load All {totalDocumentCount} Documents</>
              )}
            </Button>
          )}
        </div>
      </div>

      {isLoadingFullTable && fullTableProgress && (
        <div className="mb-4 text-xs font-mono text-ink-soft">
          Loading documents for table view… {fullTableProgress.loaded} / {fullTableProgress.total}
        </div>
      )}

      {/* Search Bar */}
      {showSearch && (
        <div className="mb-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
            <Input
              type="search"
              placeholder="Search documents by title, ID, or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 h-10 rounded-none border-rule bg-parchment text-ink font-mono text-xs focus-visible:border-ink"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-soft hover:text-ink transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Results count */}
          {searchQuery && (
            <div className="text-xs font-mono text-ink-soft mt-2">
              Found <span className="font-semibold text-ink">{filteredCount}</span> matching document{filteredCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default DocumentsToolbar;
