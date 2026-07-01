import { FC } from "react";
import { Search, X, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { SearchDocument } from "@/types/search";
import { cn } from "@/lib/utils";
import { BaseCard, EmptyState, DocumentCard } from "@/lib/styles/components";

interface DocumentsCardGridProps {
  collectionDocumentIds: (string | number)[];
  documents: Map<string, SearchDocument>;
  loadingDocuments: Set<string>;
  paginatedDocumentIds: string[];
  onRemoveDocument: (documentId: string) => void;
  searchQuery: string;
  filteredDocumentIds: string[];
  setSearchQuery: (value: string) => void;
  totalPages: number;
  currentPage: number;
  setCurrentPage: (updater: (page: number) => number) => void;
  setCurrentPageValue: (page: number) => void;
  itemsPerPage: number;
}

/** Paginated card grid view of the collection's documents (with error card + search empty state). */
const DocumentsCardGrid: FC<DocumentsCardGridProps> = ({
  collectionDocumentIds,
  documents,
  loadingDocuments,
  paginatedDocumentIds,
  onRemoveDocument,
  searchQuery,
  filteredDocumentIds,
  setSearchQuery,
  totalPages,
  currentPage,
  setCurrentPage,
  setCurrentPageValue,
  itemsPerPage,
}) => {
  const loadedDocuments = Array.from(collectionDocumentIds)
    .map(docId => documents.get(String(docId)))
    .filter(Boolean) as SearchDocument[];

  // Check for database errors: either has _isDatabaseError flag, or is error type with a database-related summary
  // Also check for documents with "ERROR" in title or document_id (common pattern for error documents)
  const databaseErrors = loadedDocuments.filter((doc: SearchDocument) => {
    if ((doc as any)._isDatabaseError) return true;
    if (doc.document_type === 'error') {
      // If summary mentions database-related issues, it's a database error
      if (doc.summary?.toLowerCase().includes('source information cannot be loaded') ||
        doc.summary?.toLowerCase().includes('database') ||
        doc.summary?.toLowerCase().includes('database') ||
        doc.summary?.toLowerCase().includes('unavailable')) {
        return true;
      }
      // If document has "ERROR" in title and is error type, treat as a database error
      // (since all error documents in collections are likely database-related)
      if (doc.title?.toUpperCase().includes('ERROR') || doc.document_id?.toUpperCase().includes('ERROR')) {
        return true;
      }
    }
    return false;
  });
  const hasDatabaseErrors = databaseErrors.length > 0;

  // Check if there are any documents still loading that might be database errors
  // If all documents are either loaded with errors or still loading, show error card
  const allDocMetadataLoaded = loadedDocuments.length === collectionDocumentIds.length;
  const allLoadedAreErrors = allDocMetadataLoaded && loadedDocuments.length > 0 && loadedDocuments.every((doc: SearchDocument) => {
    if ((doc as any)._isDatabaseError) return true;
    if (doc.document_type === 'error') {
      if (doc.summary?.toLowerCase().includes('source information cannot be loaded') ||
        doc.summary?.toLowerCase().includes('database') ||
        doc.summary?.toLowerCase().includes('database') ||
        doc.summary?.toLowerCase().includes('unavailable')) {
        return true;
      }
      if (doc.title?.toUpperCase().includes('ERROR') || doc.document_id?.toUpperCase().includes('ERROR')) {
        return true;
      }
    }
    return false;
  });
  const shouldShowErrorCard = hasDatabaseErrors || allLoadedAreErrors;

  return (
    <>
      {/* Single error card for all database errors */}
      {shouldShowErrorCard && (
        <div className="mb-4">
          <BaseCard
            clickable={false}
            className={cn(
              "rounded-xl",
              "border-red-200/50",
              "bg-gradient-to-br from-red-50/50 via-red-50/50 to-orange-50/30",
              "shadow-lg shadow-red-500/10",
              "animate-in fade-in slide-in-from-top-2 duration-300"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 bg-red-500/20 rounded-lg blur-sm" />
                <div className="relative bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-2">
                  <AlertTriangle className="h-4 w-4 text-white" />
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="font-semibold text-sm text-red-800">
                  Source Information Unavailable
                </h3>
                <p className="text-sm text-red-700 leading-relaxed">
                  Source information cannot be loaded. The document database is temporarily unavailable.
                </p>
              </div>
            </div>
          </BaseCard>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {paginatedDocumentIds.map((documentId) => {
          const document = documents.get(documentId);
          const isLoadingDoc = loadingDocuments.has(documentId);

          // Skip database error documents - they're shown in the error card above
          if (document) {
            const isDatabaseError = (document as any)._isDatabaseError ||
              (document.document_type === 'error' && (
                document.summary?.toLowerCase().includes('source information cannot be loaded') ||
                document.summary?.toLowerCase().includes('database') ||
                document.summary?.toLowerCase().includes('database') ||
                document.summary?.toLowerCase().includes('unavailable') ||
                document.title?.toUpperCase().includes('ERROR') ||
                document.document_id?.toUpperCase().includes('ERROR')
              ));
            if (isDatabaseError) {
              return null;
            }
          }

          // If we're showing the error card and this document is still loading or not found,
          // don't show a loading skeleton - the error card covers it
          if (shouldShowErrorCard && (isLoadingDoc || !document)) {
            return null;
          }

          if (isLoadingDoc || !document) {
            return (
              <div
                key={documentId}
                className="border rounded-xl shadow-sm bg-card animate-pulse overflow-hidden"
                style={{ minHeight: '360px' }}
              >
                <div className="px-4 pt-3 pb-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded"></div>
                    <div className="h-6 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded"></div>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <div className="h-4 w-24 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded"></div>
                  <div className="h-20 w-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-lg"></div>
                  <div className="flex flex-wrap gap-1.5">
                    <div className="h-6 w-20 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-full"></div>
                    <div className="h-6 w-24 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-full"></div>
                    <div className="h-6 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-full"></div>
                  </div>
                </div>
                <div className="px-4 pt-2 pb-2 border-t mt-auto flex items-center gap-2">
                  <div className="h-8 flex-1 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded"></div>
                  <div className="h-8 w-20 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded"></div>
                </div>
              </div>
            );
          }

          return (
            <DocumentCard
              key={documentId}
              document={document}
              onRemove={onRemoveDocument}
              showRemoveButton={true}
              showExtended={true}
            />
          );
        })}
      </div>

      {/* No results for search */}
      {searchQuery && filteredDocumentIds.length === 0 && (
        <EmptyState
          icon={Search}
          title="No Matching Documents"
          description={`No documents found matching "${searchQuery}".`}
          primaryAction={{
            label: "Clear Search",
            onClick: () => setSearchQuery(''),
            icon: X,
          }}
        />
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              currentPage === 1
                ? "bg-slate-100 text-muted-foreground cursor-not-allowed opacity-50"
                : "bg-slate-100 text-foreground hover:bg-slate-200"
            )}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(page => {
                // Show first, last, current, and adjacent pages
                if (page === 1 || page === totalPages) return true;
                if (Math.abs(page - currentPage) <= 1) return true;
                return false;
              })
              .map((page, index, arr) => {
                // Add ellipsis if there's a gap
                const prevPage = arr[index - 1];
                const showEllipsis = prevPage && page - prevPage > 1;

                return (
                  <span key={page}>
                    {showEllipsis && (
                      <span className="px-2 text-muted-foreground">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPageValue(page)}
                      className={cn(
                        "w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200",
                        currentPage === page
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-slate-100 text-muted-foreground hover:text-foreground hover:bg-slate-200"
                      )}
                      aria-label={`Page ${page}`}
                      aria-current={currentPage === page ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  </span>
                );
              })}
          </div>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              currentPage === totalPages
                ? "bg-slate-100 text-muted-foreground cursor-not-allowed opacity-50"
                : "bg-slate-100 text-foreground hover:bg-slate-200"
            )}
            aria-label="Next page"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page info */}
      {totalPages > 1 && (
        <div className="text-center text-sm text-muted-foreground mt-4">
          Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredDocumentIds.length)} of {filteredDocumentIds.length} documents
        </div>
      )}
    </>
  );
};

export default DocumentsCardGrid;
