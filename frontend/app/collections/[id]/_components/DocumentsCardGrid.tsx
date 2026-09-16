import { FC } from "react";
import { Search, X, AlertTriangle } from "lucide-react";
import { SearchDocument } from "@/types/search";
import { EmptyState, DocumentCard } from "@/lib/styles/components";
import { EditorialCard, EditorialCardSkeleton, EditorialPagination } from "@/components/editorial";

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
      const text = `${doc.title || ''} ${doc.summary || ''}`.toLowerCase();
      return text.includes('database') || text.includes('cannot be loaded') || text.includes('unavailable');
    }
    return false;
  });
  const shouldShowErrorCard = hasDatabaseErrors || allLoadedAreErrors;

  return (
    <>
      {/* Single error card for all database errors */}
      {shouldShowErrorCard && (
        <div className="mb-4">
          <EditorialCard flat className="p-4 border-oxblood/40 bg-parchment-deep">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-oxblood shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <h3 className="font-serif font-semibold text-sm text-oxblood">
                  Source Information Unavailable
                </h3>
                <p className="text-xs text-ink-soft leading-relaxed">
                  Source information cannot be loaded. The document database is temporarily unavailable.
                </p>
              </div>
            </div>
          </EditorialCard>
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
              <EditorialCardSkeleton
                key={documentId}
                minHeight="360px"
              />
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
      <EditorialPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => setCurrentPageValue(page)}
        totalItems={filteredDocumentIds.length}
        itemsPerPage={itemsPerPage}
        itemLabel="documents"
      />
    </>
  );
};

export default DocumentsCardGrid;
