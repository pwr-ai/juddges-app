import { FC } from "react";
import { Search, X, LayoutGrid, Table as TableIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SectionHeader, SecondaryButton } from "@/lib/styles/components";

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
            className="inline-flex items-center rounded-lg border border-[var(--rule)] bg-white p-1 shadow-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'cards'}
              onClick={() => onViewModeChange('cards')}
              disabled={isLoadingFullTable}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === 'cards'
                  ? "bg-[var(--ink)] text-white"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
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
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === 'table'
                  ? "bg-[var(--ink)] text-white"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              )}
            >
              {isLoadingFullTable ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <TableIcon className="h-3.5 w-3.5" />
              )}
              Table
            </button>
          </div>
          {!allDocumentsLoaded && totalDocumentCount > initialLoadLimit && viewMode === 'cards' && (
            <SecondaryButton
              onClick={onLoadAllDocuments}
              disabled={isLoadingAll}
              size="sm"
              className="shrink-0"
            >
              {isLoadingAll ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Loading...
                </>
              ) : (
                <>Load All {totalDocumentCount} Documents</>
              )}
            </SecondaryButton>
          )}
        </div>
      </div>

      {isLoadingFullTable && fullTableProgress && (
        <div className="mb-4 text-sm text-[var(--ink-soft)]">
          Loading documents for table view… {fullTableProgress.loaded} / {fullTableProgress.total}
        </div>
      )}

      {/* Search Bar */}
      {showSearch && (
        <div className="mb-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search documents by title, ID, or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "w-full pl-10 pr-10 h-11",
                "rounded-xl border-2",
                "focus:border-primary focus:ring-2 focus:ring-primary/20",
                "transition-all duration-200"
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100 transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Results count */}
          {searchQuery && (
            <div className="text-sm text-muted-foreground mt-2">
              Found <span className="font-semibold text-foreground">{filteredCount}</span> matching document{filteredCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default DocumentsToolbar;
