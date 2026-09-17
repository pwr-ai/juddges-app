"use client";

import { FC } from "react";
import { SearchDocument } from "@/types/search";
import { Pencil, ArrowLeft, Lightbulb, X } from "lucide-react";
import CollectionDocumentsTable from "@/components/collection-documents-table";
import { Button } from "@/components/ui/button";
import { EditorialCard } from "@/components/editorial";
import { DeleteConfirmationDialog, PageContainer } from "@/lib/styles/components";
import CollectionLoadingSkeleton from "./_components/CollectionLoadingSkeleton";
import AddDocumentsDialog from "./_components/AddDocumentsDialog";
import EditCollectionForm from "./_components/EditCollectionForm";
import DocumentsToolbar from "./_components/DocumentsToolbar";
import DocumentsCardGrid from "./_components/DocumentsCardGrid";
import EmptyCollectionState from "./_components/EmptyCollectionState";
import { useCollection, ITEMS_PER_PAGE, INITIAL_LOAD_LIMIT } from "./_components/useCollection";
import type { CollectionWithDocuments } from "@/types/collection";
import { useEffect } from "react";
import { useCollectionDetail } from "@/contexts/CollectionDetailContext";

interface CollectionClientProps {
  id: string;
  initialCollection: CollectionWithDocuments;
}

const CollectionClient: FC<CollectionClientProps> = ({ id, initialCollection }) => {
  const { setCollectionDetail } = useCollectionDetail();
  const {
    router,
    collection,
    documents,
    loadingDocuments,
    newDocumentIds,
    setNewDocumentIds,
    isLoading,
    isAdding,
    isEditing,
    setIsEditing,
    isClosing,
    setIsClosing,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    isTipDismissed,
    setIsTipDismissed,
    deleteDialogOpen,
    setDeleteDialogOpen,
    isDeleting,
    isAddDocumentDialogOpen,
    setIsAddDocumentDialogOpen,
    searchQuery,
    setSearchQuery,
    currentPage,
    setCurrentPage,
    allDocumentsLoaded,
    isLoadingAll,
    totalDocumentCount,
    viewMode,
    isLoadingFullTable,
    fullTableProgress,
    filteredDocumentIds,
    totalPages,
    paginatedDocumentIds,
    handleLoadAllDocuments,
    handleViewModeChange,
    handleAddDocuments,
    handleRemoveDocument,
    handleUpdateCollection,
    handleDeleteCollection,
  } = useCollection(id, initialCollection);

  useEffect(() => {
    if (!collection) {
      return;
    }
    setCollectionDetail({
      id: collection.id,
      name: collection.name,
      description: collection.description,
    });
    return () => {
      setCollectionDetail((current) =>
        current?.id === collection.id ? null : current
      );
    };
  }, [collection, setCollectionDetail]);

  if (isLoading) {
    return <CollectionLoadingSkeleton />;
  }

  if (!collection) {
    return <PageContainer width="standard" fillViewport className="flex items-center justify-center">Collection not found</PageContainer>;
  }

  return (
    <PageContainer width="standard" fillViewport>
      {/* Return to Collections Button and Add Document Button */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/collections')}
          className="rounded-none font-mono text-xs text-ink-soft hover:text-ink hover:bg-transparent p-0 gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Return to Collections
        </Button>
        {!isEditing && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditName(collection.name);
                setEditDescription(collection.description ?? "");
                setIsEditing(true);
              }}
              className="rounded-none border-rule text-ink font-mono text-xs hover:border-ink hover:bg-parchment-deep gap-1.5"
              aria-label="Edit collection"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <AddDocumentsDialog
              open={isAddDocumentDialogOpen}
              onOpenChange={setIsAddDocumentDialogOpen}
              newDocumentIds={newDocumentIds}
              setNewDocumentIds={setNewDocumentIds}
              onAddDocuments={handleAddDocuments}
              isAdding={isAdding}
            />
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            {isEditing ? (
              <EditCollectionForm
                editName={editName}
                setEditName={setEditName}
                editDescription={editDescription}
                setEditDescription={setEditDescription}
                isClosing={isClosing}
                onSave={handleUpdateCollection}
                onCancel={() => {
                  setIsClosing(true);
                  setTimeout(() => {
                    setIsEditing(false);
                    setIsClosing(false);
                    setEditName("");
                    setEditDescription("");
                  }, 300);
                }}
              />
            ) : (
              <div className="mb-6">
                {collection.description && (
                  <p className="text-sm text-muted-foreground text-center">
                    {collection.description}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      <div className="mt-4">
        {collection.documents.length > 0 && (
          <>
            <DocumentsToolbar
              loadedDocumentCount={collection.documents.length}
              totalDocumentCount={totalDocumentCount}
              allDocumentsLoaded={allDocumentsLoaded}
              initialLoadLimit={INITIAL_LOAD_LIMIT}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              isLoadingFullTable={isLoadingFullTable}
              fullTableProgress={fullTableProgress}
              isLoadingAll={isLoadingAll}
              onLoadAllDocuments={handleLoadAllDocuments}
              showSearch={collection.documents.length > 3}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filteredCount={filteredDocumentIds.length}
            />
          </>
        )}

        {/* Full-columns table view */}
        {viewMode === 'table' && collection.documents.length > 0 && (
          <CollectionDocumentsTable
            documents={collection.documents
              .map((docId) => documents.get(String(docId)))
              .filter((d): d is SearchDocument => Boolean(d))}
            collectionName={collection.name}
            searchQuery={searchQuery}
          />
        )}

        {/* Card grid (existing) */}
        {viewMode === 'cards' && (
          <DocumentsCardGrid
            collectionDocumentIds={collection.documents}
            documents={documents}
            loadingDocuments={loadingDocuments}
            paginatedDocumentIds={paginatedDocumentIds}
            onRemoveDocument={handleRemoveDocument}
            searchQuery={searchQuery}
            filteredDocumentIds={filteredDocumentIds}
            setSearchQuery={setSearchQuery}
            totalPages={totalPages}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            setCurrentPageValue={setCurrentPage}
            itemsPerPage={ITEMS_PER_PAGE}
          />
        )}

        {collection.documents.length === 0 && (
          <EmptyCollectionState
            newDocumentIds={newDocumentIds}
            setNewDocumentIds={setNewDocumentIds}
            onAddDocuments={handleAddDocuments}
            isAdding={isAdding}
            onGoToSearch={() => router.push('/search')}
          />
        )}

        {/* Help text for small collections */}
        {collection && collection.documents.length > 0 && collection.documents.length < 3 && !isTipDismissed && (
          <EditorialCard flat className="mt-6 p-4 border-rule bg-parchment-deep relative">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Lightbulb className="h-4 w-4 text-gold shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-serif font-semibold text-sm text-ink">Tip</h4>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    Add more documents from search results by clicking the &quot;Add to Collection&quot; button, or manually enter document IDs below to build your research collection.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTipDismissed(true)}
                className="p-1 text-ink-soft hover:text-ink transition-colors"
                aria-label="Dismiss tip"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </EditorialCard>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Collection"
        itemName="collection"
        itemTitle={collection?.name}
        isDeleting={isDeleting}
        onConfirm={handleDeleteCollection}
      />
    </PageContainer>
  );
}

export default CollectionClient;
