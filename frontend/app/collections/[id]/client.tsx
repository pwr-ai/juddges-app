"use client";

import { useState, useEffect, useCallback, useMemo, FC } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CollectionWithDocuments } from "@/types/collection";
import { getCollection, updateCollection, addDocumentToCollection, removeDocumentFromCollection, deleteCollection, addDocumentsToCollection } from "@/lib/api/collections";
import { SearchDocument } from "@/types/search";
import { Plus, FileText, Lightbulb, Play, Wand2, Sparkles, Pencil, X, Zap, FolderOpen, ArrowLeft, AlertTriangle, MessageSquare, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import logger from "@/lib/logger";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Header, PrimaryButton, SecondaryButton, IconButton, BaseCard, TipCard, EmptyState, AIBadge, SectionHeader, SubsectionHeader, DeleteConfirmationDialog, showSuccessToast, TextButton, ItemEditingButtons, DocumentCard, PageContainer, LightCard, GlassButton } from "@/lib/styles/components";

interface CollectionClientProps {
  id: string;
}

// Pagination constants
const ITEMS_PER_PAGE = 12;
const INITIAL_LOAD_LIMIT = 20;

const CollectionClient: FC<CollectionClientProps> = ({ id }) => {
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
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
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

  // Reset tip dismissal state when collection ID changes
  useEffect(() => {
    setIsTipDismissed(false);
    setIsBannerDismissed(false);
    setSearchQuery("");
    setCurrentPage(1);
    setAllDocumentsLoaded(false);
    setTotalDocumentCount(0);
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
        const errorDoc: SearchDocument = {
          document_id: documentId,
          document_type: 'error',
          summary: isDatabaseError
            ? "Source information cannot be loaded!"
            : "Document was not found!",
          ...(isDatabaseError && { _isDatabaseError: true }),
          title: null,
          date_issued: null,
          issuing_body: null,
          language: null,
          document_number: null,
          country: null,
          full_text: null,
          thesis: null,
          legal_references: null,
          legal_concepts: null,
          keywords: null,
          score: null,
          court_name: null,
          department_name: null,
          presiding_judge: null,
          judges: null,
          parties: null,
          outcome: null,
          legal_bases: null,
          extracted_legal_bases: null,
          references: null,
          factual_state: null,
          legal_state: null,
        };
        
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
      const errorDoc: SearchDocument = {
        document_id: documentId,
        document_type: 'error',
        summary: isDatabaseError
          ? "Source information cannot be loaded!"
          : "Document was not found!",
        ...(isDatabaseError && { _isDatabaseError: true }),
        title: null,
        date_issued: null,
        issuing_body: null,
        language: null,
        document_number: null,
        country: null,
        full_text: null,
        thesis: null,
        legal_references: null,
        legal_concepts: null,
        keywords: null,
        score: null,
        court_name: null,
        department_name: null,
        presiding_judge: null,
        judges: null,
        parties: null,
        outcome: null,
        legal_bases: null,
        extracted_legal_bases: null,
        references: null,
        factual_state: null,
        legal_state: null,
      };
      
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
    try {
      // Actually delete from database
      await deleteCollection(id);
      
      const collectionName = collection.name;
      pageLogger.info('Collection deleted successfully', {
        collectionId: id,
        collectionName
      });

      // Show toast with undo option
      showSuccessToast({
        title: "Collection deleted",
        description: `"${collectionName}" has been deleted`,
        icon: null,
        secondaryAction: {
          label: "Undo",
          onClick: async () => {
            // Restore collection - reload from server
            await loadCollection();
            pageLogger.info('Collection deletion cancelled', {
              collectionId: id,
              collectionName
            });
          }
        },
        onDismiss: () => {
          // Navigate back to collections page after toast is dismissed
          router.push('/collections');
        }
      });
    } catch (error) {
      pageLogger.error('Failed to delete collection', error, {
        collectionId: id,
        context: 'handleDeleteCollection'
      });
      toast.error("Failed to delete collection");
      setIsDeleting(false);
    }
  };

  const handleStartExtraction = (): void => {
    pageLogger.info('Navigating to extraction page', {
      collectionId: id,
      documentCount: collection?.documents.length
    });
    router.push(`/extract?collection=${id}`);
  };

  const handleGenerateSchema = (): void => {
    pageLogger.info('Navigating to schema generation', {
      collectionId: id,
      documentCount: collection?.documents.length
    });
    router.push(`/schema-chat?collection=${id}`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1600px]">
        {/* Header skeleton */}
        <div className="mb-10">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex-1">
              <div className="flex items-baseline gap-3 flex-wrap mb-3">
                <div className="h-8 w-48 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
                <div className="h-7 w-28 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full animate-pulse"></div>
                <div className="h-8 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
              </div>
              <div className="h-1 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full animate-pulse"></div>
            </div>
            <div className="h-8 w-32 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-md animate-pulse"></div>
          </div>
        </div>

        {/* Extraction banner skeleton */}
        <div className="mt-8 p-6 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent dark:from-primary/10 dark:via-primary/5 dark:to-transparent shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20 shrink-0 w-9 h-9 animate-pulse"></div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-6 w-3/4 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
              <div className="h-4 w-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-4 border-t border-primary/10">
            <div className="h-4 w-64 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
            <div className="flex gap-2">
              <div className="h-9 w-32 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
              <div className="h-9 w-36 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Document cards skeleton */}
        <div className="mt-8">
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mb-6"></div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="border rounded-xl shadow-sm bg-card animate-pulse overflow-hidden"
                style={{ minHeight: '360px' }}
              >
                <div className="px-4 pt-3 pb-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded"></div>
                    <div className="h-6 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded"></div>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <div className="h-4 w-24 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded"></div>
                  <div className="h-20 w-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-lg"></div>
                  <div className="flex flex-wrap gap-1.5">
                    <div className="h-6 w-20 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full"></div>
                    <div className="h-6 w-24 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full"></div>
                    <div className="h-6 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full"></div>
                  </div>
                </div>
                <div className="px-4 pt-2 pb-2 border-t mt-auto flex items-center gap-2">
                  <div className="h-8 flex-1 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded"></div>
                  <div className="h-8 w-20 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!collection) {
    return <PageContainer width="standard" fillViewport className="flex items-center justify-center">Collection not found</PageContainer>;
  }

  return (
    <PageContainer width="standard" fillViewport>
      {/* Return to Collections Button and Add Document Button */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <TextButton
          onClick={() => router.push('/collections')}
          icon={ArrowLeft}
          iconPosition="left"
        >
          Return to Collections
        </TextButton>
        {!isEditing && (
          <Dialog
            open={isAddDocumentDialogOpen}
            onOpenChange={(open) => {
              setIsAddDocumentDialogOpen(open);
              if (!open) {
                // Clear input when dialog closes
                setNewDocumentIds("");
              }
            }}
          >
            <DialogTrigger asChild>
              <GlassButton
                className="w-auto shrink-0 h-9 px-6"
              >
                <Plus className="h-4 w-4" />
                Add Documents
              </GlassButton>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] [&>button:last-child]:hidden">
              <DialogPrimitive.Close asChild>
                <IconButton
                  icon={X}
                  onClick={() => {}}
                  variant="muted"
                  size="md"
                  aria-label="Close"
                  className="absolute top-4 right-4 z-50 !h-10 !w-10 !p-2"
                />
              </DialogPrimitive.Close>
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-br from-foreground via-primary to-primary bg-clip-text text-transparent">
                  Add Documents to Collection
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                  Enter document IDs to add them to this collection. You can add multiple IDs separated by commas, spaces, or new lines.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="document-ids">Document IDs</Label>
                  <Textarea
                    id="document-ids"
                    placeholder="Enter document IDs (one per line, or comma/space separated)&#10;Example:&#10;II FSK 1234/21&#10;II FSK 5678/22&#10;0111-KDIB1-2.4010.123.2023.1.ANK"
                    value={newDocumentIds}
                    onChange={(e) => setNewDocumentIds(e.target.value)}
                    rows={6}
                    className="border-slate-200/50 dark:border-slate-800/50 focus:border-primary/30 focus:ring-2 focus:ring-primary/20 hover:border-primary/20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md shadow-lg hover:shadow-xl rounded-xl transition-all duration-300 resize-none font-mono text-sm"
                  />
                  {newDocumentIds.trim() && (
                    <p className="text-xs text-muted-foreground">
                      {newDocumentIds.split(/[\n,\s]+/).filter(id => id.trim().length > 0).length} document ID(s) detected
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <SecondaryButton
                    onClick={() => {
                      setNewDocumentIds("");
                      setIsAddDocumentDialogOpen(false);
                    }}
                    size="sm"
                  >
                    Cancel
                  </SecondaryButton>
                  <GlassButton
                    onClick={handleAddDocuments}
                    disabled={!newDocumentIds.trim() || isAdding}
                    isLoading={isAdding}
                    className="w-auto shrink-0 h-9 px-6"
                  >
                    Add Documents
                  </GlassButton>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            {isEditing ? (
              <BaseCard
                title="Edit Collection"
                icon={Pencil}
                clickable={false}
                className={cn(
                  "rounded-xl p-6",
                  isClosing ? "animate-fade-out-down" : "animate-scale-in"
                )}
              >
                <div className="space-y-5 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name" className="text-sm font-semibold">
                      Collection Name <span className="text-destructive">*</span>
                      <span className="sr-only"> (required)</span>
                    </Label>
                <Input
                      id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editName.trim()) {
                          handleUpdateCollection();
                        }
                      }}
                      className="text-lg font-semibold border-slate-200/50 dark:border-slate-800/50 focus:border-primary/30 focus:ring-2 focus:ring-primary/20 hover:border-primary/20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md shadow-lg hover:shadow-xl rounded-xl transition-all duration-300"
                  placeholder="Collection name"
                />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description" className="text-sm font-semibold">
                      Description (optional)
                    </Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditDescription(e.target.value)}
                      placeholder="Describe the purpose of this collection, research questions, or scope..."
                      rows={4}
                      className="border-slate-200/50 dark:border-slate-800/50 focus:border-primary/30 focus:ring-2 focus:ring-primary/20 hover:border-primary/20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md shadow-lg hover:shadow-xl rounded-xl transition-all duration-300 resize-none"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <PrimaryButton onClick={handleUpdateCollection} size="sm" disabled={!editName.trim()}>
                      Save Changes
                    </PrimaryButton>
                    <SecondaryButton onClick={() => {
                      setIsClosing(true);
                      setTimeout(() => {
                        setIsEditing(false);
                        setIsClosing(false);
                        setEditName("");
                        setEditDescription("");
                      }, 300);
                    }} size="sm">
                      Cancel
                    </SecondaryButton>
                  </div>
              </div>
              </BaseCard>
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

        {/* Extraction ready banner */}
        {collection.documents.length > 0 && !isBannerDismissed && (
          <BaseCard
            className="mt-4 p-6 rounded-xl border-primary/20 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent dark:from-primary/10 dark:via-primary/5 dark:to-transparent shadow-sm relative"
            clickable={false}
          >
            <IconButton
              icon={X}
              onClick={() => setIsBannerDismissed(true)}
              variant="muted"
              size="lg"
              aria-label="Dismiss banner"
              className="absolute top-4 right-4 z-10"
            />
            <div className="flex items-start gap-3 mb-4 pr-12">
              <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20 shrink-0">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <h3 className="font-semibold text-foreground">
                    Ready to extract data from this collection?
                  </h3>
                  <AIBadge 
                    text="AI" 
                    icon={Zap} 
                    className="h-8 px-4 text-sm [&>svg]:h-4 [&>svg]:w-4"
                  />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Generate a custom schema or start extraction with an existing schema to analyze your {totalDocumentCount} {totalDocumentCount === 1 ? 'document' : 'documents'}.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-primary/10">
              <div className="flex items-center gap-2 text-xs">
                <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Need help creating an expert-adjusted schema?{" "}
                  <Link href="/contact" className="font-semibold text-primary hover:text-primary/80 underline-offset-4">
                    Contact Us
                  </Link>
                </span>
              </div>
              <div className="flex flex-row gap-2 shrink-0 sm:justify-end">
                <SecondaryButton
                  size="sm"
                  onClick={handleGenerateSchema}
                  icon={Wand2}
                >
                  Generate Schema
                </SecondaryButton>
                <GlassButton
                  onClick={handleStartExtraction}
                  className="w-auto shrink-0 h-9 px-6"
                >
                  <Play className="h-4 w-4" />
                  Start Extraction
                </GlassButton>
              </div>
            </div>
          </BaseCard>
        )}

      </div>

      <div className="mt-4">
        {collection.documents.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <SectionHeader
                title="Documents"
                description={
                  allDocumentsLoaded
                    ? `${totalDocumentCount} ${totalDocumentCount === 1 ? 'document' : 'documents'} in this collection`
                    : `Showing ${collection.documents.length} of ${totalDocumentCount} documents (newest first)`
                }
                className="mb-0"
              />
              {!allDocumentsLoaded && totalDocumentCount > INITIAL_LOAD_LIMIT && (
                <SecondaryButton
                  onClick={handleLoadAllDocuments}
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

            {/* Search Bar */}
            {collection.documents.length > 3 && (
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>

                {/* Results count */}
                {searchQuery && (
                  <div className="text-sm text-muted-foreground mt-2">
                    Found <span className="font-semibold text-foreground">{filteredDocumentIds.length}</span> matching document{filteredDocumentIds.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        
        {/* Check for database errors */}
        {(() => {
          const loadedDocuments = Array.from(collection.documents)
            .map(docId => documents.get(String(docId)))
            .filter(Boolean) as SearchDocument[];
          
          // Check for database errors: either has _isDatabaseError flag, or is error type with Weaviate-related summary
          // Also check for documents with "ERROR" in title or document_id (common pattern for error documents)
          const databaseErrors = loadedDocuments.filter((doc: SearchDocument) => {
            if ((doc as any)._isDatabaseError) return true;
            if (doc.document_type === 'error') {
              // If summary mentions database-related issues, it's a Weaviate error
              if (doc.summary?.toLowerCase().includes('source information cannot be loaded') ||
                  doc.summary?.toLowerCase().includes('database') ||
                  doc.summary?.toLowerCase().includes('database') ||
                  doc.summary?.toLowerCase().includes('unavailable')) {
                return true;
              }
              // If document has "ERROR" in title and is error type, treat as Weaviate error
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
          const allDocMetadataLoaded = loadedDocuments.length === collection.documents.length;
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
                      "border-red-200/50 dark:border-red-900/30",
                      "bg-gradient-to-br from-red-50/50 via-red-50/50 to-orange-50/30 dark:from-red-950/30 dark:via-red-950/20 dark:to-orange-950/20",
                      "shadow-lg shadow-red-500/10",
                      "animate-in fade-in slide-in-from-top-2 duration-300"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative flex-shrink-0">
                        <div className="absolute inset-0 bg-red-500/20 rounded-lg blur-sm" />
                        <div className="relative bg-gradient-to-br from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 rounded-lg p-2">
                          <AlertTriangle className="h-4 w-4 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <h3 className="font-semibold text-sm text-red-800 dark:text-red-200">
                          Source Information Unavailable
                        </h3>
                        <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
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
                    <div className="h-4 w-32 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded"></div>
                    <div className="h-6 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded"></div>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <div className="h-4 w-24 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded"></div>
                  <div className="h-20 w-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-lg"></div>
                  <div className="flex flex-wrap gap-1.5">
                    <div className="h-6 w-20 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full"></div>
                    <div className="h-6 w-24 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full"></div>
                    <div className="h-6 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full"></div>
                  </div>
                </div>
                <div className="px-4 pt-2 pb-2 border-t mt-auto flex items-center gap-2">
                  <div className="h-8 flex-1 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded"></div>
                  <div className="h-8 w-20 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded"></div>
                </div>
              </div>
            );
          }

          return (
            <DocumentCard
              key={documentId}
              document={document}
              onRemove={handleRemoveDocument}
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
                        ? "bg-slate-100 dark:bg-slate-800 text-muted-foreground cursor-not-allowed opacity-50"
                        : "bg-slate-100 dark:bg-slate-800 text-foreground hover:bg-slate-200 dark:hover:bg-slate-700"
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
                              onClick={() => setCurrentPage(page)}
                              className={cn(
                                "w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200",
                                currentPage === page
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "bg-slate-100 dark:bg-slate-800 text-muted-foreground hover:text-foreground hover:bg-slate-200 dark:hover:bg-slate-700"
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
                        ? "bg-slate-100 dark:bg-slate-800 text-muted-foreground cursor-not-allowed opacity-50"
                        : "bg-slate-100 dark:bg-slate-800 text-foreground hover:bg-slate-200 dark:hover:bg-slate-700"
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
                  Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredDocumentIds.length)} of {filteredDocumentIds.length} documents
                </div>
              )}
            </>
          );
        })()}

        {collection.documents.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={FileText}
              title="Empty Collection"
              description="Start building your research collection by adding relevant legal documents."
              tipPosition="below"
              tip={
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto text-left">
                  <LightCard
                    title={
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <MessageSquare className="h-6 w-6 text-primary" />
                        </div>
                        <span className="text-base font-semibold">AI Assistant</span>
                      </div>
                    }
                    padding="lg"
                    showBorder={true}
                    showShadow={false}
                  >
                    <div className="mt-3 space-y-4">
                      <p className="text-base text-muted-foreground leading-relaxed">Ask the AI assistant to find relevant documents and add them to your collection.</p>
                      <PrimaryButton
                        size="sm"
                        icon={MessageSquare}
                        onClick={() => router.push("/chat")}
                        className="w-full"
                      >
                        Open Chat
                      </PrimaryButton>
                    </div>
                  </LightCard>
                  <LightCard
                    title={
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Search className="h-6 w-6 text-primary" />
                        </div>
                        <span className="text-base font-semibold">Search Documents</span>
                      </div>
                    }
                    padding="lg"
                    showBorder={true}
                    showShadow={false}
                  >
                    <div className="mt-3 space-y-4">
                      <p className="text-base text-muted-foreground leading-relaxed">Search for legal documents and add them directly from the results page.</p>
                      <PrimaryButton
                        size="sm"
                        icon={Search}
                        onClick={() => router.push("/search")}
                        className="w-full"
                      >
                        Go to Search
                      </PrimaryButton>
                    </div>
                  </LightCard>
                  <LightCard
                    title={
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Plus className="h-6 w-6 text-primary" />
                        </div>
                        <span className="text-base font-semibold">Add by ID</span>
                      </div>
                    }
                    padding="lg"
                    showBorder={true}
                    showShadow={false}
                  >
                    <div className="mt-3 space-y-4">
                      <p className="text-base text-muted-foreground leading-relaxed">Have document IDs? Enter them below to add directly.</p>
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Enter document IDs (one per line or comma-separated)"
                          value={newDocumentIds}
                          onChange={(e) => setNewDocumentIds(e.target.value)}
                          rows={3}
                          className="w-full font-mono text-sm resize-none"
                        />
                        <GlassButton
                          onClick={handleAddDocuments}
                          disabled={!newDocumentIds.trim() || isAdding}
                          isLoading={isAdding}
                          className="w-full"
                        >
                          <Plus className="h-4 w-4" />
                          Add Documents
                        </GlassButton>
                      </div>
                    </div>
                  </LightCard>
                </div>
              }
            />
          </div>
        )}

        {/* Help text for small collections */}
        {collection && collection.documents.length > 0 && collection.documents.length < 3 && !isTipDismissed && (
          <TipCard
            className="mt-6"
            title="Tip"
            description='Add more documents from search results by clicking the "Add to Collection" button, or manually enter document IDs below to build your research collection.'
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

