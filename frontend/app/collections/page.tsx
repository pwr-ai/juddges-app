"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CollectionWithDocuments } from "@/types/collection";
import { createCollection, getCollections, deleteCollection } from "@/lib/api/collections";
import { Plus, FolderOpen, BookMarked, Scale, Lightbulb, X, Search, Calendar, Clock, User, FileText, Eye, Trash2 } from "lucide-react";
import logger from "@/lib/logger";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, DeleteConfirmationDialog, PageContainer } from "@/lib/styles/components";
import { EditorialCard, EditorialCardSkeleton, EditorialPagination, Eyebrow, Headline } from "@/components/editorial";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
 if (!searchQuery.trim()) return collections;
 const query = searchQuery.toLowerCase().trim();
 return collections.filter(
 (collection) =>
 collection.name.toLowerCase().includes(query) ||
 (collection.description?.toLowerCase().includes(query) ?? false)
 );
 }, [collections, searchQuery]);

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
 const message = error instanceof Error ? error.message : 'Failed to create collection';
 toast.error(message);
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

 const id = collectionToDelete;
 const collectionToRestore = collections.find(c => c.id === id);

 setDeleteDialogOpen(false);
 setCollectionToDelete(null);

 if (!collectionToRestore) {
 return;
 }

 setIsDeleting(true);
 // Optimistic remove; rollback on error.
 const snapshot = collections;
 setCollections(prev => prev.filter(c => c.id !== id));

 try {
 await deleteCollection(id);
 pageLogger.info('Collection deleted successfully', { deletedId: id });
 toast.success("Collection deleted", {
   description: `"${collectionToRestore.name}"`,
 });
 } catch (error) {
 pageLogger.error('Failed to delete collection', error, {
 id,
 context: 'confirmDeleteCollection',
 });
 setCollections(snapshot);
 toast.error('Failed to delete collection');
 } finally {
 setIsDeleting(false);
 }
 };

 const handleCardClick = (collectionId: string) => {
 router.push(`/collections/${collectionId}`);
 };

 if (isLoading) {
 return (
 <PageContainer width="standard"fillViewport>
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 max-w-4xl space-y-3">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-5 w-full max-w-2xl" />
            <Skeleton className="h-5 w-3/4 max-w-xl" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* Collection cards skeleton - Grid layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <EditorialCardSkeleton
            key={i}
            minHeight="260px"
          />
        ))}
      </div>
 </PageContainer>
 );
 }

 const visibleCollections = collections;

  return (
    <PageContainer width="standard" fillViewport className="py-6">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex-1 max-w-3xl">
            <Eyebrow>Research</Eyebrow>
            <Headline as="h1" className="mt-1">
              Collections
            </Headline>
            <p className="text-sm text-ink-soft mt-1">
              Organize legal documents into focused collections for case analysis, research, and compliance.
            </p>
          </div>
          <div className="shrink-0">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep font-mono text-xs gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Collection
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] [&>button:last-child]:hidden rounded-none border-rule bg-parchment">
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    onClick={() => setIsDialogOpen(false)}
                    aria-label="Close"
                    className="absolute top-4 right-4 p-1.5 text-ink-soft hover:text-ink transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </DialogPrimitive.Close>
                <DialogHeader className="space-y-2">
                  <DialogTitle className="font-serif text-xl font-semibold text-ink">
                    Create Research Collection
                  </DialogTitle>
                  <DialogDescription className="text-xs text-ink-soft leading-relaxed">
                    Create a focused folder to organize documents for your research topic, case, or project.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-xs font-mono text-ink">
                      Collection Name <span className="text-oxblood">*</span>
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
                      className="rounded-none border-rule bg-parchment text-ink focus-visible:border-ink font-sans text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-xs font-mono text-ink">Description (optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="Describe the purpose of this collection, research questions, or scope..."
                      value={newCollectionDescription}
                      onChange={(e) => setNewCollectionDescription(e.target.value)}
                      rows={3}
                      className="rounded-none border-rule bg-parchment text-ink focus-visible:border-ink font-sans text-sm resize-none"
                    />
                  </div>

                  {/* Use case examples */}
                  <div className="border-t border-rule pt-4">
                    <p className="text-xs font-mono mb-2 flex items-center gap-1.5 text-ink-soft">
                      <Lightbulb className="h-3.5 w-3.5 text-gold shrink-0" />
                      Example Use Cases:
                    </p>
                    <ul className="text-xs text-ink-soft space-y-1 ml-5 list-disc font-sans">
                      <li>Appellate judgments relevant to an ongoing dispute</li>
                      <li>Case law grouped by doctrine or procedural issue</li>
                      <li>Comparative case law analysis</li>
                      <li>Client matter document repository</li>
                    </ul>
                  </div>

                  <Button
                    onClick={handleCreateCollection}
                    disabled={isCreating || !newCollectionName.trim()}
                    className="w-full rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep font-mono text-xs"
                  >
                    {isCreating ? "Creating..." : "Create Collection"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search Bar - Only show when there are collections */}
        {visibleCollections.length > 0 && (
          <div className="space-y-3">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
              <Input
                type="search"
                placeholder="Search collections by name or description..."
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
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono text-ink-soft">
                {searchQuery ? (
                  <>
                    Found <span className="text-ink font-semibold">{sortedCollections.length}</span> matching collection{sortedCollections.length !== 1 ? 's' : ''}
                  </>
                ) : (
                  <>
                    <span className="text-ink font-semibold">{visibleCollections.length}</span> collection{visibleCollections.length !== 1 ? 's' : ''} total
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-ink-soft">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'created' | 'updated' | 'name')}
                  className="text-xs font-mono px-2 py-1 rounded-none border border-rule bg-parchment text-ink focus-visible:border-ink"
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
              size: "lg",
            }}
            tip={
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto text-left">
                <EditorialCard flat className="p-6 border-rule">
                  <div className="flex items-center gap-3 mb-3">
                    <Scale className="h-5 w-5 text-oxblood shrink-0" />
                    <span className="text-base font-serif font-semibold text-ink">Case Analysis</span>
                  </div>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    Collect relevant judgments and precedents for ongoing litigation or case preparation.
                  </p>
                </EditorialCard>
                <EditorialCard flat className="p-6 border-rule">
                  <div className="flex items-center gap-3 mb-3">
                    <BookMarked className="h-5 w-5 text-oxblood shrink-0" />
                    <span className="text-base font-serif font-semibold text-ink">Topic Research</span>
                  </div>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    Build comprehensive document sets on specific legal topics or regulatory areas.
                  </p>
                </EditorialCard>
                <EditorialCard flat className="p-6 border-rule">
                  <div className="flex items-center gap-3 mb-3">
                    <FolderOpen className="h-5 w-5 text-oxblood shrink-0" />
                    <span className="text-base font-serif font-semibold text-ink">Client Matters</span>
                  </div>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    Organize all relevant documents for specific clients or matter files.
                  </p>
                </EditorialCard>
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
                <EditorialCard
                  key={collection.id}
                  flat
                  clickable
                  onClick={() => handleCardClick(collection.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCardClick(collection.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="p-5 flex flex-col min-h-[250px] group cursor-pointer"
                  aria-label={`Collection: ${collection.name}. ${docCount} documents. Click to open.`}
                >
                  {/* Header */}
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="flex items-start gap-2.5">
                      <FolderOpen className="h-5 w-5 text-oxblood shrink-0 mt-0.5" />
                      <h3 className="text-base font-serif font-semibold text-ink group-hover:text-oxblood line-clamp-2 leading-tight transition-colors">
                        {collection.name}
                      </h3>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink">
                        <FileText className="h-3 w-3" />
                        {docCount} document{docCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="flex-1 min-h-0 mb-4">
                    <p className="text-xs text-ink-soft line-clamp-3 leading-relaxed">
                      {collection.description || 'No description provided'}
                    </p>
                  </div>

                  {/* Metadata Footer */}
                  <div className="flex flex-col gap-3 mt-auto">
                    <div className="flex flex-col gap-1 text-[11px] font-mono text-ink-soft">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>Created: {formatDateCompact(collection.created_at)}</span>
                      </div>
                      {collection.updated_at && collection.updated_at !== collection.created_at && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>Updated: {formatDateCompact(collection.updated_at)}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons - Revealed on hover */}
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pt-2 border-t border-rule">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCardClick(collection.id);
                        }}
                        className="flex-1 rounded-none border-rule text-ink font-mono text-xs hover:border-ink hover:bg-parchment-deep"
                        aria-label="Open collection"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Open
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCollection(collection.id);
                        }}
                        className="rounded-none border-rule text-oxblood font-mono text-xs hover:border-oxblood hover:bg-parchment-deep"
                        aria-label="Delete collection"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </EditorialCard>
              );
            })}
          </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
      <EditorialPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => setCurrentPage(page)}
        totalItems={sortedCollections.length}
        itemsPerPage={ITEMS_PER_PAGE}
        itemLabel="collections"
      />
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
