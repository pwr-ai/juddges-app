/**
 * Save to Collection Popover Component
 * Reusable popover component for saving documents to collections
 * Follows design system styling with popover background and dropdown-styled select
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search, X, Folder, Plus, Check } from "lucide-react";
import { getCollections, addDocumentToCollection, createCollection } from "@/lib/api/collections";
import { CollectionWithDocuments } from "@/types/collection";
import { SearchDocument } from "@/types/search";
import { VariantButton, showSuccessToast } from "@/lib/styles/components";
import { ModalSaveButton } from "@/lib/styles/components/modal-save-button";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

export interface SaveToCollectionPopoverProps {
  /** Documents to save */
  documents?: SearchDocument[];
  /** Whether all search results are being saved */
  isAllResults?: boolean;
  /** Callback when popover is closed */
  onClose?: () => void;
  /** Custom navigation handler */
  onNavigate?: (collectionId: string, action: 'view' | 'extract') => void;
  /** Optional className for the container */
  className?: string;
  /** Callback to clear selection after successful save (for selected documents only) */
  onClearSelection?: () => void;
}

/**
 * Save to Collection Popover Component
 *
 * A reusable popover component for saving documents to collections.
 * Uses popover-style background (not card style) and dropdown-styled select.
 *
 * @example
 * ```tsx
 * <SaveToCollectionPopover
 *   documents={[document]}
 *   onClose={() => setIsOpen(false)}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <SaveToCollectionPopover
 *   documents={documents}
 *   isAllResults={true}
 *   onNavigate={(collectionId, action) => {
 *     if (action === 'view') {
 *       router.push(`/collections/${collectionId}`);
 *     }
 *   }}
 * />
 * ```
 */
export function SaveToCollectionPopover({
  documents = [],
  isAllResults = false,
  onClose,
  onNavigate,
  className,
  onClearSelection,
}: SaveToCollectionPopoverProps): React.JSX.Element {
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionWithDocuments[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const fetchCollections = async (): Promise<void> => {
      try {
        const collections = await getCollections();
        setCollections(collections);
        if (collections.length > 0) {
          setSelectedCollection(collections[0].id);
        }
      } catch (error) {
        toast.error(`Failed to fetch collections: ${error}`);
      } finally {
        setLoading(false);
      }
    };

    fetchCollections();
  }, []);

  const handleNavigate = (action: 'view' | 'extract'): void => {
    if (onNavigate) {
      onNavigate(selectedCollection, action);
    } else {
      if (action === 'view') {
        router.push(`/collections/${selectedCollection}`);
        router.refresh(); // Force refresh to show newly added documents
      } else {
        router.push(`/extract?collection=${selectedCollection}`);
      }
    }
    onClose?.();
  };

  const handleSave = async (): Promise<void> => {
    if (!selectedCollection) {
      toast.error("Please select a collection");
      return;
    }

    if (documents.length === 0) {
      toast.error("No documents to save");
      return;
    }

    setSaving(true);
    try {
      // Track successful saves
      let successCount = 0;

      // Save all documents passed in (whether selected or all results)
      const docsToSave = documents;

      // Use Promise.all for better performance
      const results = await Promise.allSettled(
        docsToSave.map(doc => addDocumentToCollection(selectedCollection, doc))
      );

      // Count successful operations
      successCount = results.filter(result => result.status === 'fulfilled').length;

      if (successCount > 0) {
        // Clear selection if this is for selected documents (not all results)
        if (!isAllResults) {
          onClearSelection?.();
        }

        showSuccessToast({
          title: "Success",
          description: `${successCount} document${successCount > 1 ? 's' : ''} saved to collection`,
          primaryAction: {
            label: "View Collection",
            onClick: () => handleNavigate('view'),
          },
          secondaryAction: {
            label: "Start Extraction",
            onClick: () => handleNavigate('extract'),
          },
        });
        onClose?.();
      } else {
        toast.error("Failed to save any documents");
      }
    } catch (error) {
      logger.error("Error saving to collection: ", error);
      toast.error("Failed to save document(s) to collection");
    } finally {
      setSaving(false);
    }
  };

  // Filter collections based on search query
  const filteredCollections = collections.filter(collection =>
    collection.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateNewCollection = async (): Promise<void> => {
    if (!newCollectionName.trim()) {
      toast.error("Collection name is required");
      return;
    }

    if (documents.length === 0) {
      toast.error("No documents to save");
      return;
    }

    setIsCreating(true);
    try {
      // Create the new collection
      const newCollection = await createCollection({
        name: newCollectionName.trim(),
      });

      // Add to collections list
      const collectionWithDocuments: CollectionWithDocuments = {
        ...newCollection,
        documents: [],
      };

      setCollections([...collections, collectionWithDocuments]);
      setSelectedCollection(newCollection.id);
      setNewCollectionName("");
      setIsCreatingNew(false);

      // Automatically add documents to the newly created collection
      // Save all documents passed in (whether selected or all results) - consistent with handleSave
      let successCount = 0;
      const docsToSave = documents;

      // Use Promise.all for better performance
      const results = await Promise.allSettled(
        docsToSave.map(doc => addDocumentToCollection(newCollection.id, doc))
      );

      // Count successful operations
      successCount = results.filter(result => result.status === 'fulfilled').length;

      if (successCount > 0) {
        // Clear selection if this is for selected documents (not all results)
        if (!isAllResults) {
          onClearSelection?.();
        }

        showSuccessToast({
          title: "Success",
          description: `Collection created and ${successCount} document${successCount > 1 ? 's' : ''} saved`,
          primaryAction: {
            label: "View Collection",
            onClick: () => {
              if (onNavigate) {
                onNavigate(newCollection.id, 'view');
              } else {
                router.push(`/collections/${newCollection.id}`);
                router.refresh();
              }
              onClose?.();
            },
          },
          secondaryAction: {
            label: "Start Extraction",
            onClick: () => {
              if (onNavigate) {
                onNavigate(newCollection.id, 'extract');
              } else {
                router.push(`/extract?collection=${newCollection.id}`);
              }
              onClose?.();
            },
          },
        });
        onClose?.();
      } else {
        // Collection was created but documents failed to save
        toast.warning("Collection created but failed to save documents");
      }
    } catch (error) {
      logger.error("Error creating collection: ", error);
      toast.error("Failed to create collection");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className={cn(
        "w-[360px] rounded-none",
        "bg-parchment",
        "border border-rule",
        "shadow-md",
        "p-4",
        className
      )}
      role="dialog"
      aria-label="Save documents to collection"
    >
      {/* II. The Header */}
      <div className="relative flex items-center justify-between mb-4">
        <h3 className="text-base font-serif font-medium text-ink">
          {isAllResults ? `Save ${documents.length} documents to Registry` : "Save to Registry"}
        </h3>
        {/* Close Button */}
        <button
          onClick={onClose}
          className={cn(
            "w-7 h-7 rounded-none flex items-center justify-center",
            "transition-colors duration-150",
            "bg-transparent text-ink-soft",
            "hover:bg-parchment-deep hover:text-ink"
          )}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8" aria-busy="true" aria-label="Loading collections">
          <Loader2 className="h-5 w-5 animate-spin text-ink-soft" />
        </div>
      ) : collections.length === 0 ? (
        <p className="text-xs font-mono text-ink-soft mb-3">
          No collections available. Create one in the Collections section.
        </p>
      ) : (
        <>
          {/* III. The Search Input */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-soft pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search collections..."
              className={cn(
                "w-full h-9 pl-9 pr-3 rounded-none",
                "bg-parchment",
                "border border-rule",
                "text-xs font-mono text-ink",
                "transition-colors duration-150",
                "focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink",
                "placeholder:text-ink-soft"
              )}
            />
          </div>

          {/* IV. The Collection List */}
          <div className="space-y-1 mb-4 max-h-[280px] overflow-y-auto">
            {/* Existing Collections */}
            {filteredCollections.map((collection) => {
              const isSelected = selectedCollection === collection.id;
              return (
                <button
                  key={collection.id}
                  onClick={() => setSelectedCollection(collection.id)}
                  className={cn(
                    "w-full h-9 px-3 rounded-none flex items-center justify-between text-left text-xs font-mono",
                    "transition-colors duration-150",
                    !isSelected && "text-ink hover:bg-parchment-deep",
                    isSelected && "bg-parchment-deep border-l-2 border-l-oxblood border-rule text-ink font-semibold"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Folder className="h-3.5 w-3.5 text-ink-soft" />
                    <span className="truncate">{collection.name}</span>
                  </div>
                  {isSelected && (
                    <Check className="h-4 w-4 text-oxblood stroke-[2]" />
                  )}
                </button>
              );
            })}

            {/* Create New Row */}
            {!isCreatingNew ? (
              <button
                onClick={() => setIsCreatingNew(true)}
                className={cn(
                  "w-full h-9 px-3 rounded-none flex items-center gap-2 text-xs font-mono",
                  "border border-dashed border-rule",
                  "bg-transparent text-ink-soft",
                  "transition-colors duration-150",
                  "hover:bg-parchment-deep hover:text-ink hover:border-ink"
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create New Collection</span>
              </button>
            ) : (
              <div className="w-full">
                <div className="relative flex items-center gap-2">
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateNewCollection();
                      } else if (e.key === 'Escape') {
                        setIsCreatingNew(false);
                        setNewCollectionName("");
                      }
                    }}
                    placeholder="Collection name..."
                    autoFocus
                    className={cn(
                      "flex-1 h-9 px-3 rounded-none",
                      "bg-parchment",
                      "border border-rule",
                      "text-xs font-mono text-ink",
                      "placeholder:text-ink-soft",
                      "transition-colors duration-150",
                      "focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink"
                    )}
                  />
                  <button
                    onClick={handleCreateNewCollection}
                    disabled={!newCollectionName.trim() || isCreating}
                    className={cn(
                      "h-9 px-3 rounded-none",
                      "bg-oxblood text-parchment text-xs font-mono uppercase tracking-wider font-semibold",
                      "border-none cursor-pointer",
                      "hover:bg-oxblood-deep",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "transition-colors duration-150",
                      "flex items-center justify-center gap-1.5",
                      "whitespace-nowrap"
                    )}
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Adding...</span>
                      </>
                    ) : (
                      "Add"
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button
                    onClick={() => {
                      setIsCreatingNew(false);
                      setNewCollectionName("");
                    }}
                    className={cn(
                      "px-2.5 py-1 text-xs font-mono rounded-none",
                      "text-ink-soft hover:text-ink",
                      "hover:bg-parchment-deep",
                      "transition-colors duration-150"
                    )}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* V. The Footer - Primary Action */}
          <div className="flex justify-end gap-2 pt-3 border-t border-rule">
            <VariantButton intent="secondary"
              size="sm"
              onClick={onClose}
              className="h-11 px-6"
              aria-label="Cancel saving to collection"
            >
              Cancel
            </VariantButton>
            <ModalSaveButton
              onClick={handleSave}
              disabled={saving || documents.length === 0 || !selectedCollection}
              isLoading={saving}
              aria-label={`Save ${documents.length} document${documents.length !== 1 ? 's' : ''} to collection`}
            >
              Save
            </ModalSaveButton>
          </div>
        </>
      )}
    </div>
  );
}
