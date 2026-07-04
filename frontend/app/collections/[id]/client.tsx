"use client";

import { FC } from "react";
import { SearchDocument } from "@/types/search";
import { Pencil, ArrowLeft } from "lucide-react";
import CollectionDocumentsTable from "@/components/collection-documents-table";
import { VariantButton, TipCard, DeleteConfirmationDialog, PageContainer } from "@/lib/styles/components";
import CollectionLoadingSkeleton from "./_components/CollectionLoadingSkeleton";
import AddDocumentsDialog from "./_components/AddDocumentsDialog";
import EditCollectionForm from "./_components/EditCollectionForm";
import DocumentsToolbar from "./_components/DocumentsToolbar";
import DocumentsCardGrid from "./_components/DocumentsCardGrid";
import EmptyCollectionState from "./_components/EmptyCollectionState";
import { useCollection, ITEMS_PER_PAGE, INITIAL_LOAD_LIMIT } from "./_components/useCollection";

interface CollectionClientProps {
  id: string;
}

const CollectionClient: FC<CollectionClientProps> = ({ id }) => {
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
  } = useCollection(id);

  if (isLoading) {
    return <CollectionLoadingSkeleton />;
  }

  if (!collection) {
    return <PageContainer width="standard"fillViewport className="flex items-center justify-center">Collection not found</PageContainer>;
  }

  return (
    <PageContainer width="standard"fillViewport>
      {/* Return to Collections Button and Add Document Button */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <VariantButton
          intent="text"
          onClick={() => router.push('/collections')}
          icon={ArrowLeft}
          iconPosition="left"
        >
          Return to Collections
        </VariantButton>
        {!isEditing && (
          <div className="flex items-center gap-2">
            <VariantButton intent="icon"
              icon={Pencil}
              onClick={() => {
                setEditName(collection.name);
                setEditDescription(collection.description ?? "");
                setIsEditing(true);
              }}
              variant="muted"
              size="md"
              aria-label="Edit collection"
            />
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
          <TipCard
            className="mt-6"
            title="Tip"
            description='Add more documents from search results by clicking the"Add to Collection"button, or manually enter document IDs below to build your research collection.'
            dismissible
            onDismiss={() => setIsTipDismissed(true)}
          />
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
