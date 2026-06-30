import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CollectionWithDocuments } from "@/types/collection";
import { getCollection, updateCollection, addDocumentToCollection, removeDocumentFromCollection, deleteCollection, addDocumentsToCollection, loadAllCollectionDocuments } from "@/lib/api/collections";
import { SearchDocument } from "@/types/search";
import { toast } from "sonner";
import logger from "@/lib/logger";
import { showSuccessToast } from "@/lib/styles/components";
import { createErrorDocument } from "./errorDocument";

// Pagination constants
export const ITEMS_PER_PAGE = 12;
export const INITIAL_LOAD_LIMIT = 20;

export function useCollection(id: string) {
  // Memoize the logger to prevent infinite loops
  const pageLogger = useMemo(() => logger.child(`CollectionClient:${id}`), [id]);
  const router = useRouter();
  const [collection, setCollection] = useState<CollectionWithDocuments | null>(null);
  const [documents, setDocuments] = useState<Map<string, SearchDocument>>(new Map());
  const [loadingDocuments, setLoadingDocuments] = useState<Set<string>>(new Set());
  const [newDocumentIds, setNewDocumentIds] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isTipDismissed, setIsTipDismissed] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddDocumentDialogOpen, setIsAddDocumentDialogOpen] = useState(false);

  // Search and pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // State for loading all documents
  const [allDocumentsLoaded, setAllDocumentsLoaded] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [totalDocumentCount, setTotalDocumentCount] = useState(0);

  // View toggle: cards (default) vs full-columns table
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isLoadingFullTable, setIsLoadingFullTable] = useState(false);
  const [fullTableProgress, setFullTableProgress] = useState<{ loaded: number; total: number } | null>(null);

  // Reset tip dismissal state when collection ID changes
  useEffect(() => {
    setIsTipDismissed(false);
    setSearchQuery("");
    setCurrentPage(1);
    setAllDocumentsLoaded(false);
    setTotalDocumentCount(0);
    setViewMode('cards');
    setFullTableProgress(null);
  }, [id]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Filter documents based on search query
  const filteredDocumentIds = useMemo(() => {
    if (!collection) return [];
    if (!searchQuery.trim()) return collection.documents.map(String);

    const query = searchQuery.toLowerCase().trim();
    return collection.documents
      .map(String)
      .filter((docId) => {
        const doc = documents.get(docId);
        if (!doc) return true; // Include documents that haven't loaded yet

        // Search in document title, summary, document_id, court_name, etc.
        const issuingBodyName = typeof doc.issuing_body === 'string'
          ? doc.issuing_body
          : doc.issuing_body?.name;

        return (
          doc.document_id?.toLowerCase().includes(query) ||
          doc.title?.toLowerCase().includes(query) ||
          doc.summary?.toLowerCase().includes(query) ||
          doc.court_name?.toLowerCase().includes(query) ||
          issuingBodyName?.toLowerCase().includes(query) ||
          doc.document_number?.toLowerCase().includes(query)
        );
      });
  }, [collection, documents, searchQuery]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredDocumentIds.length / ITEMS_PER_PAGE);
  const paginatedDocumentIds = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDocumentIds.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredDocumentIds, currentPage]);

  pageLogger.info('CollectionClient mounted', { collectionId: id });

  const loadDocument = useCallback(async (documentId: string): Promise<void> => {
    // Check if already loaded or loading using a ref-like pattern
    setLoadingDocuments(prev => {
      if (prev.has(documentId)) {
        return prev; // Already loading
      }
      return new Set(prev).add(documentId);
    });

    try {
      const response = await fetch(`/api/documents/${documentId}`);
      if (!response.ok) {
        // Check if it's a database/application error (500 or 503 status codes)
        let isDatabaseError = false;
        try {
          const errorData = await response.json();
          const errorStr = JSON.stringify(errorData).toLowerCase();
          isDatabaseError =
            errorStr.includes('database') ||
            errorStr.includes('vector_db_unavailable') ||
            response.status === 503 ||
            response.status === 500;
        } catch {
          isDatabaseError = response.status === 503 || response.status === 500;
        }

        // Create error placeholder document
        const errorDoc = createErrorDocument(documentId, { isDatabaseError });

        setDocuments(prev => {
          if (prev.has(documentId)) {
            return prev; // Already loaded
          }
          const newMap = new Map(prev);
          newMap.set(documentId, errorDoc);
          return newMap;
        });
        return;
      }
      const data = await response.json();

      setDocuments(prev => {
        if (prev.has(documentId)) {
          return prev; // Already loaded
        }
        const newMap = new Map(prev);
        newMap.set(documentId, data.document);
        return newMap;
      });
    } catch (error) {
      // Check if it's a database/application error
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const isDatabaseError =
        errorMessage.includes('database') ||
        errorMessage.includes('vector_db_unavailable') ||
        errorMessage.includes('503') ||
        errorMessage.includes('500');

      // Create error placeholder document
      const errorDoc = createErrorDocument(documentId, { isDatabaseError });

      setDocuments(prev => {
        if (prev.has(documentId)) {
          return prev; // Already loaded
        }
        const newMap = new Map(prev);
        newMap.set(documentId, errorDoc);
        return newMap;
      });

      pageLogger.error('Failed to load document', error, {
        documentId,
        context: 'loadDocument',
        isDatabaseError
      });
      if (!isDatabaseError) {
        toast.error(`Failed to load document ${documentId}`);
      }
    } finally {
      setLoadingDocuments(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentId);
        return newSet;
      });
    }
  }, [pageLogger]);

  const loadCollection = useCallback(async (loadAll = false): Promise<void> => {
    pageLogger.debug('Loading collection', { id, loadAll });
    try {
      // Load with pagination - first 20 documents initially, or all if loadAll is true
      const options = loadAll ? {} : { limit: INITIAL_LOAD_LIMIT };
      const data = await getCollection(id, options);

      // document_count from backend is the total count
      const total = data.document_count || data.documents.length;
      setTotalDocumentCount(total);

      // Check if all documents are loaded
      const isAllLoaded = loadAll || data.documents.length >= total;
      setAllDocumentsLoaded(isAllLoaded);

      pageLogger.info('Collection loaded successfully', {
        id: data.id,
        name: data.name,
        loadedDocuments: data.documents.length,
        totalDocuments: total,
        allLoaded: isAllLoaded
      });
      setCollection(data);
      setEditName(data.name);
      setEditDescription(data.description ?? "");

      // Load document details for each document in the collection
      data.documents.forEach((docId) => {
        loadDocument(String(docId));
      });
    } catch (error) {
      pageLogger.error('Failed to load collection', error, {
        id,
        context: 'loadCollection'
      });
    } finally {
      setIsLoading(false);
      setIsLoadingAll(false);
      pageLogger.debug('Collection loading completed');
    }
  }, [id, pageLogger, loadDocument]);

  const handleLoadAllDocuments = useCallback(async (): Promise<void> => {
    setIsLoadingAll(true);
    await loadCollection(true);
  }, [loadCollection]);

  const ensureAllDocumentsFetched = useCallback(async (docIds: string[]): Promise<boolean> => {
    const missing = docIds.filter(
      (id) => !documents.has(id) || documents.get(id)?.base_fields == null
    );
    if (missing.length === 0) return true;

    setIsLoadingFullTable(true);
    setFullTableProgress({ loaded: docIds.length - missing.length, total: docIds.length });
    try {
      const fetched = await loadAllCollectionDocuments(missing, (progress) => {
        setFullTableProgress({
          loaded: docIds.length - missing.length + progress.loaded,
          total: docIds.length,
        });
      });

      setDocuments((prev) => {
        const next = new Map(prev);
        for (const doc of fetched) {
          if (doc?.document_id) {
            next.set(doc.document_id, doc);
          }
        }
        return next;
      });

      // If any IDs came back without a payload, mark them as not-found errors so
      // the table still renders a row instead of staying blank.
      const fetchedIds = new Set(fetched.map((d) => d?.document_id).filter(Boolean) as string[]);
      const notFound = missing.filter((id) => !fetchedIds.has(id));
      if (notFound.length > 0) {
        setDocuments((prev) => {
          const next = new Map(prev);
          for (const id of notFound) {
            if (!next.has(id)) {
              next.set(id, createErrorDocument(id));
            }
          }
          return next;
        });
      }
      return true;
    } catch (error) {
      pageLogger.error('Failed to load all documents for table view', error, {
        collectionId: id,
        missingCount: missing.length,
      });
      toast.error('Failed to load all documents');
      return false;
    } finally {
      setIsLoadingFullTable(false);
      setFullTableProgress(null);
    }
  }, [documents, id, pageLogger]);

  const handleViewModeChange = useCallback(async (mode: 'cards' | 'table'): Promise<void> => {
    if (mode === viewMode) return;
    if (mode === 'cards') {
      setViewMode('cards');
      return;
    }
    const docIds = (collection?.documents ?? []).map(String);
    if (docIds.length === 0) {
      setViewMode('table');
      return;
    }
    const ok = await ensureAllDocumentsFetched(docIds);
    if (ok) setViewMode('table');
  }, [collection?.documents, ensureAllDocumentsFetched, viewMode]);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

  const handleAddDocuments = async (): Promise<void> => {
    if (!newDocumentIds.trim()) {
      pageLogger.warn('Attempted to add documents with empty input');
      return;
    }

    // Parse document IDs - support comma, newline, or space separated
    const documentIds = newDocumentIds
      .split(/[\n,\s]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (documentIds.length === 0) {
      pageLogger.warn('No valid document IDs found in input');
      toast.error("Please enter at least one document ID");
      return;
    }

    pageLogger.info('Adding documents to collection', {
      collectionId: id,
      documentCount: documentIds.length,
      currentDocumentCount: collection?.documents.length
    });
    setIsAdding(true);
    try {
      if (documentIds.length === 1) {
        // Single document - use existing endpoint
        await addDocumentToCollection(id, documentIds[0]);
        toast.success("Document added to collection successfully");
      } else {
        // Multiple documents - use batch endpoint
        const result = await addDocumentsToCollection(id, documentIds);
        if (result.failed.length === 0) {
          toast.success(`Added ${result.added.length} documents to collection`);
        } else if (result.added.length > 0) {
          toast.warning(`Added ${result.added.length} documents, ${result.failed.length} failed`);
        } else {
          toast.error(`Failed to add documents: ${result.failed.map(f => f.document_id).join(', ')}`);
        }
      }
      await loadCollection();
      setNewDocumentIds("");
      setIsAddDocumentDialogOpen(false);
      pageLogger.info('Documents added successfully', {
        collectionId: id,
        documentCount: documentIds.length
      });
    } catch (error) {
      pageLogger.error('Failed to add documents', error, {
        collectionId: id,
        documentIds,
        context: 'handleAddDocuments'
      });
      toast.error("Failed to add documents to collection");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveDocument = async (documentId: string): Promise<void> => {
    pageLogger.info('Removing document from collection', {
      collectionId: id,
      documentId,
      currentDocumentCount: collection?.documents.length
    });
    try {
      await removeDocumentFromCollection(id, documentId);
      await loadCollection();
      pageLogger.info('Document removed successfully', {
        collectionId: id,
        documentId
      });
    } catch (error) {
      pageLogger.error('Failed to remove document', error, {
        collectionId: id,
        documentId,
        context: 'handleRemoveDocument'
      });
    }
  };

  const handleUpdateCollection = async (): Promise<void> => {
    if (!editName.trim()) {
      pageLogger.warn('Attempted to update collection with empty name');
      return;
    }

    const oldName = collection?.name;
    const oldDescription = collection?.description;
    pageLogger.info('Updating collection', {
      collectionId: id,
      oldName,
      newName: editName,
      oldDescription,
      newDescription: editDescription
    });
    try {
      await updateCollection(id, editName, editDescription || undefined);
      setCollection(prev => prev ? { ...prev, name: editName, description: editDescription || undefined } : null);
      setIsClosing(true);
      setTimeout(() => {
        setIsEditing(false);
        setIsClosing(false);
        setEditName("");
        setEditDescription("");
      }, 300);
      pageLogger.info('Collection updated successfully', {
        collectionId: id,
        oldName,
        newName: editName,
        oldDescription,
        newDescription: editDescription
      });
      toast.success("Collection updated successfully");
    } catch (error) {
      pageLogger.error('Failed to update collection', error, {
        collectionId: id,
        oldName,
        newName: editName,
        context: 'handleUpdateCollection'
      });
      toast.error("Failed to update collection");
    }
  };

  const handleDeleteCollection = async (): Promise<void> => {
    if (!collection || isDeleting) {
      return;
    }

    setIsDeleting(true);
    const collectionName = collection.name;
    try {
      await deleteCollection(id);
      pageLogger.info('Collection deleted successfully', {
        collectionId: id,
        collectionName,
      });
      showSuccessToast({
        title: "Collection deleted",
        description: `"${collectionName}" has been deleted`,
        icon: null,
      });
      router.push('/collections');
    } catch (error) {
      pageLogger.error('Failed to delete collection', error, {
        collectionId: id,
        context: 'handleDeleteCollection',
      });
      toast.error("Failed to delete collection");
      setIsDeleting(false);
    }
  };

  return {
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
  };
}
