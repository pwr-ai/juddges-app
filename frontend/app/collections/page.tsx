"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CollectionWithDocuments } from "@/types/collection";
import { createCollection, getCollections, deleteCollection } from "@/lib/api/collections";
import { Plus, FolderOpen, BookMarked, Scale, Lightbulb, X, Search, Calendar, Clock, User, FileText, ChevronLeft, ChevronRight, Eye, Trash2 } from "lucide-react";
import logger from "@/lib/logger";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PrimaryButton, BaseCard, DeleteConfirmationDialog, showSuccessToast, IconButton, PageContainer, GlassButton, Badge } from "@/lib/styles/components";
import { cn } from "@/lib/utils";

// Helper function to format date compactly
function formatDateCompact(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// Pagination
const ITEMS_PER_PAGE = 12;

/**
 * Typing animation component for text
 */
function TypingText({
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
    <p className={className}>
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
    </p>
  );
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function CollectionsPage() {
  const pageLogger = logger.child('CollectionsPage');
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionWithDocuments[]>([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Track pending deletions (collections that will be actually deleted when toast expires)
  const [pendingDeletions, setPendingDeletions] = useState<Map<string, { collection: CollectionWithDocuments }>>(new Map());
  // Track cancelled deletions (persists across renders)
  const cancelledDeletionsRef = useRef<Set<string>>(new Set());

  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created' | 'updated' | 'name'>('created');
  const [currentPage, setCurrentPage] = useState(1);

  const loadCollections = useCallback(async (): Promise<void> => {
    pageLogger.debug('Loading collections');
    try {
      const data = await getCollections();
      pageLogger.info('Collections loaded successfully', {
        count: data.length,
        collections: data.map(c => ({ id: c.id, name: c.name, documentCount: c.documents.length }))
      });
      setCollections(data);
    } catch (error) {
      pageLogger.error('Failed to load collections', error, { context: 'loadCollections' });
    } finally {
      setIsLoading(false);
      pageLogger.debug('Loading state set to false');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pageLogger.info('CollectionsPage mounted');
    loadCollections();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset page when search/sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy]);

  // Filter collections by search query
  const filteredCollections = useMemo(() => {
    const visibleCollections = collections.filter(c => !pendingDeletions.has(c.id));
    if (!searchQuery.trim()) return visibleCollections;
    const query = searchQuery.toLowerCase().trim();
    return visibleCollections.filter(
      (collection) =>
        collection.name.toLowerCase().includes(query) ||
        (collection.description?.toLowerCase().includes(query) ?? false)
    );
  }, [collections, searchQuery, pendingDeletions]);

  // Sort collections
  const sortedCollections = useMemo(() => {
    return [...filteredCollections].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      const dateA = new Date(sortBy === 'created' ? a.created_at : a.updated_at).getTime();
      const dateB = new Date(sortBy === 'created' ? b.created_at : b.updated_at).getTime();
      return dateB - dateA; // Descending order (newest first)
    });
  }, [filteredCollections, sortBy]);

  // Pagination
  const totalPages = Math.ceil(sortedCollections.length / ITEMS_PER_PAGE);
  const paginatedCollections = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedCollections.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedCollections, currentPage]);

  const handleCreateCollection = async (): Promise<void> => {
    if (!newCollectionName.trim()) {
      pageLogger.warn('Attempted to create collection with empty name');
      return;
    }

    pageLogger.info('Creating new collection', { name: newCollectionName });
    setIsCreating(true);
    try {
      const newCollection = await createCollection({
        name: newCollectionName,
        description: newCollectionDescription || undefined
      });
      pageLogger.info('Collection created successfully', {
        id: newCollection.id,
        name: newCollection.name,
        totalCollections: collections.length + 1
      });
      setCollections([...collections, { ...newCollection, documents: [] }]);
      setNewCollectionName("");
      setNewCollectionDescription("");
      setIsDialogOpen(false);
    } catch (error) {
      pageLogger.error('Failed to create collection', error, {
        name: newCollectionName,
        context: 'handleCreateCollection'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteCollection = (id: string): void => {
    setCollectionToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteCollection = async (): Promise<void> => {
    if (!collectionToDelete || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      // Store collection data for undo
      const collectionToRestore = collections.find(c => c.id === collectionToDelete);

      if (!collectionToRestore) {
        setIsDeleting(false);
        setDeleteDialogOpen(false);
        setCollectionToDelete(null);
        return;
      }

      // Close dialog immediately
      setDeleteDialogOpen(false);
      const collectionIdToDelete = collectionToDelete;
      setCollectionToDelete(null);
      setIsDeleting(false);

      // Remove from UI immediately (add to pending deletions)
      setPendingDeletions(prev => {
        const next = new Map(prev);
        next.set(collectionIdToDelete, { collection: collectionToRestore });
        return next;
      });

      // Function to actually delete from database
      const performActualDeletion = async (): Promise<void> => {
        // Check if this specific deletion was cancelled
        if (cancelledDeletionsRef.current.has(collectionIdToDelete)) {
          // Remove from cancelled set
          cancelledDeletionsRef.current.delete(collectionIdToDelete);
          // Remove from pending deletions (it was restored)
          setPendingDeletions(prev => {
            const next = new Map(prev);
            next.delete(collectionIdToDelete);
            return next;
          });
          return; // Don't delete if undo was clicked
        }

        try {
          // Actually delete from database
          await deleteCollection(collectionIdToDelete);
          // Remove from pending deletions AND from collections state
          setPendingDeletions(prev => {
            const next = new Map(prev);
            if (next.has(collectionIdToDelete)) {
              next.delete(collectionIdToDelete);
            }
            return next;
          });
          // Also remove from collections state to ensure consistency
          setCollections(prev => prev.filter(c => c.id !== collectionIdToDelete));
          pageLogger.info('Collection deleted successfully', {
            deletedId: collectionIdToDelete
          });
        } catch (error) {
          pageLogger.error('Failed to delete collection', error, {
            id: collectionIdToDelete,
            context: 'performActualDeletion'
          });
          // If deletion fails, restore the collection in UI
          setPendingDeletions(prev => {
            const next = new Map(prev);
            next.delete(collectionIdToDelete);
            return next;
          });
        }
      };

      // Show toast with undo option
      const toastDuration = 5000; // 5 seconds
      const collectionName = collectionToRestore.name;
      showSuccessToast({
        title: "Collection deleted",
        description: (
          <>
            The collection has been deleted.
            <br />
            <span className="font-semibold text-foreground">&quot;{collectionName}&quot;</span>
          </>
        ),
        secondaryAction: {
          label: "Undo",
          onClick: async () => {
            // Mark this specific deletion as cancelled
            cancelledDeletionsRef.current.add(collectionIdToDelete);

            // Restore collection in UI
            setPendingDeletions(prev => {
              const next = new Map(prev);
              next.delete(collectionIdToDelete);
              return next;
            });
          },
        },
        icon: null, // No icon for delete toast
        duration: toastDuration,
        onDismiss: performActualDeletion, // Trigger actual deletion when toast is dismissed
      });
    } catch (error) {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setCollectionToDelete(null);
      pageLogger.error('Error in confirmDeleteCollection', error);
    }
  };

  const handleCardClick = (collectionId: string) => {
    router.push(`/collections/${collectionId}`);
  };

  if (isLoading) {
    return (
      <PageContainer width="standard" fillViewport>
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 max-w-4xl">
              <div className="mb-4">
                <div className="h-10 w-64 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-lg animate-pulse mb-2"></div>
                <div className="h-1 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full animate-pulse"></div>
              </div>
              <div className="space-y-3">
                <div className="h-5 w-full max-w-2xl bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
                <div className="h-5 w-3/4 max-w-xl bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
              </div>
            </div>
            <div className="h-9 w-32 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-md animate-pulse"></div>
          </div>
        </div>

        {/* Collection cards skeleton - Grid layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="min-h-[260px] p-5 rounded-xl bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50"
            >
              <div className="flex flex-col gap-2 mb-3">
                <div className="h-6 w-3/4 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
                <div className="h-5 w-20 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full animate-pulse"></div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="h-4 w-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
                <div className="h-4 w-2/3 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
              </div>
              <div className="mt-auto space-y-2">
                <div className="h-4 w-24 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
                <div className="h-4 w-28 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </PageContainer>
    );
  }

  const visibleCollections = collections.filter(collection => !pendingDeletions.has(collection.id));

  return (
    <PageContainer width="standard" fillViewport className="py-6">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex-1 max-w-3xl">
            <TypingText
              text="Organize legal documents into focused collections for case analysis, research, and compliance."
              className="text-sm md:text-base text-muted-foreground"
            />
          </div>
          <div className="shrink-0">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <GlassButton
                  className="w-auto shrink-0 h-9 px-6"
                >
                  <Plus className="h-4 w-4" />
                  New Collection
                </GlassButton>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] [&>button:last-child]:hidden">
              {/* Custom close button using reusable IconButton */}
              <DialogPrimitive.Close asChild>
                <IconButton
                  icon={X}
                  onClick={() => setIsDialogOpen(false)}
                  variant="muted"
                  size="md"
                  aria-label="Close"
                  className="absolute top-4 right-4 z-50 !h-10 !w-10 !p-2"
                />
              </DialogPrimitive.Close>
              <DialogHeader className="space-y-2">
                <DialogTitle className="text-2xl font-bold bg-gradient-to-br from-foreground via-primary to-primary bg-clip-text text-transparent">
                  Create Research Collection
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                  Create a focused folder to organize documents for your research topic, case, or project.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Collection Name <span className="text-destructive">*</span>
                    <span className="sr-only"> (required)</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g., Tax Fraud Cases 2024, VAT Interpretation Analysis"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCollectionName.trim()) {
                        handleCreateCollection();
                      }
                    }}
                    className="border-slate-200/50 dark:border-slate-800/50 focus:border-primary/30 focus:ring-2 focus:ring-primary/20 hover:border-primary/20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md shadow-lg hover:shadow-xl rounded-xl transition-all duration-300"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the purpose of this collection, research questions, or scope..."
                    value={newCollectionDescription}
                    onChange={(e) => setNewCollectionDescription(e.target.value)}
                    rows={3}
                    className="border-slate-200/50 dark:border-slate-800/50 focus:border-primary/30 focus:ring-2 focus:ring-primary/20 hover:border-primary/20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md shadow-lg hover:shadow-xl rounded-xl transition-all duration-300 resize-none"
                  />
                </div>

                {/* Use case examples */}
                <div className="border-t pt-4">
                  <p className="text-xs font-medium mb-2 flex items-center gap-1.5 text-muted-foreground">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                    Example Use Cases:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-5 list-disc">
                    <li>Tax law precedents for ongoing litigation</li>
                    <li>Regulatory interpretations on specific topics</li>
                    <li>Comparative case law analysis</li>
                    <li>Client matter document repository</li>
                  </ul>
                </div>

                <PrimaryButton
                  onClick={handleCreateCollection}
                  disabled={isCreating || !newCollectionName.trim()}
                  isLoading={isCreating}
                  loadingText="Creating..."
                  className="w-full"
                >
                  Create Collection
                </PrimaryButton>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Search Bar - Only show when there are collections */}
        {visibleCollections.length > 0 && (
          <div className="space-y-3">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search collections by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "w-full pl-10 pr-10 h-12",
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
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-foreground/70">
                {searchQuery ? (
                  <>
                    Found <span className="text-foreground font-semibold">{sortedCollections.length}</span> matching collection{sortedCollections.length !== 1 ? 's' : ''}
                  </>
                ) : (
                  <>
                    <span className="text-foreground font-semibold">{visibleCollections.length}</span> collection{visibleCollections.length !== 1 ? 's' : ''} total
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'created' | 'updated' | 'name')}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-foreground"
                >
                  <option value="created">Created</option>
                  <option value="updated">Updated</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Empty state or no search results */}
      {sortedCollections.length === 0 ? (
        searchQuery ? (
          <EmptyState
            title="No Matching Collections"
            description={`No collections found matching "${searchQuery}". Try a different search term.`}
            icon={Search}
            variant="default"
            primaryAction={{
              label: "Clear Search",
              onClick: () => setSearchQuery(''),
              icon: X,
            }}
          />
        ) : (
          <EmptyState
            icon={FolderOpen}
            title="No Research Collections Yet"
            description="Create your first collection to start organizing legal documents for your research, cases, or projects."
            tipPosition="below"
            primaryAction={{
              label: "Create Your First Collection",
              onClick: () => setIsDialogOpen(true),
              icon: Plus,
              size: "lg"
            }}
            tip={
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto text-left">
                <BaseCard
                  variant="light"
                  className="rounded-2xl"
                >
                  <div className="-m-1.5 p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Scale className="h-6 w-6 text-primary" />
                      </div>
                      <span className="text-base font-semibold">Case Analysis</span>
                    </div>
                    <p className="text-base text-muted-foreground leading-relaxed">Collect relevant judgments and precedents for ongoing litigation or case preparation.</p>
                  </div>
                </BaseCard>
                <BaseCard
                  variant="light"
                  className="rounded-2xl"
                >
                  <div className="-m-1.5 p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <BookMarked className="h-6 w-6 text-primary" />
                      </div>
                      <span className="text-base font-semibold">Topic Research</span>
                    </div>
                    <p className="text-base text-muted-foreground leading-relaxed">Build comprehensive document sets on specific legal topics or regulatory areas.</p>
                  </div>
                </BaseCard>
                <BaseCard
                  variant="light"
                  className="rounded-2xl"
                >
                  <div className="-m-1.5 p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <FolderOpen className="h-6 w-6 text-primary" />
                      </div>
                      <span className="text-base font-semibold">Client Matters</span>
                    </div>
                    <p className="text-base text-muted-foreground leading-relaxed">Organize all relevant documents for specific clients or matter files.</p>
                  </div>
                </BaseCard>
              </div>
            }
          />
        )
      ) : (
        <>
          {/* Collection Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
            {paginatedCollections.map((collection) => {
              const docCount = collection.documents.length;

              return (
                <div
                  key={collection.id}
                  onClick={() => handleCardClick(collection.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCardClick(collection.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "group relative",
                    "flex flex-col",
                    "min-h-[260px]",
                    "p-5 rounded-xl",
                    "bg-white/60 dark:bg-slate-800/60",
                    "backdrop-blur-sm",
                    "border border-slate-200/50 dark:border-slate-700/50",
                    "shadow-sm hover:shadow-lg hover:shadow-primary/20",
                    "hover:border-primary/50 hover:scale-[1.02]",
                    "transition-all duration-300",
                    "cursor-pointer",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  )}
                  aria-label={`Collection: ${collection.name}. ${docCount} documents. Click to open.`}
                >
                  {/* Header */}
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                        <FolderOpen className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground line-clamp-2 leading-tight">
                        {collection.name}
                      </h3>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs px-2 py-0.5">
                        <FileText className="h-3 w-3 mr-1" />
                        {docCount} document{docCount !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="flex-1 min-h-0 mb-4">
                    <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                      {collection.description || 'No description provided'}
                    </p>
                  </div>

                  {/* Metadata Footer */}
                  <div className="flex flex-col gap-3 mt-auto">
                    {/* Metadata */}
                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>Created: {formatDateCompact(collection.created_at)}</span>
                      </div>
                      {collection.updated_at && collection.updated_at !== collection.created_at && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>Updated: {formatDateCompact(collection.updated_at)}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons - Revealed on hover */}
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCardClick(collection.id);
                        }}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1.5",
                          "px-3 py-2 rounded-lg text-xs font-medium",
                          "bg-primary/10 hover:bg-primary/20 text-primary",
                          "transition-colors duration-200"
                        )}
                        aria-label="Open collection"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Open
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCollection(collection.id);
                        }}
                        className={cn(
                          "flex items-center justify-center",
                          "px-3 py-2 rounded-lg text-xs font-medium",
                          "bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50",
                          "text-red-600 dark:text-red-400",
                          "transition-colors duration-200"
                        )}
                        aria-label="Delete collection"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

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
                      <div key={page} className="flex items-center">
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
                      </div>
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
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, sortedCollections.length)} of {sortedCollections.length} collections
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Collection"
        itemName="collection"
        itemTitle={collectionToDelete ? collections.find(c => c.id === collectionToDelete)?.name : undefined}
        isDeleting={isDeleting}
        onConfirm={confirmDeleteCollection}
      />
    </PageContainer>
  );
}
